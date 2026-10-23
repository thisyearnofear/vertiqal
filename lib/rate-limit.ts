import { createRateLimiter, requestClientKey } from './agent/stock-policy.ts'

export type GuardedSurface =
  | 'agent'
  | 'deep'
  | 'tryon'
  | 'vision'
  | 'brief'
  | 'voice'
  | 'pose-vlmrun'
  | 'passport-fit'

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
  } = {},
) {
  const visitorLimiters = new Map<GuardedSurface, ReturnType<typeof createRateLimiter>>()
  const globalLimiters = new Map<GuardedSurface, { limit: number; check: ReturnType<typeof createRateLimiter> }>()

  const getVisitorLimiter = (surface: GuardedSurface) => {
    const policy = policies[surface]
    const envKey = `FORMA_VISITOR_LIMIT_${surface.toUpperCase().replace(/-/g, '_')}`
    const limit = envPositiveInt(options.getEnv?.(envKey) ?? process.env[envKey], policy.visitorLimit)
    let limiter = visitorLimiters.get(surface)
    if (!limiter) {
      limiter = createRateLimiter({ limit, windowMs: policy.windowMs ?? DAY_MS })
      visitorLimiters.set(surface, limiter)
    }
    return limiter
  }

  const getGlobalLimiter = (surface: GuardedSurface) => {
    const policy = policies[surface]
    const envKey = `FORMA_BUDGET_${surface.toUpperCase().replace(/-/g, '_')}`
    const limit = envPositiveInt(options.getEnv?.(envKey) ?? process.env[envKey], policy.globalDailyLimit)
    const existing = globalLimiters.get(surface)
    if (!existing || existing.limit !== limit) {
      const check = createRateLimiter({ limit, windowMs: policy.windowMs ?? DAY_MS })
      globalLimiters.set(surface, { limit, check })
      return check
    }
    return existing.check
  }

  return function checkSurface(
    surface: GuardedSurface,
    clientKey: string,
    now = Date.now(),
  ): GuardVerdict {
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

    const visitor = getVisitorLimiter(surface)(clientKey, now)
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

    const global = getGlobalLimiter(surface)('global', now)
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

export function guardSurfaceKey(surface: GuardedSurface, clientKey: string): GuardVerdict {
  return defaultGuard(surface, clientKey)
}

export function guardRequest(request: Request, surface: GuardedSurface): GuardVerdict {
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
