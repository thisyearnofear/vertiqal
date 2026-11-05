'use server'

import { cookies } from 'next/headers'
import { BRIEF_COOKIE, rememberedBriefSchema, type RememberedBrief } from '@/lib/fitting/remembered-brief'
import { tierProof } from '@/lib/fitting/tier-proof'
import { paypalToolingReady } from '@/lib/paypal/toolkit'
import { PERSONA_COOKIE, personaSchema, type Persona } from '@/lib/persona'

const COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 365,
  path: '/',
  // The v0 preview runs in a cross-site iframe; Lax cookies would be dropped there.
  sameSite: 'none',
  secure: true,
  httpOnly: true,
} as const

export async function savePersona(persona: Persona) {
  const parsed = personaSchema.safeParse(persona)
  if (!parsed.success) return
  const store = await cookies()
  store.set(PERSONA_COOKIE, JSON.stringify(parsed.data), COOKIE_OPTIONS)
}

export async function saveBrief(brief: RememberedBrief) {
  const parsed = rememberedBriefSchema.safeParse(brief)
  if (!parsed.success) return
  const store = await cookies()
  store.set(BRIEF_COOKIE, JSON.stringify(parsed.data), COOKIE_OPTIONS)
}

export async function forgetBrief() {
  const store = await cookies()
  store.set(BRIEF_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 })
}

/**
 * Tier rides the remembered-brief cookie so API routes can read it server-side.
 * 'pro' here is the demo activation only: once any payment path is configured,
 * this action can only write 'free' — real Pro comes from the PayPal routes,
 * which sign the claim after verifying with PayPal. An unsigned or badly
 * signed 'pro' downgrades on read (tier-proof.ts).
 */
export async function setTier(tier: 'free' | 'pro') {
  const store = await cookies()
  const brief = rememberedBriefSchema.safeParse(
    (() => {
      try {
        return JSON.parse(store.get(BRIEF_COOKIE)?.value ?? '')
      } catch {
        return null
      }
    })(),
  )
  const base: RememberedBrief = brief.success ? brief.data : { size: '', budgetPounds: '', heightCm: '', width: '', bySport: {} }
  const payable =
    paypalToolingReady() ||
    Boolean(process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim()) ||
    Boolean(process.env.NEXT_PUBLIC_PAYPAL_PRO_LINK?.trim())
  const next: RememberedBrief =
    tier === 'pro' && !payable
      ? { ...base, tier: 'pro', tierProof: tierProof('pro') }
      : { ...base, tier: 'free', tierProof: undefined }
  store.set(BRIEF_COOKIE, JSON.stringify(next), COOKIE_OPTIONS)
}
