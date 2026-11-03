import 'server-only'
import { generateText, gateway, type LanguageModel } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { parseChain, type ModelProvider, type ModelSpec } from './model-spec'

/**
 * Model resolution with pluggable providers.
 *
 * Not every model the app names is reachable on every deployment's gateway plan (grok needs paid
 * credits; a team on the free tier gets a 403 RestrictedModelsError), and the gateway account may
 * simply run out of credit. So each role keeps an ordered candidate list and the first model that
 * answers a probe wins for the lifetime of this instance. The probe runs once per role per
 * instance; a total failure is retried after FAILURE_TTL_MS so a transient outage does not pin the
 * app to "down" forever.
 *
 * A candidate is a spec:
 *   gateway:<id>              a Vercel AI Gateway model (the default when no provider is named)
 *   openai-compatible:<id>    any OpenAI-compatible endpoint (xAI, OpenAI, Groq, Together,
 *                             OpenRouter, LM Studio, Ollama, vLLM, …) configured by
 *                             FORMA_LLM_BASE_URL + FORMA_LLM_API_KEY
 *
 * Configuration:
 *   FORMA_AGENT_MODELS        comma-separated specs for the agent role, first = preferred
 *   FORMA_FAST_MODELS         comma-separated specs for the fast role
 *   FORMA_LLM_BASE_URL        base URL of the OpenAI-compatible provider (e.g. https://api.x.ai/v1)
 *   FORMA_LLM_API_KEY         key for that provider
 *   FORMA_LLM_MODEL           model id to prefer on that provider
 *   FORMA_DISABLE_GATEWAY     set to 1 to skip gateway candidates entirely
 *
 * When FORMA_LLM_BASE_URL, FORMA_LLM_API_KEY and FORMA_LLM_MODEL are all set, that provider is
 * tried first and the gateway stays as the fallback — so a newly sourced provider can take over
 * with three env vars and no code change.
 */

type ModelRole = 'agent' | 'fast'

const DEFAULT_CHAINS: Record<ModelRole, ModelSpec[]> = {
  // Reasoning + tool use across a multi-step fitting run. Multimodal-capable candidates first so
  // the same chain can serve image-bearing calls.
  agent: [
    { provider: 'gateway', id: 'spacexai/grok-4.7' },
    { provider: 'gateway', id: 'google/gemini-2.5-flash' },
    { provider: 'gateway', id: 'openai/gpt-5-mini' },
    { provider: 'gateway', id: 'deepseek/deepseek-v3.1' },
  ],
  // Cheap, quick extraction/judging where a reasoning model adds latency, not accuracy.
  fast: [
    { provider: 'gateway', id: 'spacexai/grok-4.20-non-reasoning' },
    { provider: 'gateway', id: 'google/gemini-2.5-flash-lite' },
    { provider: 'gateway', id: 'amazon/nova-2-lite' },
    { provider: 'gateway', id: 'openai/gpt-5-nano' },
  ],
}

const FAILURE_TTL_MS = 60_000
const PROBE_TIMEOUT_MS = 10_000

const env = (name: string) => process.env[name]?.trim() || undefined

/** The configured OpenAI-compatible provider, when one is set up. */
function directSpec(): ModelSpec | null {
  const baseUrl = env('FORMA_LLM_BASE_URL')
  const apiKey = env('FORMA_LLM_API_KEY')
  const model = env('FORMA_LLM_MODEL')
  if (!baseUrl || !apiKey || !model) return null
  return { provider: 'openai-compatible', id: model }
}

function gatewayEnabled() {
  if (env('FORMA_DISABLE_GATEWAY') === '1') return false
  return Boolean(env('AI_GATEWAY_API_KEY'))
}

function chainFor(role: ModelRole): ModelSpec[] {
  const raw = env(role === 'agent' ? 'FORMA_AGENT_MODELS' : 'FORMA_FAST_MODELS')
  const configured = raw ? parseChain(raw) : DEFAULT_CHAINS[role]
  const direct = directSpec()
  const specs = direct ? [direct, ...configured] : configured
  return specs.filter((spec) => (spec.provider === 'gateway' ? gatewayEnabled() : true))
}

let compatibleProvider: ReturnType<typeof createOpenAICompatible> | null = null

function modelFor(spec: ModelSpec): LanguageModel {
  if (spec.provider === 'gateway') return gateway(spec.id)
  const baseURL = env('FORMA_LLM_BASE_URL') ?? ''
  const apiKey = env('FORMA_LLM_API_KEY') ?? ''
  compatibleProvider ??= createOpenAICompatible({ name: env('FORMA_LLM_NAME') ?? 'llm', baseURL, apiKey })
  return compatibleProvider(spec.id)
}

/** A model plus how to describe it in logs. */
export interface ResolvedModel {
  model: LanguageModel
  /** e.g. "grok-4.7" or "spacexai/grok-4.7" */
  label: string
  provider: ModelProvider
}

const resolved = new Map<ModelRole, { model: ResolvedModel | null; at: number }>()
const probing = new Map<ModelRole, Promise<ResolvedModel | null>>()

async function probe(role: ModelRole): Promise<ResolvedModel | null> {
  for (const spec of chainFor(role)) {
    try {
      const model = modelFor(spec)
      await generateText({
        model,
        prompt: 'Reply with the single word: ok',
        maxOutputTokens: 64,
        abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
      return { model, label: spec.id, provider: spec.provider }
    } catch {
      // Unreachable, restricted, out of credit or timed out — try the next candidate.
    }
  }
  return null
}

/** Returns the first reachable model for the role, or null when nothing answered. */
export function resolveModel(role: ModelRole): Promise<ResolvedModel | null> {
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
export function modelLabel(model: ResolvedModel | null): string {
  return model ? model.label : 'none'
}

/** Map provider/gateway failures to copy worth showing a shopper. */
export function friendlyModelError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/free tier|no_providers_available|RestrictedModels|insufficient_funds|credit balance/i.test(message)) {
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
