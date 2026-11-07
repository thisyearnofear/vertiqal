import { accessToken, baseUrl, paypalConfigured, PRO_PRICE } from './orders'

/**
 * Forma Pro as a real PayPal subscription — not a one-off order. Product and
 * billing plan are created once (PAYPAL_PRO_PLAN_ID caches the plan across
 * restarts/deploys); each shopper's subscription goes through create → PayPal
 * approval → status check. Direct REST like orders.ts — the Agent Toolkit
 * path silently refused these calls, so the subscription flow uses the same
 * minimal client that the proven order flow uses.
 */

const PLAN_NAME = 'Forma Pro'

const call = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T | null> => {
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

async function ensurePlanId(): Promise<string | null> {
  const configured = process.env.PAYPAL_PRO_PLAN_ID?.trim()
  if (configured) return configured
  if (!paypalConfigured()) return null

  // Reuse an existing plan if one was already made — plans are merchant-scoped.
  const listed = await call<{ plans?: { id: string; status?: string }[] }>('GET', '/v1/billing/plans')
  const existing = listed?.plans?.find((p) => p.status === 'ACTIVE')
  if (existing?.id) return existing.id

  const product = await call<{ id?: string }>('POST', '/v1/catalogs/products', {
    name: PLAN_NAME,
    type: 'SERVICE',
    description: 'Unlimited hosted fitting features — vision, parses, try-on, movement history.',
  })
  if (!product?.id) return null

  const plan = await call<{ id?: string }>('POST', '/v1/billing/plans', {
    product_id: product.id,
    name: `${PLAN_NAME} — monthly`,
    billing_cycles: [
      {
        frequency: { interval_unit: 'MONTH', interval_count: 1 },
        tenure_type: 'REGULAR',
        sequence: 1,
        pricing_scheme: { fixed_price: PRO_PRICE },
      },
    ],
    payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CONTINUE', payment_failure_threshold: 1 },
    taxes: { percentage: '0', inclusive: false },
  })
  return plan?.id ?? null
}

export interface StartedSubscription {
  subscriptionId: string
  approveUrl: string | null
}

/** Starts a Pro subscription — returns the PayPal approval link to hand the shopper. */
export async function startSubscription(): Promise<StartedSubscription | null> {
  const planId = await ensurePlanId()
  if (!planId) return null
  const sub = await call<{ id?: string; links?: { rel: string; href: string }[] }>('POST', '/v1/billing/subscriptions', {
    plan_id: planId,
    application_context: { brand_name: 'vertiqal · Forma Pro', user_action: 'SUBSCRIBE_NOW' },
  })
  if (!sub?.id) return null
  return { subscriptionId: sub.id, approveUrl: sub.links?.find((l) => l.rel === 'approve')?.href ?? null }
}

/** True once the shopper's subscription reports ACTIVE — call after approval. */
export async function subscriptionActive(subscriptionId: string): Promise<boolean> {
  const sub = await call<{ status?: string }>('GET', `/v1/billing/subscriptions/${subscriptionId}`)
  return sub?.status === 'ACTIVE'
}
