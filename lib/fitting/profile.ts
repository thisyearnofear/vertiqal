'use client'

import type { MetricReading, Sport } from '@/lib/metrics/readout'
import { quotaFor, type Tier } from './entitlements.ts'

/**
 * The movement profile — metrics-only history of locked measurements. The
 * product's longitudinal layer: sessions accumulate so deltas, benchmarks and
 * "film this again" plans have something to compare against.
 *
 * Same privacy stance as the remembered brief — numbers only, never video.
 * Retention is the freemium line: free keeps the single latest pin, pro
 * accumulates history up to MAX_SESSIONS.
 */

const STORAGE_KEY = 'forma-profile'
const MAX_SESSIONS = 24

export interface ProfileSession {
  /** ISO timestamp of when the measurements were locked. */
  at: string
  sport: Sport
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

export function readProfile(sport?: Sport): ProfileSession[] {
  const sessions = load()
  return sport ? sessions.filter((s) => s.sport === sport) : sessions
}

/**
 * Stamps a locked measurement into the profile. Sessions beyond the tier's
 * `profile-history` quota are dropped oldest-first, so a free profile always
 * reflects the latest film while pro accumulates the history deltas need.
 */
export function appendSession(sport: Sport, metrics: MetricReading[], tier: Tier = 'free'): ProfileSession[] {
  const keep = Math.min(MAX_SESSIONS, quotaFor('profile-history', tier))
  const sessions = [...load(), { at: new Date().toISOString(), sport, metrics }].slice(-keep)
  save(sessions)
  return sessions
}

/** The most recent session before the latest one for a sport — the comparison point. */
export function priorSession(sport: Sport): ProfileSession | null {
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
export function profileDeltas(sport: Sport): MetricDelta[] {
  const sessions = readProfile(sport)
  if (sessions.length < 2) return []
  const [prev, latest] = [sessions[sessions.length - 2], sessions[sessions.length - 1]]
  return latest.metrics.flatMap((m) => {
    if (m.value === null) return []
    const before = prev.metrics.find((p) => p.label === m.label)
    if (!before || before.value === null) return []
    const delta = m.value - before.value
    return [{ metric: m.label, before: before.value, after: m.value, delta, pct: before.value !== 0 ? (delta / before.value) * 100 : null }]
  })
}

/** Summary sentence for narration/artifacts — "Cadence up 6% since Nov". */
export function profileSummary(sport: Sport): string | null {
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
