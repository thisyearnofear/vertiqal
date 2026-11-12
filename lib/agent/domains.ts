/** UK shops with direct product pages, so picks link to somewhere you can actually buy. */
export const RETAILER_DOMAINS = [
  'sportsshoes.com',
  'runnersneed.com',
  'startfitness.co.uk',
  'sportsdirect.com',
  'prodirectsport.com',
  'jdsports.co.uk',
  'run4it.com',
  'therunningoutlet.co.uk',
  'asics.com',
  'brooksrunning.com',
  'newbalance.co.uk',
  'hoka.com',
  'saucony.com',
  'nike.com',
  'adidas.co.uk',
  'on.com',
  'decathlon.co.uk',
  'bananafingers.co.uk',
  'climbers-shop.com',
  'rockrun.com',
  'outside.co.uk',
  'snowandrock.com',
  'ellis-brigham.com',
  'alpinetrek.co.uk',
  'cotswoldoutdoor.com',
  'ldmountaincentre.com',
  'epictv.com',
  // Showroom + catalog merchants seen on camera — a pick from Channel3 or the
  // agent must never 403 the live stock check as "not an approved retailer".
  'laced.com',
  'endclothing.com',
  'asos.com',
  'johnlewis.com',
  'size.co.uk',
  'schuh.co.uk',
  'footlocker.co.uk',
  'office.co.uk',
  'soletrader.co.uk',
]

/**
 * Allowlisted shops whose product pages the stealth browser currently cannot read — Cloudflare or a
 * bot wall answers 403 instead of the page (observed live 2026-11-12: rockrun.com,
 * bananafingers.co.uk and sportsshoes.com all blocked; outside.co.uk and alpinetrek.co.uk returned
 * real pages). Offers here are not hidden or unchecked — they simply sort after an equivalent we
 * can verify, so a shortlist of three shoes is not three shelves we cannot confirm. Review this
 * list when a retailer changes its bot policy.
 */
export const BOT_WALLED_HOSTS = ['rockrun.com', 'bananafingers.co.uk', 'sportshoes.com', 'sportsshoes.com']

export function hostIsBotWalled(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '')
  return BOT_WALLED_HOSTS.some((walled) => h === walled || h.endsWith(`.${walled}`))
}

/** Stable sort: offers from verifiable shops keep their order and lead the unverifiable ones. */
export function preferVerifiableOffers<T extends { domain: string }>(offers: T[]): T[] {
  return [...offers].sort((a, b) => Number(hostIsBotWalled(a.domain)) - Number(hostIsBotWalled(b.domain)))
}
