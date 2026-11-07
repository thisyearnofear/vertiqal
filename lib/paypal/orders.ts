/**
 * PayPal Orders v2 — minimal server-side REST client. No SDK dependency; the
 * sandbox is free for hackathon work. PAYPAL_ENV=sandbox (default) targets
 * api-m.sandbox.paypal.com; 'live' targets api-m.paypal.com.
 */

export const PRO_PRICE = { currency_code: 'GBP', value: '9.00' } as const

export const baseUrl = () =>
  process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'

const credentials = () => {
  const id = process.env.PAYPAL_CLIENT_ID?.trim()
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim()
  return id && secret ? { id, secret } : null
}

export function paypalConfigured() {
  return credentials() !== null
}

export async function accessToken(): Promise<string> {
  const creds = credentials()
  if (!creds) throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not configured')
  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status})`)
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

export interface Purchase {
  description: string
  amount: { currency_code: string; value: string }
}

export const PRO_PURCHASE: Purchase = { description: 'Forma Pro — unlimited hosted fitting features', amount: PRO_PRICE }

export async function createOrder(purchase: Purchase = PRO_PURCHASE): Promise<{ id: string; approveUrl: string | null }> {
  const token = await accessToken()
  const res = await fetch(`${baseUrl()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ description: purchase.description.slice(0, 127), amount: purchase.amount }],
    }),
  })
  if (!res.ok) throw new Error(`PayPal order failed (${res.status})`)
  const data = (await res.json()) as { id: string; links?: { rel: string; href: string }[] }
  const approveUrl = data.links?.find((l) => l.rel === 'approve' || l.rel === 'payer-action')?.href ?? null
  return { id: data.id, approveUrl }
}

export interface CaptureResult {
  ok: boolean
  status: string
  /** The PayPal capture id — needed to refund the purchase later. */
  captureId: string | null
}

/** Captures an approved order and verifies it completed — and, when `expected`
 * is given, paid the amount we asked (Pro is checked; purchases just need COMPLETED). */
export async function captureOrder(orderId: string, expected: { currency_code: string; value: string } | null = PRO_PRICE): Promise<CaptureResult> {
  const token = await accessToken()
  const res = await fetch(`${baseUrl()}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) return { ok: false, status: `HTTP ${res.status}`, captureId: null }
  const data = (await res.json()) as {
    status?: string
    purchase_units?: { payments?: { captures?: { id?: string; amount?: { currency_code?: string; value?: string } }[] } }[]
  }
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0]
  const paid =
    data.status === 'COMPLETED' &&
    (!expected ||
      (capture?.amount?.currency_code === expected.currency_code && capture.amount.value === expected.value))
  return { ok: paid, status: data.status ?? 'UNKNOWN', captureId: capture?.id ?? null }
}
