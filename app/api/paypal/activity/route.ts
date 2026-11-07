import { logCost } from '@/lib/cost-log'
import { listTransactions } from '@/lib/paypal/activity'
import { paypalToolingReady } from '@/lib/paypal/toolkit'
import { guardRequest, guardResponse } from '@/lib/rate-limit'

/**
 * Merchant-side read: recent successful PayPal transactions through the Agent
 * Toolkit. Feeds the Fit Lab view — orders × fit verdicts × refunds — without
 * a separate dashboard product.
 */
export async function GET(request: Request) {
  const guard = await guardRequest(request, 'outcome')
  if (!guard.allowed) return guardResponse(guard)
  if (!paypalToolingReady()) return Response.json({ error: 'PayPal is not configured' }, { status: 503 })

  const days = Number(new URL(request.url).searchParams.get('days') ?? 30) || 30
  const transactions = await listTransactions(days)
  if (!transactions) {
    logCost('limit_hit', { surface: 'paypal', reason: 'transactions_failed' })
    return Response.json({ error: 'Could not list transactions' }, { status: 502 })
  }
  return Response.json({ transactions })
}
