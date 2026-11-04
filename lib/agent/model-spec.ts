export type ModelProvider = string

export interface ModelSpec {
  provider: ModelProvider
  id: string
}

/**
 * Parses "provider:id" specs; a bare id means the Vercel AI Gateway.
 *
 * Any provider token is accepted here — resolution against the providers that are actually
 * configured (gateway, the FORMA_LLM_* primary, the FORMA_LLM2_* secondary, matched by their
 * configured names) happens later, so an unknown name is simply skipped at probe time rather
 * than rejected at parse time.
 */
export function parseSpec(raw: string): ModelSpec | null {
  const value = raw.trim()
  if (!value) return null
  const separator = value.indexOf(':')
  if (separator === -1) return { provider: 'gateway', id: value }
  const provider = value.slice(0, separator).trim().toLowerCase()
  const id = value.slice(separator + 1).trim()
  if (!provider || !id) return null
  // Canonical alias so specs compare equal regardless of which shorthand was used.
  return { provider: provider === 'compatible' ? 'openai-compatible' : provider, id }
}

export function parseChain(raw: string): ModelSpec[] {
  return raw
    .split(',')
    .map(parseSpec)
    .filter((spec): spec is ModelSpec => spec !== null)
}
