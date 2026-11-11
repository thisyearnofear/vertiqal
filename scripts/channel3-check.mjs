#!/usr/bin/env node
/**
 * channel3-check — proves the Channel3 catalog path end to end for demo evidence.
 * Hits the real API with CHANNEL3_API_KEY and prints ranked products with
 * per-merchant offers (price, availability, stockist, commission rate).
 *
 *   node scripts/channel3-check.mjs ["query"] [--limit 5]
 */

import { readFileSync } from 'node:fs'

try {
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {
  // No .env.local — rely on the real environment.
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) => (a.startsWith('--') ? [[a.slice(2), arr[i + 1]]] : [])),
)
const query = positional[0] ?? 'La Sportiva Solution Comp climbing shoe'
const limit = Number(args.limit ?? 5)

const key = process.env.CHANNEL3_API_KEY?.trim()
if (!key) {
  console.error('CHANNEL3_API_KEY is not set — sign up free at https://trychannel3.com/sign-up/developer')
  process.exit(1)
}

const res = await fetch('https://api.trychannel3.com/v1/search', {
  method: 'POST',
  headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query,
    limit: Math.min(Math.max(limit, 1), 30),
    config: {
      country: process.env.CHANNEL3_COUNTRY?.trim() || 'GB',
      currency: process.env.CHANNEL3_CURRENCY?.trim() || 'GBP',
    },
  }),
  signal: AbortSignal.timeout(15_000),
})

if (!res.ok) {
  console.error(`Channel3 search failed (${res.status}): ${await res.text().catch(() => '')}`)
  process.exit(1)
}

const { products = [] } = await res.json()
console.log(`query: "${query}" → ${products.length} products\n`)

for (const p of products) {
  const brand = p.brands?.[0]?.name ?? 'unbranded'
  console.log(`${p.title}  ·  ${brand}`)
  for (const o of (p.offers ?? []).slice(0, 4)) {
    const price = typeof o.price?.price === 'number' ? `${o.price.currency ?? ''} ${o.price.price}` : '—'
    const commission = typeof o.max_commission_rate === 'number' ? ` · ${(o.max_commission_rate * 100).toFixed(0)}% commission` : ''
    console.log(`    ${o.availability === 'OutOfStock' ? '✗' : '✓'} ${price} @ ${o.domain ?? '?'}${commission}`)
  }
  console.log()
}
