import { paypalRun, paypalToolingReady } from './toolkit'

/**
 * Forma Pro as a real PayPal subscription — not a one-off order. Product and
 * billing plan are created through the Agent Toolkit once (PAYPAL_PRO_PLAN_ID
 * caches the plan across restarts/deploys); each shopper's subscription goes
 * through create_subscription → PayPal approval → status check.
 */

const PLAN_NAME = 'Forma Pro'
const MONTHLY = { currency_code: 'GBP', value: '9.00' }

async function ensurePlanId(): Promise<string | null> {
  const configured = process.env.PAYPAL_PRO_PLAN_ID?.trim()
  if (configured) return configured
  if (!paypalToolingReady()) return null

  // Reuse an existing plan if one was already made — plans are merchant-scoped.
  const listed = await paypalRun<{ plans?: { id: string; status?: string }[] }>('list_subscription_plans', {}).catch(() => null)
  const existing = listed?.plans?.find((p) => p.status === 'ACTIVE')
  if (existing?.id) return existing.id

  const product = await paypalRun<{ id?: string }>('create_product', {
    name: PLAN_NAME,
    type: 'SERVICE',
    description: 'Unlimited hosted fitting features — vision, parses, try-on, movement history.',
  }).catch(() => null)
  if (!product?.id) return null

  const plan = await paypalRun<{ id?: string }>('create_subscription_plan', {
    product_id: product.id,
    name: `${PLAN_NAME} — monthly`,
    billing_cycles: [
      {
        frequency: { interval_unit: 'MONTH', interval_count: 1 },
        tenure_type: 'REGULAR',
        sequence: 1,
        pricing_scheme: { fixed_price: MONTHLY },
      },
    ],
    payment_preferences: { auto_bill_outstanding: true, setup_fee_failure_action: 'CONTINUE', payment_failure_threshold: 1 },
    taxes: { percentage: '0', inclusive: false },
  }).catch(() => null)
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
  const sub = await paypalRun<{ id?: string; links?: { rel: string; href: string }[] }>('create_subscription', {
    plan_id: planId,
    application_context: { brand_name: 'vertiqal · Forma Pro', user_action: 'SUBSCRIBE_NOW' },
  }).catch(() => null)
  if (!sub?.id) return null
  return { subscriptionId: sub.id, approveUrl: sub.links?.find((l) => l.rel === 'approve')?.href ?? null }
}

/** True once the shopper's subscription reports ACTIVE — call after approval. */
export async function subscriptionActive(subscriptionId: string): Promise<boolean> {
  const sub = await paypalRun<{ status?: string }>('show_subscription_details', { subscription_id: subscriptionId }).catch(() => null)
  return sub?.status === 'ACTIVE'
}
