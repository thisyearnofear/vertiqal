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
 *     --product "La Sportiva Solution Comp" [--price 175] \
 *     --passport demo-running --base http://localhost:3000
 *
 * With CHANNEL3_API_KEY configured on the server, the run also shops the
 * catalog (find_products) and can take the order price from a real offer.
 */

import { readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

// Load .env.local so PAYPAL_CLIENT_ID/SECRET work without exporting anything.
try {
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {
  // No .env.local — rely on the real environment.
}

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

if (!product) {
  console.log('Usage: node scripts/agent-shop-mcp.mjs --product "Shoe" [--price 140] [--passport token] [--base url]')
  process.exit(1)
}

// PAYPAL_ACCESS_TOKEN wins; otherwise mint one from the client credentials —
// the same client-credentials grant the app's REST client uses.
if (!process.env.PAYPAL_ACCESS_TOKEN) {
  const id = process.env.PAYPAL_CLIENT_ID?.trim()
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim()
  if (!id || !secret) {
    console.error('Set PAYPAL_ACCESS_TOKEN, or PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET (sandbox creds work).')
    process.exit(1)
  }
  const host = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
  const res = await fetch(`${host}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) {
    console.error(`PayPal auth failed (${res.status}) — check the client id/secret.`)
    process.exit(1)
  }
  process.env.PAYPAL_ACCESS_TOKEN = (await res.json()).access_token
  say('auth', `minted ${process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox'} access token`)
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
    console.error(`✗ fit check failed: ${verdict ?? 'no result'}`)
    process.exit(1)
  }
  say('fit-check', `verdict: ${verdict.verdict} (score ${verdict.score}/100)`)
  for (const reason of verdict.reasons ?? []) console.log(`        · ${reason}`)

  if (verdict.verdict === 'poor-fit') {
    say('done', 'Not a match — the agent declines to buy. (Fit says no.)')
    process.exit(0)
  }

  // Shop the catalog: find_products returns real merchant offers (price,
  // stockist, availability) so the agent buys a product it can actually point to.
  let offer = null
  const catalogResult = await vertiqal.callTool({ name: 'find_products', arguments: { query: product, limit: 5 } })
  const catalog = textOf(catalogResult)
  if (!catalogResult.isError && catalog?.products?.length) {
    offer =
      catalog.products
        .flatMap((p) => (p.offers ?? []).map((o) => ({ ...o, product: p.title })))
        .filter((o) => o.availability === 'InStock')
        .sort((a, b) => a.price - b.price)[0] ?? null
    if (offer) {
      say('catalog', `best in-stock offer: ${offer.product} — ${offer.currency} ${offer.price} at ${offer.domain}`)
      console.log(`        buy link: ${offer.url}`)
    } else {
      say('catalog', `${catalog.count} products found, none in stock`)
    }
  } else {
    say('catalog', 'catalog unavailable — continuing without offers')
  }

  const orderPrice = price ?? offer?.price
  if (!orderPrice) {
    console.error('No --price given and the catalog had no in-stock offer to price from.')
    process.exit(1)
  }

  say('paypal', `create_order $${orderPrice} via @paypal/mcp`)
  // @paypal/mcp exposes a simplified order schema (not raw Orders v2):
  // currencyCode is USD-only, items carry name/itemCost/itemTotal.
  const orderResult = await paypal.callTool({
    name: 'create_order',
    arguments: {
      currencyCode: 'USD',
      items: [{ name: `${product} — agent-verified fit`, quantity: 1, itemCost: Number(orderPrice), itemTotal: Number(orderPrice) }],
    },
  })
  const order = textOf(orderResult)
  if (!order || orderResult.isError) {
    console.error(`✗ order failed: ${order ?? 'no result'}`)
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
