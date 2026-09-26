import type { Keypoint, Pose } from '../pose/types'

export type Side = 'left' | 'right'

interface Point {
  x: number
  y: number
}

export interface Strike {
  timeSec: number
  side: Side
  overstrideCm: number
  kneeAngle: number
  /** Normalized positions captured at contact, for drawing the overstride dimension. */
  ankle: Point
  hipX: number
}

export interface GaitSnapshot {
  sport: 'running'
  timeSec: number
  direction: 1 | -1
  kneeAngle: Partial<Record<Side, number>>
  trunkLeanDeg: number | null
  cadenceSpm: number | null
  lastStrike: Strike | null
  recentStrikes: Strike[]
  totalStrikes: number
  avgOverstrideCm: number | null
  avgKneeAtStrike: number | null
}

const MIN_SCORE = 0.5
const HISTORY_SEC = 2.5
const CADENCE_WINDOW_SEC = 6
const MIN_STEP_INTERVAL_SEC = 0.25
/** Hip-to-ankle length as a fraction of standing height (anthropometric average). */
const LEG_TO_HEIGHT = 0.49

const usable = (k?: Keypoint): k is Keypoint => !!k && k.score >= MIN_SCORE

function angleAt(a: Point, b: Point, c: Point) {
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const denom = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1
  const cos = (v1.x * v2.x + v1.y * v2.y) / denom
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI
}

const mean = (values: number[]) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null

export class GaitTracker {
  private heightCm: number
  private lastTime = -Infinity
  private directionScore = 0
  private ankleHistory: Record<Side, { t: number; y: number }[]> = { left: [], right: [] }
  private lastStrikeTime: Record<Side, number> = { left: -Infinity, right: -Infinity }
  private windowStrikes: Strike[] = []
  private allStrikes: Strike[] = []
  private lastStrike: Strike | null = null

  constructor(heightCm: number) {
    this.heightCm = heightCm
  }

  reset() {
    this.lastTime = -Infinity
    this.directionScore = 0
    this.allStrikes = []
    this.lastStrike = null
    this.resetWindow()
  }

  private resetWindow() {
    this.ankleHistory = { left: [], right: [] }
    this.lastStrikeTime = { left: -Infinity, right: -Infinity }
    this.windowStrikes = []
  }

  update(timeSec: number, pose: Pose | null, width: number, height: number): GaitSnapshot {
    // The clip looped or the user scrubbed backwards: timing-based state is no longer valid.
    if (timeSec < this.lastTime - 0.1) this.resetWindow()
    this.lastTime = timeSec

    const toPx = (k: Keypoint): Point => ({ x: k.x * width, y: k.y * height })
    const kneeAngle: Partial<Record<Side, number>> = {}
    let trunkLeanDeg: number | null = null

    if (pose) {
      this.updateDirection(pose)
      const direction = this.direction

      for (const side of ['left', 'right'] as const) {
        const hip = pose[`${side}_hip`]
        const knee = pose[`${side}_knee`]
        const ankle = pose[`${side}_ankle`]
        if (usable(hip) && usable(knee) && usable(ankle)) {
          kneeAngle[side] = angleAt(toPx(hip), toPx(knee), toPx(ankle))
        }
      }

      const { left_shoulder: ls, right_shoulder: rs, left_hip: lh, right_hip: rh } = pose
      if (usable(ls) && usable(rs) && usable(lh) && usable(rh)) {
        const shoulder = { x: ((ls.x + rs.x) / 2) * width, y: ((ls.y + rs.y) / 2) * height }
        const hip = { x: ((lh.x + rh.x) / 2) * width, y: ((lh.y + rh.y) / 2) * height }
        trunkLeanDeg =
          (Math.atan2((shoulder.x - hip.x) * direction, hip.y - shoulder.y) * 180) / Math.PI
      }

      for (const side of ['left', 'right'] as const) {
        this.detectStrike(side, timeSec, pose, kneeAngle[side], toPx)
      }
    }

    this.windowStrikes = this.windowStrikes.filter((s) => timeSec - s.timeSec <= CADENCE_WINDOW_SEC)

    return {
      sport: 'running',
      timeSec,
      direction: this.direction,
      kneeAngle,
      trunkLeanDeg,
      cadenceSpm: this.cadence(),
      lastStrike: this.lastStrike,
      recentStrikes: this.allStrikes.slice(-6).reverse(),
      totalStrikes: this.allStrikes.length,
      avgOverstrideCm: mean(this.allStrikes.map((s) => s.overstrideCm)),
      avgKneeAtStrike: mean(this.allStrikes.map((s) => s.kneeAngle)),
    }
  }

  private get direction(): 1 | -1 {
    return this.directionScore >= 0 ? 1 : -1
  }

  private updateDirection(pose: Pose) {
    const ears = [pose.left_ear, pose.right_ear].filter(usable)
    let sample = 0
    if (usable(pose.nose) && ears.length) {
      const earX = ears.reduce((sum, e) => sum + e.x, 0) / ears.length
      sample = Math.sign(pose.nose.x - earX)
    } else if (usable(pose.left_foot) && usable(pose.left_heel)) {
      sample = Math.sign(pose.left_foot.x - pose.left_heel.x)
    }
    this.directionScore = this.directionScore * 0.9 + sample * 0.1
  }

  private detectStrike(
    side: Side,
    timeSec: number,
    pose: Pose,
    knee: number | undefined,
    toPx: (k: Keypoint) => Point,
  ) {
    const ankle = pose[`${side}_ankle`]
    const hipK = pose[`${side}_hip`]
    const kneeK = pose[`${side}_knee`]
    const { left_hip: lh, right_hip: rh } = pose
    if (!usable(ankle) || !usable(hipK) || !usable(kneeK) || !usable(lh) || !usable(rh)) return

    const history = this.ankleHistory[side]
    const ankleY = toPx(ankle).y
    history.push({ t: timeSec, y: ankleY })
    while (history.length && timeSec - history[0].t > HISTORY_SEC) history.shift()
    if (history.length < 5) return

    const [a, b, c] = history.slice(-3)
    const isLowestPoint = b.y > a.y && b.y >= c.y
    if (!isLowestPoint) return

    const ys = history.map((h) => h.y)
    const min = Math.min(...ys)
    const max = Math.max(...ys)
    const legPx =
      Math.hypot(toPx(hipK).x - toPx(kneeK).x, toPx(hipK).y - toPx(kneeK).y) +
      Math.hypot(toPx(kneeK).x - toPx(ankle).x, toPx(kneeK).y - toPx(ankle).y)
    const swing = max - min
    const nearGround = b.y - min >= swing * 0.8
    if (swing < legPx * 0.08 || !nearGround) return
    if (b.t - this.lastStrikeTime[side] < MIN_STEP_INTERVAL_SEC) return

    const hipMidX = (lh.x + rh.x) / 2
    const ankleX = toPx(ankle).x
    const hipMidPx = toPx({ x: hipMidX, y: 0, score: 1 }).x
    const overstrideCm = (((ankleX - hipMidPx) * this.direction) / legPx) * this.heightCm * LEG_TO_HEIGHT

    const strike: Strike = {
      timeSec: b.t,
      side,
      overstrideCm,
      kneeAngle: knee ?? 0,
      ankle: { x: ankle.x, y: ankle.y },
      hipX: hipMidX,
    }
    this.lastStrikeTime[side] = b.t
    this.windowStrikes.push(strike)
    this.allStrikes.push(strike)
    this.lastStrike = strike
  }

  private cadence() {
    const strikes = this.windowStrikes
    if (strikes.length < 4) return null
    const span = strikes[strikes.length - 1].timeSec - strikes[0].timeSec
    if (span <= 0) return null
    return ((strikes.length - 1) / span) * 60
  }
}

export interface GaitSignal {
  id: string
  label: string
  detail: string
  flagged: boolean
}

export const MIN_STRIKES_FOR_SIGNALS = 6

export function deriveSignals(snapshot: GaitSnapshot | null): GaitSignal[] {
  if (!snapshot || snapshot.totalStrikes < MIN_STRIKES_FOR_SIGNALS) return []
  const signals: GaitSignal[] = []
  const { cadenceSpm, avgOverstrideCm, avgKneeAtStrike } = snapshot

  if (cadenceSpm !== null) {
    const low = cadenceSpm < 165
    signals.push({
      id: 'cadence',
      label: low ? 'Low cadence' : 'Healthy cadence',
      detail: low
        ? 'Longer, heavier strides load the heel on every step'
        : 'Short, quick steps keep impact forces down',
      flagged: low,
    })
  }
  if (avgOverstrideCm !== null) {
    const over = avgOverstrideCm > 10
    signals.push({
      id: 'overstride',
      label: over ? 'Landing ahead of hips' : 'Foot lands under hips',
      detail: over
        ? 'Braking force on contact: favour heel cushioning'
        : 'Efficient contact point, no extra heel protection needed',
      flagged: over,
    })
  }
  if (avgKneeAtStrike !== null) {
    const straight = avgKneeAtStrike > 165
    signals.push({
      id: 'knee',
      label: straight ? 'Straight knee at contact' : 'Soft knee at contact',
      detail: straight
        ? 'Less natural shock absorption: prioritise midsole foam'
        : 'Knee flexion absorbs impact: lighter shoes are fine',
      flagged: straight,
    })
  }
  return signals
}
