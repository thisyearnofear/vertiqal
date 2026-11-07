import { paypalRun } from './toolkit'

export interface TransactionRow {
  id: string | null
  amount: string | null
  currency: string | null
  status: string | null
  date: string | null
  payer: string | null
  items: string[]
}

interface RawTransaction {
  transaction_info?: {
    transaction_id?: string
    transaction_amount?: { value?: string; currency_code?: string }
    transaction_status?: string
    transaction_initiation_date?: string
  }
  payer_info?: { email_address?: string; payer_name?: { full_name?: string } }
  cart_info?: { item_details?: { item_name?: string; item_quantity?: string }[] }
}

/** Recent successful PayPal transactions, normalized for grids and dashboards. */
export async function listTransactions(days = 30): Promise<TransactionRow[] | null> {
  const start = new Date(Date.now() - Math.min(Math.max(days, 1), 90) * 86400_000).toISOString()
  const result = await paypalRun<{ transaction_details?: RawTransaction[] }>('list_transactions', {
    transaction_status: 'S',
    start_date: start,
  }).catch(() => null)
  if (!result) return null
  return (result.transaction_details ?? []).map((t) => ({
    id: t.transaction_info?.transaction_id ?? null,
    amount: t.transaction_info?.transaction_amount?.value ?? null,
    currency: t.transaction_info?.transaction_amount?.currency_code ?? null,
    status: t.transaction_info?.transaction_status ?? null,
    date: t.transaction_info?.transaction_initiation_date ?? null,
    payer: t.payer_info?.payer_name?.full_name ?? t.payer_info?.email_address ?? null,
    items: (t.cart_info?.item_details ?? []).map((i) => `${i.item_quantity ?? '1'}× ${i.item_name ?? 'item'}`),
  }))
}
