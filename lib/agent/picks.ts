/**
 * Same shoe model regardless of gender label, waterproof or width variant, punctuation or case:
 * "HOKA Speedgoat 6 GORE-TEX Men's Trail Running Shoes" = "Hoka Speedgoat 6".
 */
export function modelKey(name: string) {
  return name
    .toLowerCase()
    .replace(/gore[\s-]?tex|\bgtx\b|\bwaterproof\b|\bwp\b/g, ' ')
    .replace(/\b(men'?s|women'?s|mens|womens|unisex|wide|extra wide|2e|4e|running shoes?|trail shoes?|climbing shoes?|shoes?|trainers?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Comparable form of a product URL: no hash, query or trailing slash, lower-case host. */
export function urlKey(url: string) {
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '')}`
  } catch {
    return url.trim()
  }
}

/**
 * Why a shortlist is not three different, shoppable shoes, or null if it is. `productUrls` are the
 * links the product search actually returned; review and forum links from other tools don't count.
 */
export function shortlistProblem(picks: { name: string; url: string }[], productUrls?: Iterable<string>): string | null {
  const models = new Set(picks.map((p) => modelKey(p.name)))
  const urls = new Set(picks.map((p) => urlKey(p.url)))
  if (models.size < picks.length || urls.size < picks.length) {
    return 'Two picks are the same shoe (a GORE-TEX, wide or gender version counts as the same model). Search for another model if you need to, then call recommendProducts again with three different models.'
  }
  if (productUrls) {
    const allowed = new Set([...productUrls].map(urlKey))
    const stray = picks.filter((p) => !allowed.has(urlKey(p.url)))
    if (stray.length) {
      return `${stray.map((p) => p.name).join(' and ')} ${stray.length === 1 ? 'has' : 'have'} no product page from searchProducts (review or forum links don't count). Search for a UK product page if you need to, then call recommendProducts again.`
    }
  }
  return null
}

/**
 * Does this search-result title plausibly name the same shoe as the pick? Compares the normalised
 * model keys (brand + model + version; gender/waterproof/width/shoe-type stripped).
 */
export function sameShoe(pickName: string, title: string): boolean {
  const a = modelKey(pickName)
  const b = modelKey(title)
  if (!a || !b) return false
  if (a.includes(b) || b.includes(a)) return true
  const at = new Set(a.split(' ').filter((t) => t.length > 1))
  const bt = new Set(b.split(' ').filter((t) => t.length > 1))
  if (!at.size) return false
  // Version numbers must agree: Ghost 16 is not Ghost 15, even though the words overlap.
  const numsA = [...at].filter((t) => /\d/.test(t))
  const numsB = [...bt].filter((t) => /\d/.test(t))
  if (numsA.length && numsB.length && !numsA.every((n) => numsB.includes(n))) return false
  const overlap = [...at].filter((t) => bt.has(t)).length
  return overlap >= 2 && overlap / at.size >= 0.6
}

/**
 * Flaky models sometimes cite a review/forum link for a shoe that the product search DID return a
 * real product page for. Rather than reject and burn another loop (which such models often fail to
 * recover from), swap in the grounded product URL. Only URLs that actually came back from the
 * product search are ever used, so nothing is invented; a pick with no matching product page keeps
 * its URL and is still rejected by shortlistProblem.
 */
export function reconcileUrl(
  pick: { name: string; url: string },
  hits: { title: string; url: string }[],
  allowed: Set<string>,
): string {
  if (allowed.has(urlKey(pick.url))) return pick.url
  const match = hits.find((h) => sameShoe(pick.name, h.title))
  return match ? match.url : pick.url
}
