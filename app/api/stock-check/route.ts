import { z } from 'zod'
import { verifyStock, type StockCheck } from '@/lib/agent/solari'
import { verifyStockToken } from '@/lib/agent/stock-token'
import {
  STOCK_CACHE_TTL_MS,
  STOCK_CHECK_LIMIT,
  STOCK_MAX_ACTIVE,
  createStockCheckRunner,
  extraStockHosts,
  requestClientKey,
  stockUrlAllowed,
  takeStockSlot,
} from '@/lib/agent/stock-policy'
import { logCost } from '@/lib/cost-log'
import { vidFromRequest } from '@/lib/fitting/visitor'
import { counterStore } from '@/lib/rate-limit/store'
import { hasSecret } from '@/lib/secrets'

export const maxDuration = 60

const MAX_BODY_BYTES = 16_384

const bodySchema = z.object({
  productName: z.string().trim().min(2).max(160),
  productUrl: z
    .string()
    .url()
    .max(600)
    .refine((url) => url.startsWith('https://'), 'Only https product pages can be checked'),
  size: z.string().trim().min(1).max(24),
  stockToken: z.string().max(240),
  fresh: z.boolean().optional(),
})

const stockChecks = createStockCheckRunner<StockCheck>({ check: verifyStock, cacheTtlMs: STOCK_CACHE_TTL_MS, maxActive: STOCK_MAX_ACTIVE })

const rateHeaders = (result: { remaining: number; retryAfterSec: number }) => ({
  'X-RateLimit-Limit': String(STOCK_CHECK_LIMIT),
  'X-RateLimit-Remaining': String(result.remaining),
  ...(result.retryAfterSec ? { 'Retry-After': String(result.retryAfterSec) } : {}),
})

export async function POST(request: Request) {
  if (!process.env.SOLARI_API_KEY) {
    return Response.json({ error: 'Live stock checks are not configured' }, { status: 503 })
  }
  if (!hasSecret('STOCK_CHECK_SECRET')) {
    return Response.json({ error: 'Live stock checks are not configured' }, { status: 503 })
  }
  const limit = await takeStockSlot(counterStore(), requestClientKey(request))
  if (!limit.allowed) {
    const paused = limit.reason === 'meter'
    return Response.json(
      { error: paused ? 'Live stock checks are paused — the usage meter is unreachable.' : 'Too many stock checks. Try again shortly.' },
      { status: paused ? 503 : 429, headers: rateHeaders(limit) },
    )
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: 'Stock check request is too large' }, { status: 413, headers: rateHeaders(limit) })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400, headers: rateHeaders(limit) })
  }
  if (!stockUrlAllowed(parsed.data.productUrl, extraStockHosts())) {
    return Response.json(
      { error: 'Live stock checks are enabled only for approved footwear retailers' },
      { status: 403, headers: rateHeaders(limit) },
    )
  }
  if (!verifyStockToken({ productName: parsed.data.productName, productUrl: parsed.data.productUrl }, parsed.data.stockToken)) {
    return Response.json(
      { error: 'This stock check is no longer authorised. Run a fresh recommendation.' },
      { status: 403, headers: rateHeaders(limit) },
    )
  }

  const target = {
    productName: parsed.data.productName,
    productUrl: parsed.data.productUrl,
    size: parsed.data.size,
  }
  const started = Date.now()
  const vid = vidFromRequest(request)
  try {
    const result = await stockChecks(target, { fresh: parsed.data.fresh })
    if (result.status === 'busy') {
      logCost('paid_call', { route: 'stock-check', ok: false, ms: Date.now() - started, busy: true, vid })
      return Response.json(
        { error: 'Stock checks are busy right now. Try again shortly.' },
        { status: 503, headers: { ...rateHeaders(limit), 'Retry-After': '5' } },
      )
    }
    if (result.status !== 'ok') {
      logCost('paid_call', { route: 'stock-check', ok: false, ms: Date.now() - started, vid })
      return Response.json({ error: 'Invalid product URL' }, { status: 400, headers: rateHeaders(limit) })
    }
    logCost('paid_call', { route: 'stock-check', ok: true, ms: Date.now() - started, cache: result.source, vid })
    return Response.json(
      { ...result.value, source: result.source },
      {
        headers: {
          ...rateHeaders(limit),
          'X-Stock-Cache': result.source === 'cache' ? 'hit' : result.source === 'shared' ? 'shared' : parsed.data.fresh ? 'bypassed' : 'miss',
          ...(result.cacheExpiresAt ? { 'X-Stock-Cache-Expires': new Date(result.cacheExpiresAt).toISOString() } : {}),
        },
      },
    )
  } catch (error) {
    logCost('paid_call', { route: 'stock-check', ok: false, ms: Date.now() - started, vid })
    return Response.json(
      { error: error instanceof Error ? error.message : 'Stock check failed' },
      { status: 502, headers: rateHeaders(limit) },
    )
  }
}
