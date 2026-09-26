import { deriveSignals, type GaitSnapshot } from '@/lib/metrics/gait'

export interface GaitBrief {
  cadenceSpm: number | null
  overstrideCm: number | null
  kneeAtContactDeg: number | null
  trunkLeanDeg: number | null
  footfalls: number
  signals: string[]
}

export interface ShopperPrefs {
  size: string
  budget: string
  heightCm: number
}

const round = (value: number | null) => (value === null ? null : Math.round(value))

export function briefFromSnapshot(snapshot: GaitSnapshot): GaitBrief {
  return {
    cadenceSpm: round(snapshot.cadenceSpm),
    overstrideCm: round(snapshot.avgOverstrideCm),
    kneeAtContactDeg: round(snapshot.avgKneeAtStrike),
    trunkLeanDeg: round(snapshot.trunkLeanDeg),
    footfalls: snapshot.totalStrikes,
    signals: deriveSignals(snapshot).map((s) => `${s.label}: ${s.detail}`),
  }
}

/** A heel-striking overstrider, used to demo the agent without a clip. */
export const SAMPLE_BRIEF: GaitBrief = {
  cadenceSpm: 158,
  overstrideCm: 14,
  kneeAtContactDeg: 172,
  trunkLeanDeg: 4,
  footfalls: 24,
  signals: [
    'Low cadence: Longer, heavier strides load the heel on every step',
    'Landing ahead of hips: Braking force on contact: favour heel cushioning',
    'Straight knee at contact: Less natural shock absorption: prioritise midsole foam',
  ],
}

export function briefToPrompt(brief: GaitBrief, prefs: ShopperPrefs) {
  const line = (label: string, value: number | null, unit: string) =>
    `- ${label}: ${value === null ? 'not measured' : `${value} ${unit}`}`

  return [
    'Measurements from my running video (side-on pose tracking):',
    line('Cadence', brief.cadenceSpm, 'steps/min'),
    line('Foot lands ahead of hips (avg)', brief.overstrideCm, 'cm'),
    line('Knee angle at contact (avg, 180 = straight)', brief.kneeAtContactDeg, 'deg'),
    line('Trunk lean', brief.trunkLeanDeg, 'deg'),
    `- Footfalls analysed: ${brief.footfalls}`,
    `- Runner height: ${prefs.heightCm} cm`,
    '',
    'Signals:',
    ...brief.signals.map((s) => `- ${s}`),
    '',
    `My size: ${prefs.size}. Budget: ${prefs.budget}. I'm in the UK.`,
    'Find me the right shoe.',
  ].join('\n')
}
