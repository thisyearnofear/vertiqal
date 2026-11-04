import { z } from 'zod'
import type { ModelMessage } from 'ai'

/**
 * Small open-weight models routinely hallucinate tool calls: they invoke a tool that was shown in
 * an EARLIER step but is not in the current step's schema (phase gating via activeTools), or they
 * slightly mangle the name or argument shape. Without help the AI SDK answers each such call with
 * an "AI_NoSuchToolError" text result, and a weak model often retries the same unavailable call
 * until the step budget runs out — observed in production as a 14-step run with 12 phantom
 * searchProducts calls and zero picks.
 *
 * The repair strategy is lenient by design: activeTools stays as soft guidance for what the model
 * SEES, but any call that names a real tool (exact or normalised match) with fixable arguments is
 * executed anyway. A search that happens one step late still returns real product pages, which is
 * exactly what the shortlist grounding needs. Only calls that cannot map to a real tool, or whose
 * arguments cannot be coerced into the schema, fall through to the SDK's error text.
 */

/** Structural shape of the SDK's LanguageModelV4ToolCall (input is stringified JSON). */
export interface RawToolCall {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  input: string
  [key: string]: unknown
}

/** Every tool the gear agent registers, in one place. */
export const GEAR_TOOL_NAMES = [
  'checkEvidence',
  'buildGearProfile',
  'searchProducts',
  'checkCommunity',
  'checkAthletes',
  'recommendProducts',
] as const

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Maps an attempted tool name onto a real one: exact first, then case/punctuation-insensitive. */
export function matchToolName(attempted: string, names: readonly string[]): string | null {
  if (!attempted) return null
  const exact = names.find((n) => n === attempted)
  if (exact) return exact
  const target = norm(attempted)
  if (!target) return null
  return names.find((n) => norm(n) === target) ?? null
}

function textOf(messages?: ModelMessage[]): string {
  if (!messages) return ''
  const first = messages.find((m) => m.role === 'user')
  if (!first) return ''
  if (typeof first.content === 'string') return first.content
  return first.content.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n')
}

function sportFromMessages(messages?: ModelMessage[]): 'running' | 'climbing' | null {
  const text = textOf(messages)
  if (/^Sport: climbing$/m.test(text)) return 'climbing'
  if (/^Sport: running$/m.test(text)) return 'running'
  return null
}

const asStringArray = (v: unknown): unknown => (typeof v === 'string' ? [v] : v)

/**
 * Coerces common argument mistakes per tool. Returns repaired args (or the original value when
 * nothing applies); the caller still validates against the tool's schema.
 */
export function repairToolArgs(toolName: string, raw: unknown, messages?: ModelMessage[]): unknown {
  if (typeof raw !== 'object' || raw === null) return raw
  const a = { ...(raw as Record<string, unknown>) }
  switch (toolName) {
    case 'searchProducts': {
      if (typeof a.query !== 'string') {
        const alt = a.q ?? a.search ?? a.searchQuery ?? (Array.isArray(a.queries) ? a.queries[0] : undefined)
        if (typeof alt === 'string') a.query = alt
      }
      return { query: a.query }
    }
    case 'checkCommunity': {
      a.models = asStringArray(a.models)
      if (typeof a.focus !== 'string') a.focus = ''
      return a
    }
    case 'checkAthletes': {
      a.models = asStringArray(a.models)
      if (a.sport !== 'running' && a.sport !== 'climbing') a.sport = sportFromMessages(messages) ?? 'running'
      return a
    }
    case 'checkEvidence': {
      a.metrics = asStringArray(a.metrics)
      if (a.sport !== 'running' && a.sport !== 'climbing') a.sport = sportFromMessages(messages) ?? 'running'
      return a
    }
    case 'buildGearProfile': {
      if (Array.isArray(a.requirements)) {
        a.requirements = a.requirements.map((r) => {
          if (typeof r !== 'object' || r === null) return r
          const req = { ...(r as Record<string, unknown>) }
          for (const k of ['attribute', 'target', 'evidence', 'researchRef']) {
            if (typeof req[k] !== 'string') req[k] = ''
          }
          return req
        })
      }
      return a
    }
    case 'recommendProducts': {
      if (Array.isArray(a.picks)) {
        a.picks = a.picks.map((p) => {
          if (typeof p !== 'object' || p === null) return p
          const pick = { ...(p as Record<string, unknown>) }
          for (const k of ['name', 'url', 'reason']) {
            if (typeof pick[k] !== 'string') pick[k] = ''
          }
          return pick
        })
      }
      return a
    }
    default:
      return a
  }
}

/**
 * The SDK answers a call to a tool hidden by activeTools with an "AI_NoSuchToolError" text result,
 * and weak models often retry the same hidden tool until the step budget dies (observed: a 14-step
 * run of 12 phantom searchProducts calls and zero picks). Detect such phantom calls so prepareStep
 * can yield — adding the tool back to the next step's active set makes the retry execute for real,
 * which is what the model was asking for anyway. Only names in `known` qualify: yielding to an
 * invented tool would just produce another NoSuchToolError. Counting ALL phantoms (not just the
 * last) lets prepareStep cap how many times it yields before forcing the phase gate.
 */
function isErrorText(p: unknown): { toolName?: unknown } | null {
  if (typeof p !== 'object' || p === null) return null
  const part = p as { type?: unknown; output?: { type?: unknown; value?: unknown }; toolName?: unknown }
  if (part.type !== 'tool-result') return null
  const out = part.output as { type?: string; value?: unknown } | undefined
  if (out?.type !== 'error-text') return null
  if (!/NoSuchToolError|tried to call unavailable/i.test(String(out.value ?? ''))) return null
  return part
}

/** Every tool call the SDK answered with AI_NoSuchToolError text, oldest first. */
export function phantomToolCalls(messages: ModelMessage[] | undefined): string[] {
  if (!messages) return []
  const names: string[] = []
  for (const m of messages) {
    if (m.role !== 'tool' || !Array.isArray(m.content)) continue
    for (const p of m.content) {
      const err = isErrorText(p)
      const name = err?.toolName
      if (err && typeof name === 'string') names.push(name)
    }
  }
  return names
}


export function phantomToolCall<T extends string>(messages: ModelMessage[] | undefined, known: readonly T[]): T | null {
  const names = phantomToolCalls(messages)
  for (let i = names.length - 1; i >= 0; i--) {
    if ((known as readonly string[]).includes(names[i])) return names[i] as T
  }
  return null
}

/**
 * Repair callback for ToolLoopAgent. Returns a callable tool invocation when the attempted one maps
 * to a real tool with schema-valid (or schema-fixable) arguments, otherwise null so the SDK's
 * standard error text reaches the model.
 */
export async function repairGearToolCall(
  toolCall: RawToolCall,
  tools: Record<string, { inputSchema?: unknown }>,
  messages?: ModelMessage[],
): Promise<RawToolCall | null> {
  const target = matchToolName(toolCall.toolName, Object.keys(tools))
  if (!target) return null
  let args: unknown
  try {
    args = typeof toolCall.input === 'string' ? JSON.parse(toolCall.input) : toolCall.input
  } catch {
    args = {}
  }
  const repaired = repairToolArgs(target, args, messages)
  const schema = tools[target]?.inputSchema as z.ZodType | undefined
  if (schema && typeof schema.safeParse === 'function') {
    const parsed = schema.safeParse(repaired)
    if (!parsed.success) return null
    return { ...toolCall, toolName: target, input: JSON.stringify(parsed.data) }
  }
  return { ...toolCall, toolName: target, input: JSON.stringify(repaired) }
}
