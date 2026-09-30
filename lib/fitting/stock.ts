export interface StockTarget {
  productName: string
  productUrl: string
  size: string
}

export function stockTargetFor(
  pick: { name: string; url: string },
  submittedSize: string | null,
): StockTarget | null {
  const size = submittedSize?.trim()
  if (!size) return null
  return { productName: pick.name, productUrl: pick.url, size }
}

export function draftDiffers(submitted: string | null, draft: string): boolean {
  return Boolean(submitted) && draft.trim() !== submitted
}

export function lastCheckLabel(submitted: string): string {
  return `Last check: ${submitted}`
}

export function choiceSnapshot(state: {
  draft: string
  submitted: string | null
  verdict: string | null
}): { size: string; stock: string } | null {
  const size = state.draft.trim()
  if (!size) return null
  const verified = state.submitted === size && state.verdict ? state.verdict : null
  return { size, stock: verified ?? `Not checked for ${size}` }
}
