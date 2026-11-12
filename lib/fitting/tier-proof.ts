import { createHmac, timingSafeEqual } from 'node:crypto'
import { requireSecret } from '../secrets.ts'
import type { Tier } from './entitlements.ts'
import { parseRememberedBrief, type RememberedBrief } from './remembered-brief.ts'

/**
 * The tier claim in the remembered-brief cookie is HMAC-signed: the cookie is
 * plain JSON a visitor could otherwise edit into 'pro'. Only the server holds
 * PASSPORT_SECRET, so a valid proof can only come from the verified payment
 * routes. The upgrade page cannot mint Pro.
 * Server-only — importing this into client code would ship node:crypto.
 */

const sign = (tier: Tier): string =>
  createHmac('sha256', requireSecret('PASSPORT_SECRET', 'signing the tier claim in the brief cookie'))
    .update(`vertiqal-tier:${tier}`)
    .digest('base64url')

/** The proof string stored beside `tier` in the brief cookie. */
export const tierProof = sign

export function tierFromProof(tier: unknown, proof: unknown): Tier {
  if (tier !== 'pro' || typeof proof !== 'string' || proof.length === 0) return 'free'
  try {
    const expected = Buffer.from(sign('pro'))
    const given = Buffer.from(proof)
    return given.length === expected.length && timingSafeEqual(given, expected) ? 'pro' : 'free'
  } catch {
    // Secret missing — fail closed rather than trust the claim.
    return 'free'
  }
}

/**
 * Parses the brief cookie and verifies the tier proof. A forged or unsigned
 * 'pro' downgrades to free — the rest of the brief is the visitor's own
 * answers, which they can only sabotage for themselves.
 */
export function verifiedBrief(raw: string | undefined): RememberedBrief | null {
  const brief = parseRememberedBrief(raw)
  if (!brief || brief.tier !== 'pro') return brief
  return tierFromProof(brief.tier, brief.tierProof) === 'pro' ? brief : { ...brief, tier: 'free', tierProof: undefined }
}
