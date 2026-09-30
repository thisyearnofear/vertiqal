import { stockUrlAllowed } from './stock-policy.ts'

export interface StockPageEvidence {
  finalUrl: string
  httpStatus: number | null
  title: string
  headings: string[]
  productNames: string[]
  sizes: string[]
  blocked: boolean
}

export type StockPageGate =
  | { status: 'verified' }
  | { status: 'blocked' | 'unclear'; evidence: string }

const GENERIC_TOKENS = new Set([
  'men',
  'mens',
  'women',
  'womens',
  'unisex',
  'running',
  'climbing',
  'shoe',
  'shoes',
  'trainer',
  'trainers',
])

function tokens(text: string): string[] {
  return (
    text
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .match(/[a-z0-9]+/g) ?? []
  )
}

const SOFT_ERROR = /^(?:page not found|product not found|404(?:\b|\s)|something went wrong|sign in(?:\b|\s)|log in(?:\b|\s)|login(?:\b|\s))/i

function identityTokens(productName: string): string[] {
  return tokens(productName).filter((token) => !GENERIC_TOKENS.has(token))
}

export function inspectStockPage(productName: string, page: StockPageEvidence, extraHosts: string[] = []): StockPageGate {
  if (!stockUrlAllowed(page.finalUrl, extraHosts)) {
    return { status: 'blocked', evidence: 'The check ended on a URL outside the approved retailers.' }
  }
  if (page.httpStatus === null) {
    return { status: 'blocked', evidence: 'The retailer did not return an HTTP response.' }
  }
  if (page.httpStatus < 200 || page.httpStatus >= 300) {
    return { status: 'blocked', evidence: `The retailer returned HTTP ${page.httpStatus}.` }
  }
  if (page.blocked) {
    return { status: 'blocked', evidence: 'The retailer returned an access check or bot-protection page.' }
  }
  const softError = [...page.headings, page.title].some((text) => SOFT_ERROR.test(text.trim()))
  if (softError) {
    return { status: 'unclear', evidence: 'The retailer returned an error or login page.' }
  }

  const wanted = identityTokens(productName)
  if (!wanted.some((token) => /[a-z]/.test(token))) {
    return { status: 'unclear', evidence: `No usable product identity in "${productName}".` }
  }
  const candidates = [...page.headings, ...page.productNames]
  const identified = candidates.some((candidate) => {
    const candidateTokens = new Set(tokens(candidate))
    return wanted.every((token) => candidateTokens.has(token))
  })
  if (!identified) {
    return { status: 'unclear', evidence: `The page did not present "${productName}" as its product.` }
  }
  if (page.sizes.length === 0) {
    return { status: 'unclear', evidence: 'The page offered no size options to check.' }
  }
  return { status: 'verified' }
}

export async function guardedStockVerdict<T extends { verdict: string; sizeFound: string; price: string; evidence: string }>(
  productName: string,
  page: StockPageEvidence,
  judge: () => Promise<T>,
  extraHosts: string[] = [],
): Promise<T | { verdict: 'blocked' | 'unclear'; sizeFound: string; price: string; evidence: string }> {
  const gate = inspectStockPage(productName, page, extraHosts)
  if (gate.status === 'verified') return judge()
  return { verdict: gate.status, sizeFound: '', price: '', evidence: gate.evidence }
}
