import { RETAILER_DOMAINS } from './domains.ts'

export const STOCK_CHECK_LIMIT = 6
export const STOCK_CHECK_WINDOW_MS = 10 * 60_000
export const STOCK_CACHE_TTL_MS = 10 * 60_000
export const STOCK_MAX_ACTIVE = 3

const TRACKING_PARAMS = new Set(['gclid', 'dclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid'])

export function normalizeStockUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    if (url.port && url.port !== '443') return null
    return url
  } catch {
    return null
  }
}

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`)

export function stockUrlAllowed(raw: string, extraHosts: string[] = []): boolean {
  const url = normalizeStockUrl(raw)
  if (!url) return false
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const allowed = [...RETAILER_DOMAINS, ...extraHosts].map((domain) => domain.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean)
  return allowed.some((domain) => hostMatches(host, domain))
}

export function stockTargetKey(productUrl: string, size: string): string | null {
  const url = normalizeStockUrl(productUrl)
  if (!url) return null
  const search = new URLSearchParams(url.search)
  for (const key of Array.from(search.keys())) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) search.delete(key)
  }
  const pairs = Array.from(search.entries()).sort(([a], [b]) => a.localeCompare(b))
  const canonical = `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '') || '/'}`
  return `${canonical}?${new URLSearchParams(pairs).toString()}#${size.trim().replace(/\s+/g, ' ').toUpperCase()}`
}

export function extraStockHosts(env = process.env.STOCK_CHECK_EXTRA_HOSTS): string[] {
  return (env ?? '').split(',').map((host) => host.trim()).filter(Boolean)
}

export function requestClientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    forwarded ||
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('fly-client-ip')?.trim() ||
    'unknown'
  )
}

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const buckets = new Map<string, { count: number; resetAt: number }>()
  return (key: string, now = Date.now()) => {
    if (buckets.size > 5_000) {
      for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey)
      if (buckets.size >= 5_000) return { allowed: false, retryAfterSec: 60, remaining: 0 }
    }
    const current = buckets.get(key)
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
    buckets.set(key, bucket)
    if (bucket.count >= limit) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)), remaining: 0 }
    }
    bucket.count += 1
    return { allowed: true, retryAfterSec: 0, remaining: limit - bucket.count }
  }
}

export function createTtlCache<T>(ttlMs: number) {
  const entries = new Map<string, { expiresAt: number; value: T }>()
  return {
    get(key: string, now = Date.now()) {
      const entry = entries.get(key)
      if (!entry) return null
      if (entry.expiresAt <= now) {
        entries.delete(key)
        return null
      }
      return entry
    },
    set(key: string, value: T, now = Date.now()) {
      entries.set(key, { value, expiresAt: now + ttlMs })
      if (entries.size > 500) {
        for (const [entryKey, entry] of entries) if (entry.expiresAt <= now) entries.delete(entryKey)
        while (entries.size > 500) {
          const oldest = entries.keys().next().value
          if (oldest === undefined) break
          entries.delete(oldest)
        }
      }
      return now + ttlMs
    },
  }
}

export type StockRunResult<T> =
  | { status: 'ok'; value: T; source: 'live' | 'cache' | 'shared'; cacheExpiresAt: number | null }
  | { status: 'invalid' }
  | { status: 'busy' }

export function createStockCheckRunner<T extends { verdict: string }>({
  check,
  cacheTtlMs = STOCK_CACHE_TTL_MS,
  maxActive = STOCK_MAX_ACTIVE,
}: {
  check: (target: { productName: string; productUrl: string; size: string }) => Promise<T>
  cacheTtlMs?: number
  maxActive?: number
}) {
  const cache = createTtlCache<T>(cacheTtlMs)
  const inFlight = new Map<string, Promise<T>>()
  let active = 0

  return async (
    target: { productName: string; productUrl: string; size: string },
    options: { fresh?: boolean } = {},
  ): Promise<StockRunResult<T>> => {
    const key = stockTargetKey(target.productUrl, target.size)
    if (!key) return { status: 'invalid' }

    const pending = inFlight.get(key)
    if (pending) {
      const value = await pending.catch(() => null)
      if (value) return { status: 'ok', value, source: 'shared', cacheExpiresAt: null }
    }

    if (!options.fresh) {
      const cached = cache.get(key)
      if (cached) return { status: 'ok', value: cached.value, source: 'cache', cacheExpiresAt: cached.expiresAt }
    }

    if (active >= maxActive) return { status: 'busy' }
    active += 1
    const work = Promise.resolve().then(() => check(target))
    inFlight.set(key, work)
    try {
      const value = await work
      const expiresAt = value.verdict === 'blocked' ? null : cache.set(key, value)
      return { status: 'ok', value, source: 'live', cacheExpiresAt: expiresAt }
    } finally {
      inFlight.delete(key)
      active -= 1
    }
  }
}
