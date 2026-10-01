import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Proof of phone possession for the WhatsApp handoff: the app issues a short code, the shopper
 * sends it from the phone itself, and only then does the conversation get linked to the browser.
 * The signed token carries the code + phone so the server stays stateless between polls.
 */
export const LINK_TTL_MS = 10 * 60_000

// No 0/O/1/I/L — the code is read off a screen and typed on a phone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function newLinkCode(random: (max: number) => number = randomInt) {
  let code = ''
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[random(CODE_ALPHABET.length)]
  return `FORMA-${code}`
}

const sign = (key: Buffer, body: string) => createHmac('sha256', key).update(body).digest('base64url')

export function issueLinkToken(key: Buffer, { phone, code, now = Date.now() }: { phone: string; code: string; now?: number }) {
  const body = Buffer.from(JSON.stringify({ p: phone, c: code, t: now })).toString('base64url')
  return `${body}.${sign(key, body)}`
}

export function readLinkToken(key: Buffer, token: string, now = Date.now()): { phone: string; code: string } | null {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = Buffer.from(sign(key, body))
  const given = Buffer.from(signature)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString()) as { p?: unknown; c?: unknown; t?: unknown }
    if (typeof data.p !== 'string' || typeof data.c !== 'string' || typeof data.t !== 'number') return null
    if (now - data.t > LINK_TTL_MS || data.t - now > 60_000) return null
    return { phone: data.p, code: data.c }
  } catch {
    return null
  }
}

/** True only when a SHOPPER transcript line carries the code as a whole token, so prefixes can't match. */
export function transcriptHasCode(transcript: string, code: string) {
  const pattern = new RegExp(`\\b${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  return transcript.split('\n').some((line) => line.startsWith('SHOPPER: ') && pattern.test(line))
}

/** The webhook fast-path: a message that is just a link code needs no model call. */
export const isLinkCodeMessage = (text: string) => /^forma-[a-z0-9]{6}$/i.test(text.trim())
