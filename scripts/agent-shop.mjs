#!/usr/bin/env node
/**
 * agent-shop — the inbound half of vertiqal's agentic-commerce demo.
 *
 * An *external* shopping agent: it reads a vertiqal fit passport over REST,
 * asks vertiqal's fit judge whether a shoe suits the owner, and — only when the
 * verdict is good — prepares a PayPal order. The shopper still approves the
 * payment themselves; the agent never spends without consent.
 *
 *   node scripts/agent-shop.mjs \
 *     --product "La Sportiva Solution Comp" --price 175 \
 *     --passport demo-running --base http://localhost:3000
 */

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) => (a.startsWith('--') ? [[a.slice(2), arr[i + 1]]] : [])),
)

const base = (args.base ?? 'http://localhost:3000').replace(/\/$/, '')
const passportRef = args.passport ?? 'demo-running'
const product = args.product
const price = args.price

const say = (step, detail) => console.log(`\n[${step}] ${detail}`)

if (!product || !price) {
  console.log('Usage: node scripts/agent-shop.mjs --product "Shoe name" --price 145 [--passport token] [--base url]')
  process.exit(1)
}

// 1. Read the fit passport the shopper already holds.
say('passport', `reading ${passportRef} from ${base}`)
const passportRes = await fetch(`${base}/api/passport/${passportRef}`)
if (!passportRes.ok) {
  console.error(`✗ passport rejected (${passportRes.status}) — sign a real one in the app, or use demo-running`)
  process.exit(1)
}
const envelope = await passportRes.json()
const passport = envelope.passport ?? envelope
say('passport', `✓ signed ${passport.sport ?? 'unknown'} passport — ${passport.metrics?.length ?? 0} measured signals`)

// 2. Ask vertiqal's fit judge whether this product suits the owner.
say('fit-check', `judging "${product}" against the passport`)
const fitRes = await fetch(`${base}/api/passport/${passportRef}/fit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ product }),
})
if (!fitRes.ok) {
  console.error(`✗ fit check failed (${fitRes.status})`)
  process.exit(1)
}
const verdict = await fitRes.json()
say('fit-check', `verdict: ${verdict.verdict} (score ${verdict.score}/100)`)
for (const reason of verdict.reasons ?? []) console.log(`        · ${reason}`)

if (verdict.verdict === 'poor-fit') {
  say('done', 'Not a match — the agent declines to buy. (Fit says no.)')
  process.exit(0)
}

// 3. Prepare the PayPal order — the agent can transact, not just recommend.
say('paypal', `creating £${price} order for "${product}"`)
const orderRes = await fetch(`${base}/api/paypal/order`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ description: `${product} — agent-verified fit`, amount: String(price) }),
})
if (!orderRes.ok) {
  console.error(`✗ order failed (${orderRes.status}) — PayPal credentials not set?`)
  process.exit(1)
}
const order = await orderRes.json()
say('done', `order ${order.id} ready`)
if (order.approveUrl) console.log(`\nApprove at:\n${order.approveUrl}\n`)
console.log('The shopper approves in PayPal; capture verifies COMPLETED server-side.')
