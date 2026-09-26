import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { GUEST, lastChoiceSchema, type MemberView } from './schema'

/**
 * A WhatsApp-linked shopper is remembered by a signed, httpOnly cookie. There is no user table:
 * the Wassist conversation is the long-term memory, and the cookie just says whose it is.
 */
const MEMBER_COOKIE = 'vq_member'
const MAX_AGE = 60 * 60 * 24 * 365

const memberSchema = z.object({
  phone: z.string().regex(/^\d{8,15}$/),
  last: lastChoiceSchema.nullable(),
})

export type Member = z.infer<typeof memberSchema>

function signingKey() {
  const secret = process.env.PASSPORT_SECRET ?? process.env.WASSIST_API_KEY
  if (!secret) return null
  return createHmac('sha256', secret).update('vertiqal-member').digest()
}

const sign = (key: Buffer, body: string) => createHmac('sha256', key).update(body).digest('base64url')

function decode(value: string | undefined): Member | null {
  const key = signingKey()
  const [body, signature] = value?.split('.') ?? []
  if (!key || !body || !signature) return null
  const expected = Buffer.from(sign(key, body))
  const given = Buffer.from(signature)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    return memberSchema.parse(JSON.parse(Buffer.from(body, 'base64url').toString()))
  } catch {
    return null
  }
}

// The v0 preview runs in a cross-site iframe; Lax cookies would be dropped there.
const OPTIONS = { path: '/', sameSite: 'none', secure: true, httpOnly: true } as const

export async function readMember() {
  return decode((await cookies()).get(MEMBER_COOKIE)?.value)
}

export async function writeMember(member: Member) {
  const key = signingKey()
  if (!key) return
  const body = Buffer.from(JSON.stringify(memberSchema.parse(member))).toString('base64url')
  ;(await cookies()).set(MEMBER_COOKIE, `${body}.${sign(key, body)}`, { ...OPTIONS, maxAge: MAX_AGE })
}

export async function forgetMember() {
  ;(await cookies()).set(MEMBER_COOKIE, '', { ...OPTIONS, maxAge: 0 })
}

const maskPhone = (phone: string) => `+${phone.slice(0, 2)} •••• ${phone.slice(-3)}`

export function viewOf(member: Member | null, said: string[] = []): MemberView {
  if (!member) return GUEST
  return { linked: true, phone: maskPhone(member.phone), last: member.last, said }
}
