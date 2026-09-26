import type { Pose } from '../pose/types'
import { ClimbTracker, type ClimbSnapshot } from './climb'
import { GaitTracker, deriveSignals, type GaitSignal, type GaitSnapshot } from './gait'

export type Sport = 'running' | 'climbing'
export type MovementSnapshot = GaitSnapshot | ClimbSnapshot
export type MovementSignal = GaitSignal

export interface MovementTracker {
  update(timeSec: number, pose: Pose | null, width: number, height: number): MovementSnapshot
}

/** How a metric improves, so a proof run can say whether a change helped. */
export type Better = 'higher' | 'lower' | { target: number } | 'neutral'

export interface MetricReading {
  id: string
  label: string
  value: number | null
  unit: string
  hint: string
  better: Better
}

export interface Readout {
  sport: Sport
  events: number
  metrics: MetricReading[]
  signals: MovementSignal[]
  ready: boolean
}

export const MIN_EVENTS = 6

export const SPORTS: Record<
  Sport,
  { label: string; events: string; gear: string; channel: string; clipHint: string; dropHint: string }
> = {
  running: {
    label: 'Running',
    events: 'footfalls',
    gear: 'running shoe',
    channel: 'SAGITTAL / SIDE-ON',
    clipHint: 'Best results: side-on, whole body in frame, 10 seconds on a treadmill or flat path.',
    dropHint: 'DROP A RUNNING CLIP ON THE SCREEN, OR PRESS LOAD CLIP.',
  },
  climbing: {
    label: 'Climbing',
    events: 'foot placements',
    gear: 'climbing shoe',
    channel: 'WALL / SIDE OR BEHIND',
    clipHint: 'Best results: whole body in frame, camera still, 20–40 seconds of one problem or route.',
    dropHint: 'DROP A CLIMBING CLIP ON THE SCREEN, OR PRESS LOAD CLIP.',
  },
}

export function createTracker(sport: Sport, heightCm: number): MovementTracker {
  return sport === 'running' ? new GaitTracker(heightCm) : new ClimbTracker(heightCm)
}

function deriveClimbSignals(s: ClimbSnapshot): MovementSignal[] {
  const signals: MovementSignal[] = []
  if (s.quietFeetPct !== null) {
    const busy = s.quietFeetPct < 75
    signals.push({
      id: 'feet',
      label: busy ? 'Busy feet' : 'Quiet feet',
      detail: busy
        ? 'Re-adjusting on holds: a snug, precise shoe gives more feedback'
        : 'Feet stick first time: comfort can take priority',
      flagged: busy,
    })
  }
  if (s.avgToeDownDeg !== null) {
    const edging = s.avgToeDownDeg > 20
    signals.push({
      id: 'toe',
      label: edging ? 'Edging on the toes' : 'Flat-foot smearing',
      detail: edging
        ? 'Weight on small edges: favour a downturned, stiffer toe box'
        : 'Weight on friction: favour a flatter, softer shoe for smears',
      flagged: edging,
    })
  }
  if (s.hipOffsetCm !== null) {
    const off = s.hipOffsetCm > 25
    signals.push({
      id: 'hips',
      label: off ? 'Hips off the wall' : 'Hips close to the wall',
      detail: off
        ? 'Weight hangs on your arms: a stiffer sole helps you stand on small holds'
        : 'Good body position: softer, sensitive shoes will reward it',
      flagged: off,
    })
  }
  if (s.avgReachElbowDeg !== null) {
    const bent = s.avgReachElbowDeg < 140
    signals.push({
      id: 'arms',
      label: bent ? 'Bent-arm hanging' : 'Straight-arm hanging',
      detail: bent ? 'Pulling rather than hanging: a technique note, not a shoe issue' : 'Efficient: saving forearm strength',
      flagged: bent,
    })
  }
  return signals
}

export function readoutOf(snapshot: MovementSnapshot | null, sport: Sport): Readout {
  if (!snapshot || snapshot.sport !== sport) {
    return { sport, events: 0, metrics: emptyMetrics(sport), signals: [], ready: false }
  }
  if (snapshot.sport === 'running') {
    const ready = snapshot.totalStrikes >= MIN_EVENTS
    return {
      sport,
      events: snapshot.totalStrikes,
      ready,
      signals: ready ? deriveSignals(snapshot) : [],
      metrics: [
        { id: 'cadence', label: 'Cadence', value: snapshot.cadenceSpm, unit: 'spm', hint: 'Target 170–180', better: { target: 175 } },
        { id: 'overstride', label: 'Overstride', value: snapshot.avgOverstrideCm, unit: 'cm', hint: 'Foot ahead of hips', better: 'lower' },
        { id: 'knee', label: 'Knee @ contact', value: snapshot.avgKneeAtStrike, unit: 'deg', hint: '180 = locked straight', better: 'lower' },
        { id: 'lean', label: 'Trunk lean', value: snapshot.trunkLeanDeg, unit: 'deg', hint: 'Forward from vertical', better: { target: 7 } },
      ],
    }
  }
  const ready = snapshot.totalPlacements >= MIN_EVENTS
  return {
    sport,
    events: snapshot.totalPlacements,
    ready,
    signals: ready ? deriveClimbSignals(snapshot) : [],
    metrics: [
      { id: 'quiet', label: 'Quiet feet', value: snapshot.quietFeetPct, unit: '%', hint: 'Placed first time', better: 'higher' },
      { id: 'toe', label: 'Toe-down', value: snapshot.avgToeDownDeg, unit: 'deg', hint: '+ edging · − smearing', better: 'neutral' },
      { id: 'hips', label: 'Hip offset', value: snapshot.hipOffsetCm, unit: 'cm', hint: 'Hips from feet line', better: 'lower' },
      { id: 'reach', label: 'Reach elbow', value: snapshot.avgReachElbowDeg, unit: 'deg', hint: '180 = straight arm', better: 'higher' },
    ],
  }
}

function emptyMetrics(sport: Sport): MetricReading[] {
  const empty = readoutOf(
    sport === 'running'
      ? { sport, timeSec: 0, direction: 1, kneeAngle: {}, trunkLeanDeg: null, cadenceSpm: null, lastStrike: null, recentStrikes: [], totalStrikes: 0, avgOverstrideCm: null, avgKneeAtStrike: null }
      : { sport, timeSec: 0, elbowAngle: {}, movingFoot: null, lastPlacement: null, totalPlacements: 0, readjusts: 0, quietFeetPct: null, avgToeDownDeg: null, hipOffsetCm: null, avgReachElbowDeg: null, movesPerMin: null },
    sport,
  )
  return empty.metrics
}

export type DeltaVerdict = 'better' | 'worse' | 'same'

/** Compares a metric against a pinned baseline, using the metric's own idea of "better". */
export function compareMetric(current: MetricReading, baseline: MetricReading | undefined) {
  if (!baseline || current.value === null || baseline.value === null) return null
  const delta = current.value - baseline.value
  if (current.better === 'neutral' || Math.abs(delta) < 1) return { delta, verdict: 'same' as DeltaVerdict }
  let improved: boolean
  if (current.better === 'higher') improved = delta > 0
  else if (current.better === 'lower') improved = delta < 0
  else {
    const target = current.better.target
    improved = Math.abs(current.value - target) < Math.abs(baseline.value - target)
  }
  return { delta, verdict: (improved ? 'better' : 'worse') as DeltaVerdict }
}
