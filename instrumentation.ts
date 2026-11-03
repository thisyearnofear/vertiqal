import type { Instrumentation } from 'next'
import { buildErrorReport } from './lib/error-report'

/**
 * Server error reporting without a vendor SDK. Every unhandled route/render/action error becomes
 * one structured log line (visible in Vercel logs), and is also POSTed to ERROR_WEBHOOK_URL when
 * set — a Slack/Discord-style incoming webhook that accepts { text }.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const report = buildErrorReport(error, request, context)
  console.error(JSON.stringify(report))

  const webhook = process.env.ERROR_WEBHOOK_URL?.trim()
  if (!webhook) return
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `vertiqal ${report.method} ${report.route} (${report.routeType}): ${report.message}` }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // Reporting must never turn one error into two.
  }
}
