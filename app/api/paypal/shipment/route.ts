import { z } from 'zod'
import { logCost } from '@/lib/cost-log'
import { paypalRun, paypalToolingReady } from '@/lib/paypal/toolkit'
import { guardRequest, guardResponse } from '@/lib/rate-limit'

const postSchema = z.object({
  captureId: z.string().min(3).max(64),
  carrier: z.string().min(2).max(40).default('FEDEX'),
  trackingNumber: z.string().min(6).max(40),
})

/**
 * The retention hook: once a PayPal purchase is captured, the shipment it
 * became gets a tracking record through the Agent Toolkit. Delivery status
 * later feeds the film-again reminder — "shoes arrived? re-measure".
 */
export async function POST(request: Request) {
  const guard = await guardRequest(request, 'outcome')
  if (!guard.allowed) return guardResponse(guard)
  if (!paypalToolingReady()) return Response.json({ error: 'PayPal is not configured' }, { status: 503 })
  const parsed = postSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Bad request' }, { status: 400 })

  const result = await paypalRun<{ status?: string }>('create_shipment_tracking', {
    transaction_id: parsed.data.captureId,
    carrier: parsed.data.carrier,
    tracking_number: parsed.data.trackingNumber,
  }).catch(() => null)

  if (!result) {
    logCost('limit_hit', { surface: 'paypal', reason: 'shipment_failed' })
    return Response.json({ error: 'Could not register tracking' }, { status: 502 })
  }
  return Response.json({ status: result.status ?? 'CREATED' })
}

/** Latest tracking status for a capture — the outcome page asks this before nudging a re-measure. */
export async function GET(request: Request) {
  const guard = await guardRequest(request, 'outcome')
  if (!guard.allowed) return guardResponse(guard)
  if (!paypalToolingReady()) return Response.json({ error: 'PayPal is not configured' }, { status: 503 })
  const captureId = new URL(request.url).searchParams.get('captureId')
  if (!captureId || captureId.length < 3 || captureId.length > 64) {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }

  const result = await paypalRun<{ tracking_info?: { status?: string; tracking_number?: string; carrier?: string }[] }>(
    'get_shipment_tracking',
    { transaction_id: captureId },
  ).catch(() => null)

  const info = result?.tracking_info?.[0]
  if (!info) return Response.json({ status: 'UNKNOWN' })
  return Response.json({
    status: info.status ?? 'UNKNOWN',
    trackingNumber: info.tracking_number ?? null,
    carrier: info.carrier ?? null,
  })
}
