import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk'

/**
 * The single PayPal Agent Toolkit instance — the agentic execution layer.
 * The toolkit bundles an older ai-sdk whose `Tool` shape differs from this
 * project's v6 `inputSchema` typing, so it is used as the execution layer
 * (auth, API surface, validation) behind our own typed `tool()` wrappers
 * rather than spread into the agent's tool map.
 *
 * Actions are whitelisted so anything invoked through `paypalRun` can only be
 * what the product actually needs — nothing destructive is ever exposed.
 */

const ACTIONS = {
  orders: { create: true, get: true },
  payments: { createRefund: true, getRefunds: true },
  subscriptions: { create: true, show: true },
  subscriptionPlans: { create: true, list: true, show: true },
  shipment: { create: true, get: true, update: true },
  disputes: { list: true, get: true },
  transactions: { list: true },
  insights: { get: true },
} as const

export type ToolkitMethod =
  | 'create_order'
  | 'get_order'
  | 'pay_order'
  | 'create_refund'
  | 'get_refund'
  | 'create_product'
  | 'list_subscription_plans'
  | 'create_subscription'
  | 'create_subscription_plan'
  | 'show_subscription_details'
  | 'create_shipment_tracking'
  | 'get_shipment_tracking'
  | 'update_shipment_tracking'
  | 'list_disputes'
  | 'get_dispute'
  | 'list_transactions'
  | 'get_merchant_insights'

let instance: PayPalAgentToolkit | null = null

function toolkit(): PayPalAgentToolkit | null {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim()
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  if (!instance) {
    instance = new PayPalAgentToolkit({
      clientId,
      clientSecret,
      configuration: { actions: ACTIONS, context: { sandbox: process.env.PAYPAL_ENV !== 'live' } },
    })
  }
  return instance
}

export function paypalToolingReady() {
  return toolkit() !== null
}

interface ExecutableTool {
  execute?: (args: unknown, options: unknown) => Promise<unknown>
}

/**
 * Runs a whitelisted toolkit method through the toolkit's own client — agent
 * tools and API routes both delegate here, so PayPal execution is always the
 * official Agent Toolkit path. Returns null when PayPal is not configured.
 */
export async function paypalRun<T = unknown>(method: ToolkitMethod, input: unknown): Promise<T | null> {
  const t = toolkit()
  if (!t) return null
  const tool = t.getTools()[method] as unknown as ExecutableTool | undefined
  if (!tool?.execute) return null
  return (await tool.execute(input, {})) as T
}
