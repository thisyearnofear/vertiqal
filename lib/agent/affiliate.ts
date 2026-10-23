import { normalizeStockUrl, stockUrlAllowed } from './stock-policy.ts'

export const AFFILIATE_DISCLOSURE = 'We may earn a commission. It never changes the ranking.'

export interface AffiliateLink {
  href: string
  affiliated: boolean
}

/**
 * Parses `domain:merchantId,domain2:merchantId2` from env into a host lookup map.
 */
export function parseAffiliateMerchants(raw = process.env.NEXT_PUBLIC_AWIN_MERCHANTS): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of (raw ?? '').split(',')) {
    const [domain, mid] = entry.split(':').map((part) => part?.trim() ?? '')
    if (!domain || !mid || !/^\d+$/.test(mid)) continue
    map.set(domain.toLowerCase().replace(/^www\./, ''), mid)
  }
  return map
}

function findMerchantId(hostname: string, merchants: Map<string, string>): string | null {
  const host = hostname.toLowerCase().replace(/^www\./, '')
  for (const [domain, mid] of merchants) {
    if (host === domain || host.endsWith(`.${domain}`)) return mid
  }
  return null
}

/**
 * Applies affiliate wrapping strictly after ranking/recommendation at outbound Buy link time.
 * Never mutates the canonical product URL used for stock verification or Fit Passports.
 */
export function wrapAffiliateUrl(
  rawUrl: string,
  options: {
    affiliateId?: string
    merchants?: Map<string, string>
    extraHosts?: string[]
  } = {},
): AffiliateLink {
  const parsed = normalizeStockUrl(rawUrl)
  if (!parsed || !stockUrlAllowed(rawUrl, options.extraHosts ?? [])) {
    return { href: rawUrl, affiliated: false }
  }

  const affiliateId = (options.affiliateId ?? process.env.NEXT_PUBLIC_AWIN_AFFILIATE_ID ?? '').trim()
  if (!affiliateId || !/^\d+$/.test(affiliateId)) {
    return { href: parsed.toString(), affiliated: false }
  }

  const merchants = options.merchants ?? parseAffiliateMerchants()
  const merchantId = findMerchantId(parsed.hostname, merchants)
  if (!merchantId) {
    return { href: parsed.toString(), affiliated: false }
  }

  const awin = new URL('https://www.awin1.com/cread.php')
  awin.searchParams.set('awinmid', merchantId)
  awin.searchParams.set('awinaffid', affiliateId)
  awin.searchParams.set('ued', parsed.toString())
  return { href: awin.toString(), affiliated: true }
}
