import { listCaptures } from '@/lib/captures/read'
import { listTransactions } from '@/lib/paypal/activity'
import { paypalToolingReady } from '@/lib/paypal/toolkit'
import { listOutcomes } from '@/lib/outcome/read'
import { guardRequest, guardResponse } from '@/lib/rate-limit'

/**
 * The Fit Lab feed: PayPal transactions beside recorded fit outcomes. Powers
 * the /lab AG Grid dashboard — the merchant's view of "did the fit verdict
 * hold", without a separate analytics product.
 */
export async function GET(request: Request) {
  const guard = await guardRequest(request, 'outcome')
  if (!guard.allowed) return guardResponse(guard)

  const days = Number(new URL(request.url).searchParams.get('days') ?? 30) || 30
  const [transactions, outcomes, captures] = await Promise.all([
    paypalToolingReady() ? listTransactions(days) : Promise.resolve(null),
    listOutcomes(),
    listCaptures(),
  ])
  // Instant ledger: verified captures recorded at capture time lead, so the
  // grid shows money even while PayPal's search index lags. De-dupe by id.
  const instant = captures.map((c) => ({
    id: c.captureId ?? c.orderId,
    amount: c.amount,
    currency: c.currency,
    status: c.status,
    date: c.capturedAt,
    payer: null,
    items: [`${c.purpose === 'pro' ? 'Forma Pro' : 'Forma purchase'} · order ${c.orderId.slice(-6)}`],
  }))
  const seen = new Set(instant.map((t) => t.id))
  const merged = [...instant, ...(transactions ?? []).filter((t) => !t.id || !seen.has(t.id))]
  return Response.json({
    transactions: merged,
    transactionsAvailable: transactions !== null || captures.length > 0,
    capturesAvailable: captures.length > 0,
    outcomes,
    outcomesAvailable: outcomes.length > 0,
  })
}
