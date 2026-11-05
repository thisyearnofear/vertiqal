import { z } from 'zod'
import { logCost } from '@/lib/cost-log'
import { paypalRun, paypalToolingReady } from '@/lib/paypal/toolkit'
import { guardRequest, guardResponse } from '@/lib/rate-limit'

const bodySchema = z.object({
  captureId: z.string().min(3).max(64),
  note: z.string().max(200).optional(),
})

/**
 * The fit-failed path: the agent that measured you and verified the stock also
 * unwinds the purchase when the fit was wrong. Runs through the PayPal Agent
 * Toolkit's create_refund against the stored capture id.
 */
export async function POST(request: Request) {
  const guard = await guardRequest(request, 'outcome')
  if (!guard.allowed) return guardResponse(guard)
  if (!paypalToolingReady()) return Response.json({ error: 'PayPal is not configured' }, { status: 503 })
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Bad request' }, { status: 400 })

  const result = await paypalRun<{ id?: string; status?: string }>('create_refund', {
    capture_id: parsed.data.captureId,
    ...(parsed.data.note ? { note_to_payer: parsed.data.note } : {}),
  }).catch(() => null)

  if (!result) {
    logCost('limit_hit', { surface: 'paypal', reason: 'refund_failed' })
    return Response.json({ error: 'Could not start the refund' }, { status: 502 })
  }
  return Response.json({ refundId: result.id ?? null, status: result.status ?? 'PENDING' })
}
