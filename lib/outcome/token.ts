import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { requireSecret } from '../secrets.ts'
import { outcomeContextSchema, type OutcomeContext } from './schema.ts'

/** A follow-up link is useful for a long time: people wear shoes in over weeks. */
export const OUTCOME_LINK_TTL_MS = 120 * 24 * 60 * 60_000

/** A new opaque Awin click reference. Server-side so tests and the API share one generator. */
export function newClickRef(bytes: (n: number) => Buffer = randomBytes): string {
  return `vq${bytes(8).toString('hex')}`
}

const key = () => createHmac('sha256', requireSecret('PASSPORT_SECRET', 'fit-outcome links')).update('vertiqal-fit-outcome').digest()
const sign = (body: string) => createHmac('sha256', key()).update(body).digest('base64url').slice(0, 22)

export function issueOutcomeToken(context: OutcomeContext): string {
  const body = Buffer.from(JSON.stringify(context)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function readOutcomeToken(token: string, now = Date.now()): OutcomeContext | null {
  const [body, signature] = token.split('.')
  if (!body || !signature || token.length > 2000) return null
  const expected = Buffer.from(sign(body))
  const given = Buffer.from(signature)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const context = outcomeContextSchema.parse(JSON.parse(Buffer.from(body, 'base64url').toString()))
    if (now - context.at > OUTCOME_LINK_TTL_MS || context.at - now > 60_000) return null
    return context
  } catch {
    return null
  }
}
