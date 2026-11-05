import { requestClientKey } from '@/lib/agent/stock-policy'
import { counterStore } from '@/lib/rate-limit/store'
import { BRIEF_COOKIE, parseRememberedBrief } from '@/lib/fitting/remembered-brief'
import { tierFromProof } from '@/lib/fitting/tier-proof'
import { vidFromRequest } from '@/lib/fitting/visitor'
import { allowed, quotaFor, type Feature, type Tier } from './entitlements'

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
}

/**
 * Tier-gated monthly quota for hosted-AI features. Counts by vid cookie (falls
 * back to request IP) in the shared counter store. Call after the abuse guard
 * and before the paid model call.
 */
export async function checkFeature(request: Request, feature: Feature): Promise<FeatureVerdict> {
  const tier = tierFromRequest(request)
  const quota = quotaFor(feature, tier)
  if (!Number.isFinite(quota)) return { ok: true, feature, tier, used: 0, quota }
  const visitor = vidFromRequest(request) ?? requestClientKey(request)
  const month = new Date().toISOString().slice(0, 7)
  const { count } = await counterStore().hit(`entitle:${feature}:${visitor}:${month}`, MONTH_MS)
  return { ok: allowed(feature, tier, count), feature, tier, used: count, quota }
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
