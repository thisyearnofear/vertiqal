import 'server-only'

/**
 * Channel3 — the product-catalog layer for agentic commerce. One API returns
 * structured products with per-merchant offers (price, availability, domain,
 * affiliate-tracked URL, commission rate) across 25k+ retailers — the catalog
 * the fitting agent shops from instead of scraping web results.
 *
 * CHANNEL3_API_KEY gates everything; without it the catalog tools degrade to
 * the existing Tavily web-search path. Country/currency default to GB/GBP to
 * match the shopper base; override with CHANNEL3_COUNTRY / CHANNEL3_CURRENCY.
 */

const BASE = 'https://api.trychannel3.com'

export function channel3Configured() {
  return Boolean(process.env.CHANNEL3_API_KEY?.trim())
}

export interface CatalogOffer {
  url: string
  domain: string
  price: number
  currency: string
  availability: 'InStock' | 'OutOfStock'
  /** Fraction 0–0.5 when Channel3 reports a commission on this offer. */
  commissionRate: number | null
}

export interface CatalogProduct {
  id: string
  title: string
  brand: string | null
  imageUrl: string | null
  category: string | null
  offers: CatalogOffer[]
}

interface RawOffer {
  url?: string
  domain?: string
  price?: { price?: number; currency?: string }
  availability?: string
  max_commission_rate?: number | null
}

interface RawProduct {
  id?: string
  title?: string
  images?: { url?: string; is_main_image?: boolean }[]
  brands?: { name?: string }[]
  category?: { title?: string } | null
  offers?: RawOffer[]
}

export async function searchCatalog(query: string, limit = 8): Promise<CatalogProduct[]> {
  const key = process.env.CHANNEL3_API_KEY?.trim()
  if (!key) return []
  const res = await fetch(`${BASE}/v1/search`, {
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
  if (!res.ok) throw new Error(`Channel3 search failed (${res.status})`)
  const data = (await res.json()) as { products?: RawProduct[]; data?: RawProduct[] }
  return (data.products ?? data.data ?? []).flatMap((p) => {
    if (!p.id || !p.title) return []
    const offers = (p.offers ?? []).flatMap((o): CatalogOffer[] => {
      if (!o.url || typeof o.price?.price !== 'number') return []
      return [
        {
          url: o.url,
          domain: o.domain ?? '',
          price: o.price.price,
          currency: o.price.currency ?? 'GBP',
          availability: o.availability === 'OutOfStock' ? 'OutOfStock' : 'InStock',
          commissionRate: typeof o.max_commission_rate === 'number' ? o.max_commission_rate : null,
        },
      ]
    })
    if (!offers.length) return []
    const main = p.images?.find((i) => i.is_main_image) ?? p.images?.[0]
    return [
      {
        id: p.id,
        title: p.title,
        brand: p.brands?.[0]?.name ?? null,
        imageUrl: main?.url ?? null,
        category: p.category?.title ?? null,
        offers: offers.slice(0, 4),
      },
    ]
  })
}
