import { RETAILER_DOMAINS } from './domains.ts'
import { createTtlCache } from './stock-policy.ts'

export const TAVILY_CACHE_TTL_MS = 6 * 60 * 60_000

const searchCache = createTtlCache<SearchHit[]>(TAVILY_CACHE_TTL_MS)
const inFlightSearches = new Map<string, Promise<SearchHit[]>>()

export function tavilyCacheKey(
  query: string,
  domains: string[],
  maxResults: number,
  depth: 'basic' | 'advanced',
): string {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, ' ')
  const normalizedDomains = [...domains]
    .map((d) => d.trim().toLowerCase())
    .sort()
    .join(',')
  return `${depth}:${maxResults}:${normalizedDomains}:${normalizedQuery}`
}

export interface SearchHit {
  title: string
  url: string
  snippet: string
}

/** Where runners and climbers actually talk about how shoes wear, fit and fail. */
const COMMUNITY_DOMAINS = [
  'reddit.com',
  'ukclimbing.com',
  'mountainproject.com',
  'letsrun.com',
  'runnersworld.com',
  'runrepeat.com',
  'believeintherun.com',
  'doctorsofrunning.com',
  'weighmyrack.com',
  'climbing.com',
]

const RESEARCH_DOMAINS = [
  'pubmed.ncbi.nlm.nih.gov',
  'pmc.ncbi.nlm.nih.gov',
  'bjsm.bmj.com',
  'journals.lww.com',
  'journals.sagepub.com',
  'jospt.org',
  'link.springer.com',
  'sciencedirect.com',
  'frontiersin.org',
  'mdpi.com',
]

/**
 * Retailer domains also host homepages, careers and corporate pages that a
 * fitting can't cite. Prefer URLs that at least look like product pages —
 * deeper paths, no corporate subdomain. Falls back to the raw list rather
 * than emptying it.
 */
const NON_PRODUCT_HOST = /^(about|careers|jobs|investors?|news|press|help|support|stores?)\./i

function looksLikeProductPage(url: string): boolean {
  try {
    const u = new URL(url)
    if (NON_PRODUCT_HOST.test(u.hostname)) return false
    return u.pathname.replace(/\/+$/, '').split('/').filter(Boolean).length >= 2
  } catch {
    return false
  }
}

function preferProductPages(hits: SearchHit[]): SearchHit[] {
  const product = hits.filter((h) => looksLikeProductPage(h.url))
  return product.length ? product : hits
}

export const searchWeb = (query: string) =>
  tavily(query, RETAILER_DOMAINS, 8, 'advanced').then(preferProductPages)
export const searchCommunity = (query: string) => tavily(query, COMMUNITY_DOMAINS)
export const searchResearch = (query: string) => tavily(query, RESEARCH_DOMAINS, 5)
/** Unrestricted search, for athlete and race-kit coverage that lives on news and brand sites. */
export const searchOpen = (query: string) => tavily(query, [], 4)

async function tavily(
  query: string,
  domains: string[],
  maxResults = 8,
  depth: 'basic' | 'advanced' = 'basic',
): Promise<SearchHit[]> {
  const key = tavilyCacheKey(query, domains, maxResults, depth)
  const cached = searchCache.get(key)
  if (cached) return cached.value

  const pending = inFlightSearches.get(key)
  if (pending) return pending

  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) throw new Error('TAVILY_API_KEY is not configured')

  const work = (async () => {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: depth,
        ...(domains.length ? { include_domains: domains } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`Tavily search failed (${response.status})`)

    const data = (await response.json()) as {
      results?: { title: string; url: string; content: string }[]
    }
    const hits = (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content.slice(0, 400),
    }))
    if (hits.length > 0) {
      searchCache.set(key, hits)
    }
    return hits
  })()

  inFlightSearches.set(key, work)
  try {
    return await work
  } finally {
    inFlightSearches.delete(key)
  }
}
