#!/usr/bin/env node
/**
 * shopper-agent.mjs — a *second* agent, not Forma, buying for a shopper.
 *
 * The demo: Forma fits the shopper on-device and issues a signed Fit
 * Passport. This agent — a stand-in for any external shopping agent —
 * discovers the passport, reads it over MCP, searches Forma's catalog,
 * checks a candidate shoe against the shopper's measured gait, and when
 * the verdict clears, prepares a real PayPal order for the owner to
 * approve. No Forma UI is involved; this is agent-to-agent commerce.
 *
 * Usage:  node scripts/shopper-agent.mjs [--base http://localhost:3000] [--product "Asics Novablast 4"]
 */

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const BASE = arg('base', 'http://localhost:3000')
const PRODUCT = arg('product', 'Asics Novablast 4')
const PASSPORT = arg('passport', 'demo-running')

const dim = (s) => `\x1b[2m${s}\x1b[0m`
const bold = (s) => `\x1b[1m${s}\x1b[0m`
const cyan = (s) => `\x1b[36m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const amber = (s) => `\x1b[33m${s}\x1b[0m`

const say = (s) => console.log(s)
const step = (n, s) => say(`\n${bold(cyan(`[${n}]`))} ${bold(s)}`)
const kv = (k, v) => say(`    ${dim(k.padEnd(14))} ${v}`)
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

let rpcId = 0
let sessionId = null

async function mcp(method, params) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  })
  sessionId = res.headers.get('mcp-session-id') || sessionId
  const text = await res.text()
  // streamable-http may answer SSE; take the last data: frame
  const data = text.includes('data:')
    ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).pop()
    : text
  const msg = JSON.parse(data || '{}')
  if (msg.error) throw new Error(`MCP ${method}: ${msg.error.message}`)
  return msg.result
}

async function mcpTool(name, toolArgs) {
  const result = await mcp('tools/call', { name, arguments: toolArgs })
  const content = result?.content?.[0]
  if (content?.type !== 'text') return result
  try { return JSON.parse(content.text) } catch { return content.text }
}

async function main() {
  say('')
  say(bold('  SHOPPER-AGENT v0.1 — buying on behalf of a Fit Passport holder'))
  say(dim('  not part of forma · talks to it like any external agent would'))
  await pause(400)

  step(1, 'Handshaking with Forma\'s MCP endpoint')
  const init = await mcp('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'shopper-agent', version: '0.1.0' },
  })
  kv('server', `${init?.serverInfo?.name ?? 'forma'} ${init?.serverInfo?.version ?? ''}`.trim())
  kv('transport', 'streamable-http · /api/mcp')
  await pause(500)

  step(2, 'Reading the shopper\'s signed Fit Passport')
  const opened = await mcpTool('get_fit_passport', { passport: PASSPORT })
  const passport = opened.passport
  if (!passport) throw new Error(`Could not open passport: ${JSON.stringify(opened).slice(0, 200)}`)
  kv('issuer', opened.issuer ?? 'vertiqal')
  kv('sport', passport.sport)
  kv('size', passport.size)
  for (const m of (passport.metrics ?? []).slice(0, 4)) kv(m.label.toLowerCase(), `${m.value} ${m.unit}`)
  if (passport.profile?.summary) kv('profile', dim(passport.profile.summary.slice(0, 96)))
  await pause(600)

  step(3, `Searching Forma's catalog for a candidate`)
  const found = await mcpTool('find_products', { query: `${passport.sport} shoes` })
  const products = Array.isArray(found) ? found : (found?.products ?? found?.results ?? [])
  for (const p of products.slice(0, 3)) kv('candidate', `${p.name ?? p.title ?? JSON.stringify(p).slice(0, 60)}`)
  if (!products.length) kv('candidate', dim('(catalog returned none — checking the named shoe anyway)'))
  await pause(600)

  step(4, `Checking "${PRODUCT}" against the passport`)
  const verdict = await mcpTool('check_fit', { passport: PASSPORT, product: PRODUCT })
  kv('verdict', verdict.verdict === 'great-fit' ? green(verdict.verdict) : amber(verdict.verdict ?? 'unknown'))
  if (verdict.score !== undefined) kv('score', `${verdict.score}/100`)
  for (const r of (verdict.reasons ?? []).slice(0, 4)) kv('reason', dim(String(r).slice(0, 110)))
  await pause(600)

  if (verdict.verdict === 'poor-fit') {
    say(`\n${amber('  ◈ ABORT')} — the fit is wrong for this shopper. A good agent walks away;`)
    say(dim('    it does not push a shoe that will blister them.'))
    return
  }

  step(5, 'Verdict clears — preparing a PayPal order for owner approval')
  const price = (passport.picks ?? []).find((p) => p.name.toLowerCase().includes(PRODUCT.toLowerCase().split(' ')[0]))?.price
  const amount = (price ?? '140').replace(/[^\d.]/g, '') || '140'
  const orderRes = await fetch(`${BASE}/api/paypal/order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: `${PRODUCT} UK ${passport.size} — via Fit Passport`, amount }),
  })
  const order = await orderRes.json()
  if (!orderRes.ok) throw new Error(`PayPal order failed: ${JSON.stringify(order).slice(0, 160)}`)
  kv('order id', order.id ?? order.orderId ?? '(see response)')
  kv('amount', `£${amount} GBP · PayPal sandbox`)
  const approve = order.links?.find((l) => l.rel === 'approve')?.href ?? order.approveUrl ?? order.approvalUrl
  if (approve) kv('approval', dim(approve.slice(0, 110)))
  await pause(400)

  say('')
  say(green('  ✓ ORDER STAGED') + ' — the passport holder gets one approval link.')
  say(dim('    Their consent, their PayPal wallet. The agent never touches money'))
  say(dim('    without it — and if the fit is wrong after delivery, the same'))
  say(dim('    capture can refund itself.'))
  say('')
}

main().catch((err) => {
  console.error(`\n${amber('  ! ' + err.message)}`)
  process.exit(1)
})
