import { cookies } from 'next/headers'
import { z } from 'zod'
import { logCost } from '@/lib/cost-log'
import { recordCapture } from '@/lib/captures/record'
import { captureOrder, PRO_PRICE } from '@/lib/paypal/orders'
import { BRIEF_COOKIE, rememberedBriefSchema, type RememberedBrief } from '@/lib/fitting/remembered-brief'
import { tierProof } from '@/lib/fitting/tier-proof'
import { guardRequest, guardResponse } from '@/lib/rate-limit'

const bodySchema = z.object({
  orderId: z.string().min(3).max(32),
  purpose: z.enum(['pro', 'purchase']).default('pro'),
})

const COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 365,
  path: '/',
  sameSite: 'none',
  secure: true,
  httpOnly: true,
} as const

export async function POST(request: Request) {
  const guard = await guardRequest(request, 'outcome')
  if (!guard.allowed) return guardResponse(guard)
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Bad request' }, { status: 400 })

  // 'pro' must pay the Pro price; a purchase just needs PayPal's COMPLETED verdict.
  const result = await captureOrder(parsed.data.orderId, parsed.data.purpose === 'pro' ? PRO_PRICE : null)
  if (!result.ok) {
    logCost('limit_hit', { surface: 'paypal', reason: `capture_${result.status}` })
    return Response.json({ error: 'Payment did not complete' }, { status: 402 })
  }

  // Record every verified capture immediately — the ledger shows it without
  // waiting for PayPal's transaction-search index (sandbox lags badly).
  await recordCapture({
    orderId: parsed.data.orderId,
    captureId: result.captureId,
    amount: parsed.data.purpose === 'pro' ? PRO_PRICE.value : null,
    currency: parsed.data.purpose === 'pro' ? PRO_PRICE.currency_code : null,
    purpose: parsed.data.purpose,
    status: result.status,
  })

  // A product purchase is verified but buys no features — only 'pro' flips the tier.
  if (parsed.data.purpose !== 'pro') {
    return Response.json({ orderId: parsed.data.orderId, captureId: result.captureId, status: result.status })
  }

  // Payment verified — merge pro into the remembered-brief cookie.
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
  store.set(BRIEF_COOKIE, JSON.stringify({ ...base, tier: 'pro', tierProof: tierProof('pro') }), COOKIE_OPTIONS)
  return Response.json({ tier: 'pro' })
}
