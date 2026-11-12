import { logCost } from '../cost-log.ts'
import { redisConfig, redisPipeline } from '../rate-limit/store.ts'

export const CAPTURE_HASH = 'vq:captures'

export interface StoredCapture {
  orderId: string
  captureId: string | null
  amount: string | null
  currency: string | null
  purpose: 'pro' | 'purchase'
  status: string
  capturedAt: string
}

/**
 * Records a server-verified PayPal capture immediately, so /lab and the till
 * ledger show it without waiting for PayPal's transaction-search index
 * (sandbox lags minutes to ~an hour). Always logged; also written to Redis
 * when a store is configured.
 */
export async function recordCapture(capture: Omit<StoredCapture, 'capturedAt'>): Promise<{ stored: boolean }> {
  const record: StoredCapture = { ...capture, capturedAt: new Date().toISOString() }
  logCost('paypal_capture', {
    orderId: record.orderId,
    captureId: record.captureId,
    purpose: record.purpose,
    status: record.status,
  })
  const config = redisConfig()
  if (!config) return { stored: false }
  try {
    await redisPipeline(config, [['HSET', CAPTURE_HASH, record.orderId, JSON.stringify(record)]])
    return { stored: true }
  } catch (error) {
    console.warn('[captures] could not persist, kept in logs only', error)
    return { stored: false }
  }
}
