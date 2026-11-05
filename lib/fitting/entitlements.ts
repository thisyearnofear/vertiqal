/**
 * The freemium boundary, in one place. On-device analysis is always free — the
 * funnel. Hosted-AI features cost per call, so free tier gets a taste (small
 * monthly quotas) and pro gets the uncapped product.
 *
 * Check `allowed()` before every hosted call; pair with the existing per-visitor
 * guards (surface-guard, stock-policy) which meter abuse regardless of tier.
 */

export type Tier = 'free' | 'pro'

export type Feature =
  | 'sole-vision'      // Grok vision on a shoe-sole photo
  | 'keyframe-review'  // Grok vision on clip keyframes
  | 'describe'         // free-text brief parse
  | 'surface-guess'    // vision surface suggestion from a keyframe
  | 'tryon'            // AI shoe try-on
  | 'voice'            // TTS coaching cues
  | 'baseline-history' // longitudinal movement profile beyond one baseline

/** Monthly quota per feature per tier; Infinity = uncapped. */
const QUOTAS: Record<Feature, Record<Tier, number>> = {
  'sole-vision':      { free: 1,        pro: Infinity },
  'keyframe-review':  { free: 0,        pro: Infinity },
  'describe':         { free: 3,        pro: Infinity },
  'surface-guess':    { free: 1,        pro: Infinity },
  'tryon':            { free: 0,        pro: Infinity },
  'voice':            { free: Infinity, pro: Infinity },
  'baseline-history': { free: 1,        pro: Infinity },
}

export function quotaFor(feature: Feature, tier: Tier): number {
  return QUOTAS[feature][tier]
}

/** used = calls this billing period. */
export function allowed(feature: Feature, tier: Tier, used: number): boolean {
  return used < quotaFor(feature, tier)
}

export const TIERS: Tier[] = ['free', 'pro']
export const parseTier = (v: unknown): Tier => (v === 'pro' ? 'pro' : 'free')
