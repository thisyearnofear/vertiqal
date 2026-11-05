#!/usr/bin/env node
/**
 * agent-shop-mcp — the headline agentic-commerce demo: ONE agent client wired
 * to TWO MCP servers.
 *
 *   vertiqal /api/mcp  → get_fit_passport, check_fit   (the shopper's body data)
 *   npx @paypal/mcp    → create_order                  (PayPal's own agent surface)
 *
 * The agent reads a signed fit passport, asks vertiqal's judge whether the shoe
 * suits the owner, and — only when fit says yes — opens a PayPal order through
 * PayPal's official MCP server. Consent stays with the shopper: the output is
 * an approve link, and capture is a separate verified step.
 *
 *   PAYPAL_ACCESS_TOKEN=... node scripts/agent-shop-mcp.mjs \
 *     --product "La Sportiva Solution Comp" --price 175 \
 *     --passport demo-running --base http://localhost:3000
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) => (a.startsWith('--') ? [[a.slice(2), arr[i + 1]]] : [])),
)

const base = (args.base ?? 'http://localhost:3000').replace(/\/$/, '')
const passportRef = args.passport ?? 'demo-running'
const product = args.product
const price = args.price

const say = (step, detail) => console.log(`\n[${step}] ${detail}`)
const textOf = (result) => {
  try {
    return JSON.parse(result.content?.[0]?.text ?? 'null')
  } catch {
    return result.content?.[0]?.text ?? null
  }
}

if (!product || !price) {
  console.log('Usage: node scripts/agent-shop-mcp.mjs --product "Shoe" --price 145 [--passport token] [--base url]')
  process.exit(1)
}
if (!process.env.PAYPAL_ACCESS_TOKEN) {
  console.error('PAYPAL_ACCESS_TOKEN is required — sandbox token from your PayPal developer dashboard.')
  process.exit(1)
}

const vertiqal = new Client({ name: 'agent-shop', version: '1.0.0' })
const paypal = new Client({ name: 'agent-shop', version: '1.0.0' })

try {
  say('mcp', `connecting vertiqal → ${base}/api/mcp`)
  await vertiqal.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`)))
  say('mcp', 'connecting PayPal → npx @paypal/mcp')
  await paypal.connect(
    new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@paypal/mcp', '--tools=orders.create'],
      env: { ...process.env, PAYPAL_ACCESS_TOKEN: process.env.PAYPAL_ACCESS_TOKEN, PAYPAL_ENVIRONMENT: 'SANDBOX' },
    }),
  )

  say('passport', `get_fit_passport ${passportRef}`)
  const passportResult = await vertiqal.callTool({ name: 'get_fit_passport', arguments: { passport: passportRef } })
  const passport = textOf(passportResult)
  if (!passport || passportResult.isError) {
    console.error('✗ passport rejected — sign a real one in the app, or use demo-running')
    process.exit(1)
  }
  say('passport', `✓ signed ${passport.passport?.sport ?? passport.sport ?? 'unknown'} passport`)

  say('fit-check', `check_fit "${product}"`)
  const fitResult = await vertiqal.callTool({ name: 'check_fit', arguments: { passport: passportRef, product } })
  const verdict = textOf(fitResult)
  if (!verdict || fitResult.isError) {
    console.error('✗ fit check failed')
    process.exit(1)
  }
  say('fit-check', `verdict: ${verdict.verdict} (score ${verdict.score}/100)`)
  for (const reason of verdict.reasons ?? []) console.log(`        · ${reason}`)

  if (verdict.verdict === 'poor-fit') {
    say('done', 'Not a match — the agent declines to buy. (Fit says no.)')
    process.exit(0)
  }

  say('paypal', `create_order £${price} via @paypal/mcp`)
  const orderResult = await paypal.callTool({
    name: 'create_order',
    arguments: {
      intent: 'CAPTURE',
      purchase_units: [{ description: `${product} — agent-verified fit`, amount: { currency_code: 'GBP', value: String(price) } }],
    },
  })
  const order = textOf(orderResult)
  if (!order || orderResult.isError) {
    console.error('✗ order failed')
    process.exit(1)
  }
  const approveUrl = (order.links ?? []).find((l) => l.rel === 'approve' || l.rel === 'payer-action')?.href
  say('done', `order ${order.id} ready`)
  if (approveUrl) console.log(`\nApprove at:\n${approveUrl}\n`)
  console.log('The shopper approves in PayPal; capture verifies COMPLETED server-side.')
} finally {
  await vertiqal.close().catch(() => {})
  await paypal.close().catch(() => {})
}
