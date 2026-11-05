'use client'

import type { MetricReading } from './baseline'

/**
 * The movement profile — metrics-only history of locked measurements. The
 * product's longitudinal layer: sessions accumulate so deltas, benchmarks and
 * "film this again" plans have something to compare against.
 *
 * Same privacy stance as the remembered brief — numbers only, never video.
 */

const STORAGE_KEY = 'forma-profile'
const MAX_SESSIONS = 24

export interface ProfileSession {
  /** ISO timestamp of when the measurements were locked. */
  at: string
  sport: 'running' | 'climbing'
  metrics: MetricReading[]
}

const load = (): ProfileSession[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ProfileSession[]) : []
  } catch {
    return []
  }
}

const save = (sessions: ProfileSession[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    // Storage full or unavailable — history is best-effort, never a blocker.
  }
}

export function readProfile(sport?: 'running' | 'climbing'): ProfileSession[] {
  const sessions = load()
  return sport ? sessions.filter((s) => s.sport === sport) : sessions
}

export function appendSession(sport: 'running' | 'climbing', metrics: MetricReading[]): ProfileSession[] {
  const sessions = [...load(), { at: new Date().toISOString(), sport, metrics }]
  save(sessions.slice(-MAX_SESSIONS))
  return sessions
}

/** The most recent session before the latest one for a sport — the comparison point. */
export function priorSession(sport: 'running' | 'climbing'): ProfileSession | null {
  const sessions = readProfile(sport)
  return sessions.length >= 2 ? sessions[sessions.length - 2] : null
}

export interface MetricDelta {
  metric: string
  before: number
  after: number
  delta: number
  pct: number | null
}

/** Per-metric change between the prior session and the latest for a sport. */
export function profileDeltas(sport: 'running' | 'climbing'): MetricDelta[] {
  const sessions = readProfile(sport)
  if (sessions.length < 2) return []
  const [prev, latest] = [sessions[sessions.length - 2], sessions[sessions.length - 1]]
  return latest.metrics.flatMap((m) => {
    const before = prev.metrics.find((p) => p.metric === m.metric)
    if (!before) return []
    const delta = m.value - before.value
    return [{ metric: m.metric, before: before.value, after: m.value, delta, pct: before.value !== 0 ? (delta / before.value) * 100 : null }]
  })
}

/** Summary sentence for narration/artifacts — "Cadence up 6% since Nov". */
export function profileSummary(sport: 'running' | 'climbing'): string | null {
  const deltas = profileDeltas(sport).filter((d) => d.pct !== null && Math.abs(d.pct) >= 2)
  if (deltas.length === 0) return null
  const top = deltas.sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0))[0]
  const direction = top.delta > 0 ? 'up' : 'down'
  return `${top.metric} ${direction} ${Math.abs(top.pct ?? 0).toFixed(0)}%`
}

export function clearProfile() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
