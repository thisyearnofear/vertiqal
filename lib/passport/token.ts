import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { passportSchema, type Passport } from './schema'

/**
 * Passports are stateless: the (compressed) body travels in the URL and an HMAC proves
 * vertiqal issued it, so bots can trust it without a database lookup.
 */
function secret() {
  const key = process.env.PASSPORT_SECRET ?? process.env.WASSIST_API_KEY
  if (!key) throw new Error('No signing secret configured for fit passports')
  return createHmac('sha256', key).update('vertiqal-fit-passport').digest()
}

const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url').slice(0, 22)

export const passportId = (token: string) =>
  `VQ-${Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('hex').slice(0, 6).toUpperCase()}`

export function issuePassport(passport: Passport) {
  const body = deflateRawSync(Buffer.from(JSON.stringify(passport))).toString('base64url')
  const token = `${body}.${sign(body)}`
  return { token, id: passportId(token) }
}

export function readPassport(token: string): Passport | null {
  const [body, signature] = token.split('.')
  if (!body || !signature || token.length > 6000) return null
  const expected = Buffer.from(sign(body))
  const given = Buffer.from(signature)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    return passportSchema.parse(JSON.parse(inflateRawSync(Buffer.from(body, 'base64url')).toString()))
  } catch {
    return null
  }
}
