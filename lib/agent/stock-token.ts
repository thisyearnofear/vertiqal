import { createHmac, timingSafeEqual } from 'node:crypto'

export const STOCK_TARGET_TTL_MS = 2 * 60 * 60_000

const signature = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url')
const payloadFor = (target: { productName: string; productUrl: string }, expiresAt: number) =>
  `${expiresAt}\n${target.productName.trim()}\n${target.productUrl.trim()}`
const stockCheckSecret = () => process.env.STOCK_CHECK_SECRET || process.env.SOLARI_API_KEY

export function issueStockToken(target: { productName: string; productUrl: string }, secret = stockCheckSecret(), now = Date.now()) {
  if (!secret) return ''
  const expiresAt = now + STOCK_TARGET_TTL_MS
  return `${expiresAt}.${signature(payloadFor(target, expiresAt), secret)}`
}

export function verifyStockToken(target: { productName: string; productUrl: string }, token: string, secret = stockCheckSecret(), now = Date.now()) {
  const [expiresText, supplied] = token.split('.')
  const expiresAt = Number(expiresText)
  if (!secret || !supplied || !Number.isFinite(expiresAt) || expiresAt <= now) return false

  const expected = signature(payloadFor(target, expiresAt), secret)
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
