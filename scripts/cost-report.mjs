#!/usr/bin/env node
/**
 * Unit economics from the structured cost logs.
 *
 *   npx vercel logs --since 24h --json | node scripts/cost-report.mjs
 *
 * Prices are ASSUMPTIONS until you set them for your provider (USD):
 *   PRICE_IN_PER_M=0.30  PRICE_OUT_PER_M=1.20  TAVILY_USD_PER_CALL=0.012  STOCK_USD_PER_CHECK=0.05
 * Revenue side (to see break-even): AVG_PRICE_GBP=130 COMMISSION=0.05 RETURN_REVERSAL=0.18 ATTRIBUTION=0.6
 */
import { createInterface } from 'node:readline'

const num = (k, d) => (Number.isFinite(Number(process.env[k])) && process.env[k] ? Number(process.env[k]) : d)
const P = {
  inM: num('PRICE_IN_PER_M', 0.3), outM: num('PRICE_OUT_PER_M', 1.2), tavily: num('TAVILY_USD_PER_CALL', 0.012),
  stock: num('STOCK_USD_PER_CHECK', 0.05), price: num('AVG_PRICE_GBP', 130), commission: num('COMMISSION', 0.05),
  reversal: num('RETURN_REVERSAL', 0.18), attribution: num('ATTRIBUTION', 0.6), usdPerGbp: num('USD_PER_GBP', 1.27),
}

const events = []
for await (const line of createInterface({ input: process.stdin })) {
  let obj
  try { obj = JSON.parse(line) } catch { continue }
  if (obj && typeof obj.message === 'string') { try { obj = JSON.parse(obj.message) } catch { continue } }
  if (obj?.kind === 'cost') events.push(obj)
}

const by = (name) => events.filter((e) => e.event === name)
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0 }
const usd = (n) => `$${n.toFixed(3)}`

const runs = by('agent_run')
const ok = runs.filter((r) => r.outcome !== 'failed' && !r.error)
const withTokens = ok.filter((r) => typeof r.inputTokens === 'number')
const llmCost = (r) => ((r.inputTokens ?? 0) * P.inM + (r.outputTokens ?? 0) * P.outM) / 1e6
const runCost = (r) => llmCost(r) + (r.tavilyCalls ?? 0) * P.tavily
const checks = by('paid_call').filter((e) => e.route === 'stock-check')
const okChecks = checks.filter((c) => c.ok && c.cache !== 'cache')

console.log(`events: ${events.length}   agent runs: ${runs.length} (${ok.length} ok, ${runs.length - ok.length} failed)`)
const reasons = {}
for (const r of runs.filter((x) => x.error)) reasons[r.reason ?? 'error'] = (reasons[r.reason ?? 'error'] ?? 0) + 1
if (Object.keys(reasons).length) console.log('failures:', JSON.stringify(reasons))
if (!ok.length) { console.log('\nNo completed fittings in this window; nothing to cost.'); process.exit(0) }

const perFitting = avg(ok.map(runCost))
const perStock = P.stock
console.log(`\nper completed fitting (assumed prices):`)
console.log(`  steps ${avg(ok.map((r) => r.steps ?? 0)).toFixed(1)}   tavily calls ${avg(ok.map((r) => r.tavilyCalls ?? 0)).toFixed(1)}   tokens in/out ${Math.round(avg(withTokens.map((r) => r.inputTokens)))}/${Math.round(avg(withTokens.map((r) => r.outputTokens)))}${withTokens.length < ok.length ? `  (${ok.length - withTokens.length} runs lacked usage)` : ''}`)
console.log(`  latency p50 ${Math.round(pct(ok.map((r) => r.ms), 0.5) / 1000)}s  p90 ${Math.round(pct(ok.map((r) => r.ms), 0.9) / 1000)}s`)
console.log(`  LLM ${usd(avg(ok.map(llmCost)))}  Tavily ${usd(avg(ok.map((r) => (r.tavilyCalls ?? 0) * P.tavily)))}  => agent ${usd(perFitting)}`)
console.log(`  stock checks: ${checks.length} (${okChecks.length} billable) => ~${usd(perStock)} each; a fitting that picks a shoe adds ~${usd(perStock)}`)
const total = perFitting + perStock
console.log(`  all-in per fitting that reaches a size check: ${usd(total)}  (~£${(total / P.usdPerGbp).toFixed(2)})`)

const net = P.price * P.commission * (1 - P.reversal) * P.attribution
const breakEven = (total / P.usdPerGbp) / net
console.log(`\nbreak-even (assumes £${P.price} basket, ${P.commission * 100}% commission, ${P.reversal * 100}% reversed, ${P.attribution * 100}% attributed):`)
console.log(`  expected commission per purchase £${net.toFixed(2)}  =>  ${(breakEven * 100).toFixed(1)}% of fittings must end in a tracked purchase`)
console.log(`  limit hits: ${by('limit_hit').length}   rejected shortlists: ${by('shortlist_rejected').length}`)
