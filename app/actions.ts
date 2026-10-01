'use server'

import { cookies } from 'next/headers'
import { BRIEF_COOKIE, rememberedBriefSchema, type RememberedBrief } from '@/lib/fitting/remembered-brief'
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
