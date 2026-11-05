import { z } from 'zod'
import { logCost } from '@/lib/cost-log'
import { startSubscription } from '@/lib/paypal/subscription'
import { guardRequest, guardResponse } from '@/lib/rate-limit'

const bodySchema = z.object({}).strict().optional()

/** Starts a Forma Pro subscription — returns the PayPal approve link. */
export async function POST(request: Request) {
  const guard = await guardRequest(request, 'outcome')
  if (!guard.allowed) return guardResponse(guard)
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return Response.json({ error: 'Bad request' }, { status: 400 })
  const started = await startSubscription()
  if (!started) {
    logCost('limit_hit', { surface: 'paypal', reason: 'subscription_failed' })
    return Response.json({ error: 'Subscriptions are not configured' }, { status: 503 })
  }
  return Response.json(started)
}
