import { logCost } from '../cost-log.ts'
import { redisConfig, redisPipeline } from '../rate-limit/store.ts'
import type { Outcome, OutcomeContext } from './schema.ts'

export const OUTCOME_HASH = 'vq:outcomes'

export interface StoredOutcome {
  ref: string
  sport: string
  retailer: string
  size: string
  outcome: Outcome
  reason?: string
  clickedAt: string
  reportedAt: string
}

/**
 * Keeps one report per click reference; a later report replaces an earlier one, because "fits well"
 * turning into "sent them back" is exactly the signal worth having. The shoe name is deliberately not
 * stored here: the click reference joins to the affiliate network's own record of what was bought.
 * Always logged; also written to Redis when a store is configured.
 */
export async function recordOutcome(
  context: OutcomeContext,
  report: { outcome: Outcome; reason?: string },
  now = new Date(),
): Promise<{ stored: boolean }> {
  const record: StoredOutcome = {
    ref: context.ref,
    sport: context.sport,
    retailer: context.retailer,
    size: context.size,
    outcome: report.outcome,
    ...(report.reason ? { reason: report.reason } : {}),
    clickedAt: new Date(context.at).toISOString(),
    reportedAt: now.toISOString(),
  }
  logCost('fit_outcome', {
    ref: record.ref,
    sport: record.sport,
    retailer: record.retailer,
    outcome: record.outcome,
    reason: record.reason ?? null,
  })
  const config = redisConfig()
  if (!config) return { stored: false }
  try {
    await redisPipeline(config, [['HSET', OUTCOME_HASH, record.ref, JSON.stringify(record)]])
    return { stored: true }
  } catch (error) {
    console.warn('[outcome] could not persist, kept in logs only', error)
    return { stored: false }
  }
}
