import 'server-only'
import { generateText, gateway, type LanguageModel } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { parseChain, type ModelSpec } from './model-spec'

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
 *   openai-compatible:<id>    the primary OpenAI-compatible provider (FORMA_LLM_*)
 *   compatible:<id>           alias of the above
 *   <name>:<id>               any provider matched by its configured name — the primary
 *                             (FORMA_LLM_NAME, default "llm") or the secondary
 *                             (FORMA_LLM2_NAME, default "llm2"). e.g. "hetzner:Qwen3.8-27B"
 *                             when FORMA_LLM2_NAME=hetzner.
 *
 * Configuration:
 *   FORMA_AGENT_MODELS        comma-separated specs for the agent role; when set, this chain is
 *                             authoritative (nothing is auto-prepended)
 *   FORMA_FAST_MODELS         same for the fast role
 *   FORMA_LLM_BASE_URL        base URL of the primary OpenAI-compatible provider
 *   FORMA_LLM_API_KEY         key for that provider
 *   FORMA_LLM_MODEL           model id to prefer on that provider (auto-leads the default chains)
 *   FORMA_LLM_NAME            provider name used in specs (default "llm")
 *   FORMA_LLM_VISION_MODEL    optional model id for image-bearing calls on the primary provider
 *                             (e.g. Qwen/Qwen3-VL-32B-Instruct); falls back to the agent chain
 *   FORMA_LLM2_BASE_URL       base URL of an optional SECONDARY OpenAI-compatible provider
 *   FORMA_LLM2_API_KEY        key for the secondary provider
 *   FORMA_LLM2_NAME           provider name used in specs (default "llm2"); the secondary is only
 *                             used when named in a *_MODELS chain — it is never auto-prepended
 *   FORMA_DISABLE_GATEWAY     set to 1 to skip gateway candidates entirely
 *
 * When FORMA_LLM_BASE_URL, FORMA_LLM_API_KEY and FORMA_LLM_MODEL are all set, that provider leads
 * the default chains and the gateway stays as the fallback — so a newly sourced provider can take
 * over with three env vars and no code change. A second provider (e.g. a self-hosted box) can be
 * layered in front with FORMA_LLM2_* plus an explicit FORMA_AGENT_MODELS chain.
 */

type ModelRole = 'agent' | 'fast' | 'vision'

const DEFAULT_CHAINS: Record<'agent' | 'fast', ModelSpec[]> = {
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

interface ProviderConfig {
  /** Name used to address this provider in model specs. */
  name: string
  baseUrl: string
  apiKey: string
}

/** The primary OpenAI-compatible provider (FORMA_LLM_*), when fully configured. */
function primaryConfig(): ProviderConfig | null {
  const baseUrl = env('FORMA_LLM_BASE_URL')
  const apiKey = env('FORMA_LLM_API_KEY')
  if (!baseUrl || !apiKey) return null
  return { name: env('FORMA_LLM_NAME') ?? 'llm', baseUrl, apiKey }
}

/** The optional secondary provider (FORMA_LLM2_*), when fully configured. */
function secondaryConfig(): ProviderConfig | null {
  const baseUrl = env('FORMA_LLM2_BASE_URL')
  const apiKey = env('FORMA_LLM2_API_KEY')
  if (!baseUrl || !apiKey) return null
  return { name: env('FORMA_LLM2_NAME') ?? 'llm2', baseUrl, apiKey }
}

/** Spec for the primary provider's default model, when one is named. */
function directSpec(): ModelSpec | null {
  const model = env('FORMA_LLM_MODEL')
  if (!primaryConfig() || !model) return null
  return { provider: 'openai-compatible', id: model }
}

function gatewayEnabled() {
  if (env('FORMA_DISABLE_GATEWAY') === '1') return false
  return Boolean(env('AI_GATEWAY_API_KEY'))
}

function dedupe(specs: ModelSpec[]): ModelSpec[] {
  const seen = new Set<string>()
  return specs.filter((spec) => {
    const key = `${spec.provider}:${spec.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function chainFor(role: ModelRole): ModelSpec[] {
  if (role === 'vision') {
    // Image-bearing calls need a multimodal model. When one is named on the primary provider it
    // leads; otherwise the agent chain runs (gateway defaults are multimodal-first).
    const visionModel = env('FORMA_LLM_VISION_MODEL')
    const visionSpec: ModelSpec | null = primaryConfig() && visionModel ? { provider: 'openai-compatible', id: visionModel } : null
    const fallback = chainFor('agent')
    return dedupe(visionSpec ? [visionSpec, ...fallback] : fallback)
  }
  const raw = env(role === 'agent' ? 'FORMA_AGENT_MODELS' : 'FORMA_FAST_MODELS')
  if (raw) {
    // An explicit chain is authoritative: it can name the primary, the secondary or the gateway in
    // whatever order makes sense, and nothing is silently prepended.
    return dedupe(parseChain(raw).filter((spec) => (spec.provider === 'gateway' ? gatewayEnabled() : true)))
  }
  const direct = directSpec()
  const specs = direct ? [direct, ...DEFAULT_CHAINS[role]] : DEFAULT_CHAINS[role]
  return dedupe(specs.filter((spec) => (spec.provider === 'gateway' ? gatewayEnabled() : true)))
}

const providers = new Map<string, ReturnType<typeof createOpenAICompatible>>()

/**
 * Qwen3-family models think out loud by default: every step of the tool loop emits a long
 * `reasoning` trace before the answer, which burns output tokens and wall-clock time. Featherless
 * accepts the vLLM `chat_template_kwargs` extension to switch it off. HOWEVER, with thinking off
 * Qwen3 degrades to writing tool calls as plain text instead of emitting real tool_calls (observed
 * 2026-11-04 in the live agent loop), so thinking is left ON by default. Set FORMA_QWEN_NO_THINK=1
 * to try it for non-tool surfaces. Only injected for qwen3 model ids so other providers' chat
 * endpoints never see an unknown field.
 */
function disableQwenThinking(args: Record<string, unknown>): Record<string, unknown> {
  if (env('FORMA_QWEN_NO_THINK') !== '1') return args
  if (typeof args.model !== 'string' || !/qwen3/i.test(args.model)) return args
  const extra = (args.chat_template_kwargs ?? {}) as Record<string, unknown>
  return { ...args, chat_template_kwargs: { enable_thinking: false, ...extra } }
}

function providerInstance(config: ProviderConfig): ReturnType<typeof createOpenAICompatible> {
  let instance = providers.get(config.name)
  if (!instance) {
    instance = createOpenAICompatible({
      name: config.name,
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      transformRequestBody: disableQwenThinking,
    })
    providers.set(config.name, instance)
  }
  return instance
}

/** True when this spec names a provider that is configured (or the gateway). */
function resolvable(spec: ModelSpec): boolean {
  if (spec.provider === 'gateway') return true
  if (spec.provider === 'openai-compatible') return primaryConfig() !== null
  const secondary = secondaryConfig()
  if (secondary && spec.provider === secondary.name) return true
  const primary = primaryConfig()
  return Boolean(primary && spec.provider === primary.name)
}

function modelFor(spec: ModelSpec): LanguageModel {
  if (spec.provider === 'gateway') return gateway(spec.id)
  if (spec.provider === 'openai-compatible') {
    const config = primaryConfig()
    if (!config) throw new Error('primary OpenAI-compatible provider is not configured')
    return providerInstance(config)(spec.id)
  }
  const secondary = secondaryConfig()
  if (secondary && spec.provider === secondary.name) return providerInstance(secondary)(spec.id)
  const primary = primaryConfig()
  if (primary && spec.provider === primary.name) return providerInstance(primary)(spec.id)
  throw new Error(`unknown provider "${spec.provider}" in model spec`)
}

/** A model plus how to describe it in logs. */
export interface ResolvedModel {
  model: LanguageModel
  /** e.g. "grok-4.7" or "spacexai/grok-4.7" */
  label: string
  /** Provider token as configured, e.g. "gateway", "featherless", "hetzner". */
  provider: string
}

const resolved = new Map<ModelRole, { model: ResolvedModel | null; at: number }>()
const probing = new Map<ModelRole, Promise<ResolvedModel | null>>()

async function probe(role: ModelRole): Promise<ResolvedModel | null> {
  for (const spec of chainFor(role)) {
    if (!resolvable(spec)) continue
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
