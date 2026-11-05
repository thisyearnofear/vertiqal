import { BRIEF_COOKIE, parseRememberedBrief } from './remembered-brief.ts'

/**
 * A random per-browser id that joins a shopper's journey across funnel events and server
 * cost logs — no accounts, no PII. Client components call visitorId() lazily (the cookie is
 * created on first funnel event, well before /api/agent runs, so the request then carries
 * it to the server where vidFromRequest reads the same value into logCost fields).
 */
export const VISITOR_COOKIE = 'vertiqal-vid'

const VID_PATTERN = /^vq-[A-Za-z0-9-]{6,64}$/
const ONE_YEAR = 365 * 24 * 60 * 60

function cookieValue(name: string, header: string | null | undefined): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

/** Server-side: the visitor id this request arrived with, or null when absent/invalid. */
export function vidFromRequest(request: Request): string | null {
  const value = cookieValue(VISITOR_COOKIE, request.headers.get('cookie'))
  return value && VID_PATTERN.test(value) ? value : null
}

let cached: string | null = null

/** Client-side: get or create this browser's id (first-party cookie, one year). */
export function visitorId(): string | null {
  if (typeof document === 'undefined') return null
  if (cached) return cached
  const existing = cookieValue(VISITOR_COOKIE, document.cookie)
  if (existing && VID_PATTERN.test(existing)) return (cached = existing)
  const vid = `vq-${crypto.randomUUID()}`
  document.cookie = `${VISITOR_COOKIE}=${vid}; path=/; max-age=${ONE_YEAR}; samesite=lax`
  return (cached = vid)
}

/** Client-side: does this browser hold a remembered brief — i.e. is this a returning shopper? */
export function hasRememberedBrief(): boolean {
  if (typeof document === 'undefined') return false
  return parseRememberedBrief(cookieValue(BRIEF_COOKIE, document.cookie) ?? undefined) !== null
}
