import { z } from 'zod'
import { createOrder, paypalConfigured, PRO_PURCHASE } from '@/lib/paypal/orders'
import { logCost } from '@/lib/cost-log'
import { guardRequest, guardResponse } from '@/lib/rate-limit'

const bodySchema = z.object({
  description: z.string().min(2).max(120).optional(),
  amount: z.string().regex(/^\d{1,4}(\.\d{1,2})?$/).optional(),
})

export async function POST(request: Request) {
  const guard = await guardRequest(request, 'outcome')
  if (!guard.allowed) return guardResponse(guard)
  if (!paypalConfigured()) return Response.json({ error: 'PayPal is not configured' }, { status: 503 })
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return Response.json({ error: 'Bad request' }, { status: 400 })
  const purchase =
    parsed.data.description && parsed.data.amount
      ? { description: parsed.data.description, amount: { currency_code: 'GBP', value: parsed.data.amount } }
      : PRO_PURCHASE
  try {
    const order = await createOrder(purchase)
    return Response.json(order)
  } catch (error) {
    logCost('limit_hit', { surface: 'paypal', reason: error instanceof Error ? error.message : 'order_failed' })
    return Response.json({ error: 'Could not start checkout' }, { status: 502 })
  }
}
