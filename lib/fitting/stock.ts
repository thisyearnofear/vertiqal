export interface StockTarget {
  productName: string
  productUrl: string
  size: string
  stockToken: string
}

export function stockTargetFor(
  pick: { name: string; url: string; stockToken?: string },
  submittedSize: string | null,
): StockTarget | null {
  const size = submittedSize?.trim()
  if (!size) return null
  return { productName: pick.name, productUrl: pick.url, size, stockToken: pick.stockToken?.trim() ?? '' }
}

export function draftDiffers(submitted: string | null, draft: string): boolean {
  return Boolean(submitted) && draft.trim() !== submitted
}

export function lastCheckLabel(submitted: string): string {
  return `Last check: ${submitted}`
}
