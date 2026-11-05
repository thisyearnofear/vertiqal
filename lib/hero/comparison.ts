import type { Sport, MetricReading } from '@/lib/metrics/readout'

export interface BaselineReading {
  /** Sport this baseline was captured for. */
  sport: Sport
  /** Timestamp of the original fitting. */
  capturedAt: string
  /** All metrics from the original reading. */
  metrics: MetricReading[]
  /** The standout metric that defined this user's movement. */
  standoutMetric: {
    value: string
    unit: string
    label: string
    description: string
  }
  /** The headline that described this user's movement. */
  headline: string
  /** The hero frame data from the original capture. */
  frameId: number
  /** Photo data URL of the original capture. */
  photoUrl: string
}

/**
 * Compare a new reading against a stored baseline and produce
 * a comparison object for the card and the narration.
 */
export interface ComparisonResult {
  /** The metric that changed the most (by % of its value). */
  changedMost: {
    label: string
    before: number
    after: number
    delta: number
    pctChange: number
    direction: 'improved' | 'worsened' | 'neutral'
  }
  /** All metrics that changed by more than 5%. */
  notableChanges: Array<{
    label: string
    before: number
    after: number
    delta: number
    unit: string
    description: string
  }>
  /** A narrative summary of the change. */
  narrative: string
  /** The comparison headline for the card. */
  headline: string
}

/**
 * Find the metric that changed most relative to its baseline value.
 * Returns neutral when there's nothing to compare against.
 */
export function compareReadings(
  baseline: BaselineReading,
  newMetrics: MetricReading[],
): ComparisonResult {
  const baselineMap = new Map(baseline.metrics.map(m => [m.label.toLowerCase(), m.value ?? 0]))

  const notableChanges: ComparisonResult['notableChanges'] = []
  let mostChanged: ComparisonResult['changedMost'] | null = null

  for (const m of newMetrics) {
    if (m.value === null) continue
    const before = baselineMap.get(m.label.toLowerCase())
    if (before === undefined || before === 0) continue

    const delta = m.value - before
    const pctChange = Math.abs(delta / before) * 100

    if (pctChange > 5) {
      notableChanges.push({
        label: m.label,
        before: Math.round(before * 10) / 10,
        after: Math.round(m.value * 10) / 10,
        delta: Math.round(delta * 10) / 10,
        unit: m.unit,
        description: delta > 0 ? 'Increased' : 'Decreased',
      })
    }

    if (pctChange > (mostChanged?.pctChange ?? 0)) {
      const direction = delta > 0 ? 'improved' : delta < 0 ? 'worsened' : 'neutral'
      mostChanged = {
        label: m.label,
        before: Math.round(before * 10) / 10,
        after: Math.round(m.value * 10) / 10,
        delta: Math.round(delta * 10) / 10,
        pctChange: Math.round(pctChange),
        direction,
      }
    }
  }

  // Sort by absolute % change
  notableChanges.sort((a, b) => Math.abs(b.delta / (b.before || 1)) - Math.abs(a.delta / (a.before || 1)))

  // Build narrative
  const changed = notableChanges.length
  if (changed === 0) {
    return {
      changedMost: mostChanged ?? { label: baseline.standoutMetric.label, before: 0, after: 0, delta: 0, pctChange: 0, direction: 'neutral' },
      notableChanges: [],
      narrative: 'Your movement looks the same as when you first came in.',
      headline: 'Same you. Different session.',
    }
  }

  const top = notableChanges[0]
  const improved = notableChanges.filter(c => c.description === 'Increased').length
  const total = notableChanges.length

  let narrative = ''
  if (changed === 1) {
    narrative = `Your ${top.label} shifted ${Math.abs(top.delta)} ${top.unit} — ${top.description}.`
  } else {
    const verbs = improved > total / 2 ? 'shifted in your favour' : improved < total / 2 ? 'moved against you' : 'shifted'
    narrative = `${changed} of your metrics ${verbs}. Your ${top.label} moved the most: ${top.before} → ${top.after} ${top.unit}.`
  }

  return {
    changedMost: mostChanged ?? { label: top.label, before: top.before, after: top.after, delta: top.delta, pctChange: top.delta / (top.before || 1) * 100, direction: 'neutral' },
    notableChanges,
    narrative,
    headline: changed === 1 ? 'One thing changed.' : `${changed} things shifted.`,
  }
}
