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
  const [transactions, outcomes] = await Promise.all([
    paypalToolingReady() ? listTransactions(days) : Promise.resolve(null),
    listOutcomes(),
  ])
  return Response.json({
    transactions: transactions ?? [],
    transactionsAvailable: transactions !== null,
    outcomes,
    outcomesAvailable: outcomes.length > 0,
  })
}
