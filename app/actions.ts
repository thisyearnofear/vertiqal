'use server'

import { cookies } from 'next/headers'
import { PERSONA_COOKIE, personaSchema, type Persona } from '@/lib/persona'

export async function savePersona(persona: Persona) {
  const parsed = personaSchema.safeParse(persona)
  if (!parsed.success) return
  const store = await cookies()
  store.set(PERSONA_COOKIE, JSON.stringify(parsed.data), {
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    // The v0 preview runs in a cross-site iframe; Lax cookies would be dropped there.
    sameSite: 'none',
    secure: true,
    httpOnly: true,
  })
}
