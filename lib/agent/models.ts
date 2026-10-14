import 'server-only'
import { generateText } from 'ai'

/**
 * AI Gateway model fallback.
 *
 * Not every model the app names is reachable on every deployment's gateway
 * plan (e.g. Grok models need paid credits; a team on the free tier gets a
 * 403 RestrictedModelsError). Rather than trusting a hard-coded string, each
 * role keeps an ordered candidate list and the first model that answers a
 * probe wins for the lifetime of this instance — matching the per-instance
 * caching used elsewhere. The probe only runs once per role per instance;
 * a total failure is retried after FAILURE_TTL_MS so a transient outage
 * does not pin the app to "down" forever.
 *
 * Override either chain with a comma-separated env var, first = preferred:
 *   FORMA_AGENT_MODELS, FORMA_FAST_MODELS
 */

type ModelRole = 'agent' | 'fast'

const DEFAULT_CHAINS: Record<ModelRole, string[]> = {
  // Reasoning + tool use across a multi-step fitting run. Multimodal-capable
  // candidates first so the same chain can serve image-bearing calls.
  agent: ['spacexai/grok-4.7', 'google/gemini-2.5-flash', 'openai/gpt-5-mini', 'deepseek/deepseek-v3.1'],
  // Cheap, quick extraction/judging where a reasoning model adds latency, not accuracy.
  fast: ['spacexai/grok-4.20-non-reasoning', 'google/gemini-2.5-flash-lite', 'amazon/nova-2-lite', 'openai/gpt-5-nano'],
}

const FAILURE_TTL_MS = 60_000
const PROBE_TIMEOUT_MS = 10_000

function chainFor(role: ModelRole): string[] {
  const env = process.env[role === 'agent' ? 'FORMA_AGENT_MODELS' : 'FORMA_FAST_MODELS']
  const list = env?.split(',').map((m) => m.trim()).filter(Boolean)
  return list?.length ? list : DEFAULT_CHAINS[role]
}

const resolved = new Map<ModelRole, { model: string | null; at: number }>()
const probing = new Map<ModelRole, Promise<string | null>>()

async function probe(role: ModelRole): Promise<string | null> {
  for (const model of chainFor(role)) {
    try {
      await generateText({
        model,
        prompt: 'Reply with the single word: ok',
        maxOutputTokens: 32,
        abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
      return model
    } catch {
      // Restricted, unavailable or timed out — try the next candidate.
    }
  }
  return null
}

/** Returns the first reachable model for the role, or null if none answered. */
export function resolveModel(role: ModelRole): Promise<string | null> {
  const hit = resolved.get(role)
  if (hit && (hit.model !== null || Date.now() - hit.at < FAILURE_TTL_MS)) {
    return Promise.resolve(hit.model)
  }
  let pending = probing.get(role)
  if (!pending) {
    pending = probe(role)
    probing.set(role, pending)
    void pending.finally(() => probing.delete(role))
  }
  return pending.then((model) => {
    resolved.set(role, { model, at: Date.now() })
    return model
  })
}

/** Short label for logs/UI when a fallback is serving. */
export function modelLabel(model: string): string {
  return model
}

/** Map provider/gateway failures to copy worth showing a shopper. */
export function friendlyModelError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/free tier|no_providers_available|RestrictedModels/i.test(message)) {
    return 'Forma’s fitting model is unavailable on this account right now — please try again shortly.'
  }
  if (/insufficient|quota|rate.?limit|429/i.test(message)) {
    return 'Forma is being rate-limited — please try again in a moment.'
  }
  if (/timed? ?out|abort/i.test(message)) {
    return 'The fitting model took too long to answer — please try again.'
  }
  return 'Forma hit an unexpected error — please try again.'
}
