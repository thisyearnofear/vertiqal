import 'server-only'

export interface SearchHit {
  title: string
  url: string
  snippet: string
}

/** UK shops with direct product pages, so picks link to somewhere you can actually buy. */
const RETAILER_DOMAINS = [
  'sportsshoes.com',
  'runnersneed.com',
  'startfitness.co.uk',
  'sportsdirect.com',
  'prodirectsport.com',
  'jdsports.co.uk',
  'asics.com',
  'brooksrunning.com',
  'newbalance.co.uk',
  'hoka.com',
  'saucony.com',
  'nike.com',
  'adidas.co.uk',
  'on.com',
]

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

export const searchWeb = (query: string) => tavily(query, RETAILER_DOMAINS)
export const searchCommunity = (query: string) => tavily(query, COMMUNITY_DOMAINS)

async function tavily(query: string, domains: string[]): Promise<SearchHit[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) throw new Error('TAVILY_API_KEY is not configured')

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      max_results: 8,
      search_depth: 'basic',
      include_domains: domains,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Tavily search failed (${response.status})`)

  const data = (await response.json()) as {
    results?: { title: string; url: string; content: string }[]
  }
  return (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content.slice(0, 400),
  }))
}
