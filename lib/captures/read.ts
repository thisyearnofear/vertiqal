import { redisConfig, redisPipeline } from '../rate-limit/store.ts'
import { CAPTURE_HASH, type StoredCapture } from './record.ts'

/** All recorded captures, newest first. Empty when no store is configured. */
export async function listCaptures(): Promise<StoredCapture[]> {
  const config = redisConfig()
  if (!config) return []
  try {
    const rows = await redisPipeline(config, [['HGETALL', CAPTURE_HASH]])
    const flat = rows?.[0]
    if (!Array.isArray(flat)) return []
    const captures: StoredCapture[] = []
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try {
        captures.push(JSON.parse(String(flat[i + 1])) as StoredCapture)
      } catch {
        // A corrupt row never sinks the whole feed.
      }
    }
    return captures.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
  } catch {
    return []
  }
}
