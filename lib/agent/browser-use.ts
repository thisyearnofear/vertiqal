import 'server-only'

const BASE_URL = 'https://api.browser-use.com/api/v4'
const MAX_COST_USD = 1.5

export type BasketRunStatus = 'queued' | 'dispatching' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface BasketOutcome {
  inStock: boolean
  addedToBasket: boolean
  price: string
  sizeSelected: string
  notes: string
}

export interface BasketRun {
  status: BasketRunStatus
  outcome: BasketOutcome | null
  summary: string | null
  error: string | null
  liveUrl: string | null
}

// Browser Use's strict outputSchema validation rejected otherwise-successful runs, so the agent
// ends with one pipe-delimited line instead and we parse it here.
const RESULT_LINE = /RESULT:\s*(ADDED|UNAVAILABLE|FAILED)\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*(.*)/i

function parseOutcome(result: string | null): BasketOutcome | null {
  const match = result?.match(RESULT_LINE)
  if (!match) return null
  const [, verdict, sizeSelected, price, notes] = match
  const kind = verdict.toUpperCase()
  return {
    inStock: kind === 'ADDED',
    addedToBasket: kind === 'ADDED',
    sizeSelected: sizeSelected.trim(),
    price: price.trim(),
    notes: notes.trim(),
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = process.env.BROWSER_USE_API_KEY
  if (!apiKey) throw new Error('BROWSER_USE_API_KEY is not configured')

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'X-Browser-Use-API-Key': apiKey, 'Content-Type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Browser Use ${response.status}: ${detail.slice(0, 200)}`)
  }
  return response.json() as Promise<T>
}

export async function startBasketRun(input: { productName: string; productUrl: string; size: string }) {
  const task = [
    `Open ${input.productUrl}.`,
    `This should be the product page for "${input.productName}". Dismiss any cookie or region banners.`,
    `Select size ${input.size}. Record whether that size is available and the price shown.`,
    'If it is available, add exactly one to the basket / bag, then stop.',
    'Never proceed to checkout, never create an account, never enter personal or payment details.',
    'End your final answer with exactly one line in this format:',
    'RESULT: ADDED|UNAVAILABLE|FAILED | <size you selected> | <price with currency> | <one short sentence for the shopper>',
  ].join(' ')

  const run = await request<{ id: string }>('/runs', {
    method: 'POST',
    body: JSON.stringify({
      task,
      maxCostUsd: MAX_COST_USD,
      browserSettings: { proxyCountryCode: 'uk' },
    }),
  })
  return { runId: run.id }
}

interface RunSummary {
  status: BasketRunStatus
  result: string | null
  error: string | null
  sessionId: string
}

export async function getBasketRun(runId: string): Promise<BasketRun> {
  const run = await request<RunSummary>(`/runs/${runId}`)
  const active = run.status === 'running' || run.status === 'dispatching'

  let liveUrl: string | null = null
  if (active) {
    const browsers = await request<{ items: { liveUrl: string | null; status: string }[] }>(
      `/browsers?agentSessionId=${run.sessionId}&pageSize=1`,
    ).catch(() => null)
    liveUrl = browsers?.items[0]?.liveUrl ?? null
  }

  const outcome = parseOutcome(run.result)
  const summary = run.result?.replace(RESULT_LINE, '').trim() || null

  return { status: run.status, outcome, summary, error: run.error, liveUrl }
}
