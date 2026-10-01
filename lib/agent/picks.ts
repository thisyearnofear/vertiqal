/** Same shoe model regardless of gender label, punctuation or case, e.g. "HOKA Speedgoat 6 Men's" = "Hoka Speedgoat 6". */
export function modelKey(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(men'?s|women'?s|mens|womens|unisex|wide|running shoes?|trail shoes?|climbing shoes?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Why a shortlist is not three different shoes, or null if it is. */
export function shortlistProblem(picks: { name: string; url: string }[]): string | null {
  const models = new Set(picks.map((p) => modelKey(p.name)))
  const urls = new Set(picks.map((p) => p.url.trim()))
  if (models.size < picks.length || urls.size < picks.length) {
    return 'Two picks are the same shoe. Call recommendProducts again with three different models, each with its own product URL from the search results.'
  }
  return null
}
