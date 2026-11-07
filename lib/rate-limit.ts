import { requestClientKey } from './agent/stock-policy.ts'
import { counterStore, type CounterStore } from './rate-limit/store.ts'

export type GuardedSurface =
  | 'agent'
  | 'deep'
  | 'tryon'
  | 'vision'
  | 'brief'
  | 'voice'
  | 'pose-vlmrun'
  | 'passport-fit'
  | 'catalog-search'
  | 'outcome'

export interface SurfacePolicy {
  visitorLimit: number
  globalDailyLimit: number
  windowMs?: number
}

const DAY_MS = 24 * 60 * 60_000

export const DEFAULT_SURFACE_POLICIES: Record<GuardedSurface, SurfacePolicy> = {
  agent: { visitorLimit: 6, globalDailyLimit: 250, windowMs: DAY_MS },
  deep: { visitorLimit: 2, globalDailyLimit: 80, windowMs: DAY_MS },
  tryon: { visitorLimit: 3, globalDailyLimit: 60, windowMs: DAY_MS },
  vision: { visitorLimit: 6, globalDailyLimit: 150, windowMs: DAY_MS },
  brief: { visitorLimit: 10, globalDailyLimit: 300, windowMs: DAY_MS },
  voice: { visitorLimit: 30, globalDailyLimit: 600, windowMs: DAY_MS },
  'pose-vlmrun': { visitorLimit: 24, globalDailyLimit: 300, windowMs: DAY_MS },
  'passport-fit': { visitorLimit: 15, globalDailyLimit: 300, windowMs: DAY_MS },
  'catalog-search': { visitorLimit: 30, globalDailyLimit: 1000, windowMs: DAY_MS },
  // No model call and a single Redis write, so these are generous: a shopper clicks out a few times and reports once or twice.
  outcome: { visitorLimit: 40, globalDailyLimit: 5000, windowMs: DAY_MS },
}

export const CAPACITY_MESSAGE = 'Forma is at capacity today — your measurement still works.'

export type GuardVerdict =
  | {
      allowed: true
      remaining: number
      retryAfterSec: 0
    }
  | {
      allowed: false
      status: 429 | 503
      reason: 'rate_limit' | 'capacity' | 'disabled'
      error: string
      remaining: 0
      retryAfterSec: number
    }

export function disabledSurfaces(env = process.env.FORMA_DISABLED_FEATURES): Set<string> {
  return new Set(
    (env ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

function envPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function createSurfaceGuard(
  policies: Record<GuardedSurface, SurfacePolicy> = DEFAULT_SURFACE_POLICIES,
  options: {
    getDisabled?: () => Set<string>
    getEnv?: (key: string) => string | undefined
    store?: CounterStore
  } = {},
) {
  const store = options.store ?? counterStore()
  const limits = new Map<GuardedSurface, { visitor: number; global: number; windowMs: number }>()

  const limitsFor = (surface: GuardedSurface) => {
    const policy = policies[surface]
    const visitorKey = `FORMA_VISITOR_LIMIT_${surface.toUpperCase().replace(/-/g, '_')}`
    const budgetKey = `FORMA_BUDGET_${surface.toUpperCase().replace(/-/g, '_')}`
    const visitor = envPositiveInt(options.getEnv?.(visitorKey) ?? process.env[visitorKey], policy.visitorLimit)
    const global = envPositiveInt(options.getEnv?.(budgetKey) ?? process.env[budgetKey], policy.globalDailyLimit)
    const windowMs = policy.windowMs ?? DAY_MS
    const existing = limits.get(surface)
    if (!existing || existing.visitor !== visitor || existing.global !== global || existing.windowMs !== windowMs) {
      const next = { visitor, global, windowMs }
      limits.set(surface, next)
      return next
    }
    return existing
  }

  /** Counts a hit and turns it into a verdict. A store failure fails open: a broken counter must not block shoppers. */
  const count = async (key: string, limit: number, windowMs: number) => {
    try {
      const { count: hits, resetAt } = await store.hit(key, windowMs)
      return {
        allowed: hits <= limit,
        remaining: Math.max(0, limit - hits),
        retryAfterSec: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
      }
    } catch (error) {
      console.warn('[rate-limit] counter store unavailable, allowing this request', error)
      return { allowed: true, remaining: limit, retryAfterSec: 0 }
    }
  }

  return async function checkSurface(surface: GuardedSurface, clientKey: string): Promise<GuardVerdict> {
    const disabled = options.getDisabled ? options.getDisabled() : disabledSurfaces()
    if (disabled.has(surface)) {
      return {
        allowed: false,
        status: 503,
        reason: 'disabled',
        error: CAPACITY_MESSAGE,
        remaining: 0,
        retryAfterSec: 300,
      }
    }

    const { visitor: visitorLimit, global: globalLimit, windowMs } = limitsFor(surface)

    const visitor = await count(`vq:v:${surface}:${clientKey}`, visitorLimit, windowMs)
    if (!visitor.allowed) {
      return {
        allowed: false,
        status: 429,
        reason: 'rate_limit',
        error: 'Daily limit reached for this feature on your connection — your on-device measurement still works.',
        remaining: 0,
        retryAfterSec: visitor.retryAfterSec,
      }
    }

    const global = await count(`vq:g:${surface}`, globalLimit, windowMs)
    if (!global.allowed) {
      return {
        allowed: false,
        status: 503,
        reason: 'capacity',
        error: CAPACITY_MESSAGE,
        remaining: 0,
        retryAfterSec: global.retryAfterSec,
      }
    }

    return {
      allowed: true,
      remaining: Math.min(visitor.remaining, global.remaining),
      retryAfterSec: 0,
    }
  }
}

const defaultGuard = createSurfaceGuard()

export function guardSurfaceKey(surface: GuardedSurface, clientKey: string): Promise<GuardVerdict> {
  return defaultGuard(surface, clientKey)
}

export function guardRequest(request: Request, surface: GuardedSurface): Promise<GuardVerdict> {
  return defaultGuard(surface, requestClientKey(request))
}

export function guardResponse(verdict: Exclude<GuardVerdict, { allowed: true }>): Response {
  return Response.json(
    { error: verdict.error, reason: verdict.reason },
    {
      status: verdict.status,
      headers: {
        'X-RateLimit-Remaining': '0',
        ...(verdict.retryAfterSec ? { 'Retry-After': String(verdict.retryAfterSec) } : {}),
      },
    },
  )
}
