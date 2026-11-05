import type { MetricReading, Sport } from '@/lib/metrics/readout'

/**
 * A metrics-only baseline persisted across sessions in localStorage — numbers,
 * never video or photos, so it is consistent with the rest of the privacy
 * stance. The photo side stays session-only; a restored baseline still powers
 * the film-again prompt and the metric comparison.
 */
export interface PersistedBaseline {
  sport: Sport
  clipName: string
  capturedAt: string
  metrics: MetricReading[]
}

const KEY = 'forma-baseline'

export function saveBaseline(baseline: PersistedBaseline) {
  try {
    localStorage.setItem(KEY, JSON.stringify(baseline))
  } catch {
    // Quota or private-mode failure — the session baseline still works.
  }
}

export function loadBaseline(sport: Sport): PersistedBaseline | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedBaseline
    return parsed && parsed.sport === sport && Array.isArray(parsed.metrics) && typeof parsed.capturedAt === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function clearPersistedBaseline() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Ignore.
  }
}
