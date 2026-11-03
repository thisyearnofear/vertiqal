export type ModelProvider = 'gateway' | 'openai-compatible'

export interface ModelSpec {
  provider: ModelProvider
  id: string
}

/** Parses "provider:id" specs; a bare id means the Vercel AI Gateway. */
export function parseSpec(raw: string): ModelSpec | null {
  const value = raw.trim()
  if (!value) return null
  const separator = value.indexOf(':')
  if (separator === -1) return { provider: 'gateway', id: value }
  const provider = value.slice(0, separator).trim().toLowerCase()
  const id = value.slice(separator + 1).trim()
  if (!id) return null
  if (provider === 'gateway') return { provider: 'gateway', id }
  if (provider === 'openai-compatible' || provider === 'compatible') return { provider: 'openai-compatible', id }
  return null
}

export function parseChain(raw: string): ModelSpec[] {
  return raw
    .split(',')
    .map(parseSpec)
    .filter((spec): spec is ModelSpec => spec !== null)
}
