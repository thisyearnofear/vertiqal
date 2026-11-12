import { requestClientKey } from '../agent/stock-policy.ts'
import { counterStore } from '../rate-limit/store.ts'
import { BRIEF_COOKIE, parseRememberedBrief } from './remembered-brief.ts'
import { tierFromProof } from './tier-proof.ts'
import { vidFromRequest } from './visitor.ts'
import { allowed, quotaFor, type Feature, type Tier } from './entitlements.ts'

const MONTH_MS = 30 * 24 * 60 * 60_000

function cookieValue(name: string, header: string | null): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=') || null
  }
  return null
}

function tierFromRequest(request: Request): Tier {
  const raw = cookieValue(BRIEF_COOKIE, request.headers.get('cookie'))
  if (!raw) return 'free'
  try {
    const brief = parseRememberedBrief(decodeURIComponent(raw))
    return tierFromProof(brief?.tier, brief?.tierProof)
  } catch {
    return 'free'
  }
}

export interface FeatureVerdict {
  ok: boolean
  feature: Feature
  tier: Tier
  used: number
  quota: number
  /** The counter could not be read. Refuse the call; do not tell the shopper to upgrade. */
  unavailable?: boolean
}

function featureKey(request: Request, feature: Feature): string {
  const visitor = vidFromRequest(request) ?? requestClientKey(request)
  const month = new Date().toISOString().slice(0, 7)
  return `entitle:${feature}:${visitor}:${month}`
}

/**
 * Tier-gated monthly quota for hosted-AI features. Reads the shared counter
 * (vid cookie, else request IP) and does not increment. Call after the abuse
 * guard and before the paid model call, then `recordFeatureUse` only if that
 * call succeeded. A free allowance of 1 therefore runs once. Parallel requests
 * can both pass a peek and overshoot by one; a failed or unreachable model
 * does not spend the allowance. A counter outage refuses the call.
 */
export async function checkFeature(request: Request, feature: Feature): Promise<FeatureVerdict> {
  const tier = tierFromRequest(request)
  const quota = quotaFor(feature, tier)
  if (!Number.isFinite(quota)) return { ok: true, feature, tier, used: 0, quota }
  if (quota <= 0) return { ok: false, feature, tier, used: 0, quota }
  try {
    const used = await counterStore().read(featureKey(request, feature))
    return { ok: allowed(feature, tier, used), feature, tier, used, quota }
  } catch (error) {
    console.warn('[usage] counter store unavailable, refusing this hosted call', error)
    return { ok: false, feature, tier, used: 0, quota, unavailable: true }
  }
}

/** Counts one successful hosted call. Pro (uncapped) and a store outage are no-ops. */
export async function recordFeatureUse(request: Request, feature: Feature): Promise<void> {
  const quota = quotaFor(feature, tierFromRequest(request))
  if (!Number.isFinite(quota) || quota <= 0) return
  try {
    await counterStore().hit(featureKey(request, feature), MONTH_MS)
  } catch (error) {
    console.warn('[usage] could not record a successful hosted call', error)
  }
}

/** 503 when the meter itself is down — distinct from a 402 upgrade. */
export function featureBlocked(verdict: FeatureVerdict): Response | null {
  if (verdict.ok) return null
  if (verdict.unavailable) {
    return Response.json(
      { error: 'Forma’s usage meter is unreachable right now — try again shortly.' },
      { status: 503 },
    )
  }
  return quotaResponse(verdict)
}

/** 402 = feature exists, tier is the missing piece — distinct from 429 abuse limits. */
export function quotaResponse(verdict: FeatureVerdict) {
  return Response.json(
    {
      error: 'That one is on Forma Pro — the free tier includes a few each month and this one is used.',
      code: 'upgrade',
      feature: verdict.feature,
      used: verdict.used,
      quota: verdict.quota,
    },
    { status: 402 },
  )
}
