import type { Readout, Sport } from '@/lib/metrics/readout'
import { VOICE_PROFILE, type Voice } from '@/lib/persona'

export interface BriefMetric {
  label: string
  value: number | null
  unit: string
}

export interface MovementBrief {
  sport: Sport
  events: number
  metrics: BriefMetric[]
  signals: string[]
}

export interface ShopperPrefs {
  size: string
  budget: string
  heightCm: number
  voice: Voice
  /** Intake answers and Grok vision findings from the fitting notes panel. */
  notes?: string[]
}

export function briefFromReadout(readout: Readout): MovementBrief {
  return {
    sport: readout.sport,
    events: readout.events,
    metrics: readout.metrics.map(({ label, value, unit }) => ({
      label,
      value: value === null ? null : Math.round(value),
      unit,
    })),
    signals: readout.signals.map((s) => `${s.label}: ${s.detail}`),
  }
}

/** Realistic measurements for demoing the agent without a clip. */
export const SAMPLE_BRIEFS: Record<Sport, MovementBrief> = {
  running: {
    sport: 'running',
    events: 24,
    metrics: [
      { label: 'Cadence', value: 158, unit: 'spm' },
      { label: 'Overstride', value: 14, unit: 'cm' },
      { label: 'Knee @ contact', value: 172, unit: 'deg' },
      { label: 'Trunk lean', value: 4, unit: 'deg' },
    ],
    signals: [
      'Low cadence: Longer, heavier strides load the heel on every step',
      'Landing ahead of hips: Braking force on contact: favour heel cushioning',
      'Straight knee at contact: Less natural shock absorption: prioritise midsole foam',
    ],
  },
  climbing: {
    sport: 'climbing',
    events: 18,
    metrics: [
      { label: 'Quiet feet', value: 61, unit: '%' },
      { label: 'Toe-down', value: 27, unit: 'deg' },
      { label: 'Hip offset', value: 31, unit: 'cm' },
      { label: 'Reach elbow', value: 148, unit: 'deg' },
    ],
    signals: [
      'Busy feet: Re-adjusting on holds: a snug, precise shoe gives more feedback',
      'Edging on the toes: Weight on small edges: favour a downturned, stiffer toe box',
      'Hips off the wall: Weight hangs on your arms: a stiffer sole helps you stand on small holds',
    ],
  },
}

export function briefLine(brief: MovementBrief) {
  return brief.metrics
    .slice(0, 3)
    .map((m) => `${m.label.toUpperCase()} ${m.value ?? '--'}${m.unit === 'deg' ? '°' : m.unit.toUpperCase()}`)
    .join('  ·  ')
}

export function briefToPrompt(brief: MovementBrief, prefs: ShopperPrefs) {
  const source = brief.sport === 'running' ? 'running video (side-on pose tracking)' : 'climbing video (pose tracking on the wall)'
  return [
    `Sport: ${brief.sport}`,
    `Measurements from my ${source}:`,
    ...brief.metrics.map((m) => `- ${m.label}: ${m.value === null ? 'not measured' : `${m.value} ${m.unit}`}`),
    `- ${brief.sport === 'running' ? 'Footfalls' : 'Foot placements'} analysed: ${brief.events}`,
    `- My height: ${prefs.heightCm} cm`,
    '',
    'Signals:',
    ...brief.signals.map((s) => `- ${s}`),
    '',
    ...(prefs.notes?.length ? ['About me (weigh these alongside the measurements):', ...prefs.notes.map((n) => `- ${n}`), ''] : []),
    `My street shoe size: ${prefs.size}. Budget: ${prefs.budget}. I'm in the UK.`,
    `Voice: speak to me as ${VOICE_PROFILE[prefs.voice].prompt}.`,
    `Find me the right ${brief.sport === 'running' ? 'running shoe' : 'climbing shoe'}.`,
  ].join('\n')
}
