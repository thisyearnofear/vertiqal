
/**
 * Shared counters for the surface guard.
 *
 * Serverless functions are ephemeral and horizontally scaled, so an in-memory Map gives every
 * instance its own quota: the "global" daily cap was really a per-instance cap, and a shopper
 * could lift their own limit by landing on a different instance. When a Redis-compatible store is
 * configured (Vercel KV or Upstash), counters live there and the caps mean what the policy says.
 *
 * Without a store the guard falls back to in-process counters. That is strictly weaker, so it is
 * logged once at startup rather than failing closed and blocking every shopper.
 */

export interface CounterStore {
  /** Increments the counter for `key` and returns its new count and when the window resets. */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>
  /** Human-readable name, for logs. */
  readonly name: string
}

interface RedisConfig {
  url: string
  token: string
}

/** Reads a Redis-compatible REST config from either Vercel KV or Upstash env names. */
export function redisConfig(env: Record<string, string | undefined> = process.env): RedisConfig | null {
  const url = (env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL ?? '').trim()
  const token = (env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN ?? '').trim()
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ''), token }
}

/**
 * Counts with INCR + a window that is set once (NX), so the first request in a window decides how
 * long the window lasts and later requests extend nothing.
 */
export function createRedisCounterStore(config: RedisConfig): CounterStore {
  return {
    name: 'redis',
    async hit(key: string, windowMs: number) {
      const body = JSON.stringify([
        ['INCR', key],
        ['PEXPIRE', key, String(windowMs), 'NX'],
        ['PTTL', key],
      ])
      const response = await fetch(`${config.url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body,
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(`counter store returned ${response.status}`)
      const results = (await response.json()) as { result?: number | null }[]
      const count = Number(results?.[0]?.result ?? 0)
      const ttlMs = Number(results?.[2]?.result ?? windowMs)
      const resetAt = Date.now() + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : windowMs)
      return { count, resetAt }
    },
  }
}

/** In-process counters: the fallback when no shared store is configured. */
export function createMemoryCounterStore(): CounterStore {
  const buckets = new Map<string, { count: number; resetAt: number }>()
  return {
    name: 'memory',
    async hit(key: string, windowMs: number) {
      const now = Date.now()
      if (buckets.size > 5_000) {
        for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey)
      }
      const current = buckets.get(key)
      const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
      bucket.count += 1
      buckets.set(key, bucket)
      return { count: bucket.count, resetAt: bucket.resetAt }
    },
  }
}

let store: CounterStore | null = null

/** The store used by the surface guard: Redis when configured, memory otherwise. */
export function counterStore(): CounterStore {
  if (store) return store
  const config = redisConfig()
  store = config ? createRedisCounterStore(config) : createMemoryCounterStore()
  if (!config) {
    console.warn(
      '[rate-limit] No shared counter store configured (KV_REST_API_URL / UPSTASH_REDIS_REST_URL). ' +
        'Limits are per serverless instance until one is set.',
    )
  }
  return store
}

/** Test seam: swap the store. */
export function setCounterStore(next: CounterStore | null) {
  store = next
}
