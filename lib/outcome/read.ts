import { redisConfig, redisPipeline } from '../rate-limit/store.ts'
import { OUTCOME_HASH, type StoredOutcome } from './record.ts'

/** All recorded fit outcomes, newest report first. Empty when no store is configured. */
export async function listOutcomes(): Promise<StoredOutcome[]> {
  const config = redisConfig()
  if (!config) return []
  try {
    const rows = await redisPipeline(config, [['HGETALL', OUTCOME_HASH]])
    const flat = rows?.[0]
    if (!Array.isArray(flat)) return []
    const outcomes: StoredOutcome[] = []
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try {
        outcomes.push(JSON.parse(String(flat[i + 1])) as StoredOutcome)
      } catch {
        // A corrupt row never sinks the whole feed.
      }
    }
    return outcomes.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
  } catch {
    return []
  }
}
