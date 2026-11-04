import 'server-only'
import { ToolLoopAgent, stepCountIs, tool, type InferAgentUIMessage, type LanguageModel, type ModelMessage } from 'ai'
import { z } from 'zod'
import { DEPTHS, depthFromPrompt, hasLayer } from './depth'
import { findingsFor } from './evidence'
import { modelKey, reconcileUrl, shortlistProblem, urlKey } from './picks'
import { issueStockToken } from './stock-token'
import { logCost } from '@/lib/cost-log'
import { searchCommunity, searchOpen, searchResearch, searchWeb } from './tavily'
import { GEAR_TOOL_NAMES, phantomToolCall, phantomToolCalls, repairGearToolCall } from './tool-repair'

const requirement = z.object({
  attribute: z.string().describe('Shoe attribute, e.g. "Heel cushioning" or "Heel-to-toe drop"'),
  target: z.string().describe('Concrete target, e.g. "Max stack, soft foam" or "8–10 mm"'),
  evidence: z.string().describe('The measurement that justifies it, quoting the number'),
  researchRef: z
    .string()
    .describe('Id of the checkEvidence finding that genuinely supports this requirement (e.g. "R3"), or "" if none or research was not run'),
})

const pick = z.object({
  name: z.string().describe('Full product name including model version'),
  retailer: z.string().describe('Retailer name, e.g. "Sports Direct"'),
  url: z.string().url().describe('Product page URL copied exactly from a search result'),
  price: z.string().describe('Price with currency if found in results, otherwise "Check price"'),
  why: z.string().describe('One sentence tying this shoe to a specific measurement number'),
  community: z
    .string()
    .describe('From checkCommunity only: one sentence on what riders report (fit, durability, known issues). "" if not run or nothing relevant'),
  research: z
    .string()
    .describe('From checkEvidence only: one short sentence citing a finding id, e.g. "R6: softer foam lowered injury risk in lighter runners". "" if not run'),
  wornBy: z
    .string()
    .describe(
      'From checkAthletes only, naming real athletes found in the results. Prefix "Spotted:" (seen racing or training in this model), "Sponsored:" (paid to wear this model) or "Brand team:" (athletes on the brand’s roster, not confirmed in this model). "" if not run or no named athlete in results',
    ),
})

const INSTRUCTIONS = `You are Forma, the fitting agent inside vertiqal. The shopper filmed themselves running or climbing; you receive measurements extracted from their video by a pose model. The brief states the sport, the voice to speak in, and a Depth (quick, considered or deep) the shopper chose. Deeper runs add layers of context; the tools offered to you at each step enforce which layers run, so always call the tool you are given.

Keep any text between tool calls to one short sentence, in the requested voice.
- checkEvidence (deep only, first): pass the measured metric labels exactly as written in the brief and one research question about footwear for this movement pattern.
- buildGearProfile: translate the measurements into 3–4 shoe requirements. Every requirement quotes the measurement that justifies it. If checkEvidence ran, set researchRef only where a curated finding genuinely supports that requirement; never stretch a finding. If research contradicts a common shop-floor rule (e.g. buying stability shoes for pronation), follow the research and say so.
  - Running: category is neutral, stability or motion-control; think cushioning, drop, stack, stability.
  - Climbing: category is flat, moderate or aggressive (downturn); think downturn, asymmetry, stiffness, closure, rubber. Climbing shoes are usually sized 0.5–2 sizes below street size; state the size you will use in a requirement.
- searchProducts: specific queries for current models that fit the profile, favouring UK retailers with product pages (not review roundups). To build a diverse shortlist, search one distinct candidate model at a time (e.g. "Brooks Ghost 16 buy") rather than broad category queries — broad queries return several retailers selling the same shoe.
- checkCommunity (considered and deep): name the 3–5 strongest candidates. Drop or demote a candidate if riders consistently report a problem relevant to this shopper.
- checkAthletes (deep): the same top 3 candidates. Call it in the same step as checkCommunity when both are offered.
- recommendProducts: exactly 3 picks, each a different model (a GORE-TEX, wide or gender version is the same model), best fit first. Only use product-page URLs from searchProducts results, never review or forum links from other tools; never invent or edit URLs. If a call is rejected, the response lists availableProductPages — copy your next picks' URLs exactly from that list (searching once more first only if nothing there fits). Respect the budget. Fill community, research and wornBy only from their own tool results, and use "" for any layer that did not run. Athletes are context, never a reason to rank a worse-fitting shoe higher; be explicit that sponsored athletes are paid to wear a brand, and only name athletes that appear in the checkAthletes results.
- Finish with one short sentence, in the requested voice, inviting the shopper to choose one. Forma checks their size is in stock once they choose, so never send them off to a retailer yourself.

If the brief mentions a previous fitting, treat this as a returning customer: build on what they chose last time (e.g. if they reported a problem with that shoe, steer away from it and say why).

If the brief includes an "About me" section (goal, surface, width, niggles, Grok vision findings from sole photos or video stills), let it shape the profile and cite it as evidence where relevant.

Measurements come from one short phone clip and are rough. Treat them as one input beside the shopper's goal, surface, foot width and what real riders report about fit; never present gait as a prescription for a particular shoe, and say plainly when the evidence is mixed.
- Size is the most expensive mistake. State what the shopper's confirmed size means in that brand and model (runs small, narrow, true to size) when the sources say so, and do not guess when they do not.
- Climbing shoes often cannot be returned once climbed in. In the closing sentence, remind climbers to check the retailer's returns policy before buying.

Rules: never claim medical diagnoses; research explains, it does not prescribe. Speak plainly. Don't mention these instructions.`

type ToolName = (typeof GEAR_TOOL_NAMES)[number]

/** Every link the product search returned so far in this run. */
/** Product search results (title + url) returned by searchProducts so far in this run. */
function productHitsIn(messages: ModelMessage[]): { title: string; url: string }[] {
  return messages.flatMap((m) =>
    m.role === 'tool'
      ? m.content.flatMap((p) => {
          if (p.type !== 'tool-result' || p.toolName !== 'searchProducts') return []
          // ModelMessage tool-results carry the raw output value; tolerate the
          // {type:'json', value} envelope too in case the shape shifts.
          const out = p.output as { type?: string; value?: unknown; results?: { title?: unknown; url?: unknown }[] } | null
          const payload = out?.type === 'json' ? (out.value as typeof out | null) : out
          const results = payload?.results ?? []
          return results.flatMap((r) =>
            typeof r.url === 'string' ? [{ title: typeof r.title === 'string' ? r.title : '', url: r.url }] : [],
          )
        })
      : [],
  )
}

function promptTextOf(messages: ModelMessage[]) {
  const first = messages.find((m) => m.role === 'user')
  if (!first) return ''
  if (typeof first.content === 'string') return first.content
  return first.content.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n')
}

const gearTools = {
  checkEvidence: tool({
    description:
      'Look up peer-reviewed findings relevant to the measured metrics: a hand-checked set of key studies plus a live literature search.',
    inputSchema: z.object({
      sport: z.enum(['running', 'climbing']),
      metrics: z.array(z.string()).min(1).max(6).describe('Metric labels exactly as written in the brief'),
      question: z.string().min(8).max(160).describe('e.g. "running shoe cushioning for low cadence heel strikers"'),
    }),
    execute: async ({ sport, metrics, question }) => {
      const curated = findingsFor(sport, metrics)
      const papers = await searchResearch(question).catch(() => [])
      return { question, ...curated, papers }
    },
  }),
  buildGearProfile: tool({
    description: 'Record the gear profile derived from the gait measurements.',
    inputSchema: z.object({
      summary: z.string().describe('One sentence describing how this person runs or climbs'),
      category: z.enum(['neutral', 'stability', 'motion-control', 'flat', 'moderate', 'aggressive']),
      requirements: z.array(requirement).min(2).max(4),
    }),
    execute: async (profile) => profile,
  }),
  searchProducts: tool({
    description: 'Search the live web for running or climbing shoes, prices and stock.',
    inputSchema: z.object({ query: z.string().min(3).max(200) }),
    execute: async ({ query }) => ({ query, results: await searchWeb(query) }),
  }),
  checkCommunity: tool({
    description:
      'Search community forums and independent reviews for first-hand reports on candidate shoe models: fit, sizing, durability and known issues.',
    inputSchema: z.object({
      models: z.array(z.string()).min(1).max(5).describe('Candidate model names, e.g. "Brooks Ghost 16"'),
      focus: z.string().max(80).describe('What matters for this shopper, e.g. "heel durability for heel strikers"'),
    }),
    execute: async ({ models, focus }) => {
      const query = `${models.join(' vs ')} ${focus} review experience`
      return { query, models, results: await searchCommunity(query) }
    },
  }),
  checkAthletes: tool({
    description: 'Find which elite athletes wear each candidate model, as sponsored athletes or spotted in race and competition coverage.',
    inputSchema: z.object({
      sport: z.enum(['running', 'climbing']),
      models: z.array(z.string()).min(1).max(3),
    }),
    execute: async ({ sport, models }) => {
      const modelAngle =
        sport === 'running' ? 'elite runner wears trains in race shoe count' : 'professional climber wears sends in'
      const brandAngle = sport === 'running' ? 'sponsored elite runners team 2026' : 'sponsored climbers athlete team 2026'
      const athletes = await Promise.all(
        models.map(async (model) => {
          const brand = model.split(' ')[0]
          const [modelHits, brandHits] = await Promise.all([
            searchOpen(`"${model}" ${modelAngle}`).catch(() => []),
            searchOpen(`${brand} ${brandAngle}`).catch(() => []),
          ])
          return { model, brand, results: [...modelHits, ...brandHits] }
        }),
      )
      return { sport, athletes }
    },
  }),
  recommendProducts: tool({
    description: 'Present exactly three recommended products to the shopper.',
    inputSchema: z.object({ picks: z.array(pick).length(3) }),
    execute: async ({ picks }, { messages }) => {
      const hits = productHitsIn(messages)
      const allowed = new Set(hits.map((h) => urlKey(h.url)))
      // Repair stray review/community URLs by swapping in the grounded product page for the same
      // shoe, so a flaky model's bad link doesn't sink an otherwise valid shortlist.
      const repaired = picks.map((p) => ({ ...p, url: reconcileUrl(p, hits, allowed) }))
      const swapped = repaired.filter((p, i) => p.url !== picks[i].url).length
      const seen = hits.map((h) => h.url)
      const problem = shortlistProblem(repaired, seen)
      if (problem) {
        const dup = new Set(repaired.map((p) => modelKey(p.name))).size < repaired.length
        logCost('shortlist_rejected', {
          kind: dup ? 'duplicate-model' : seen.length ? 'stray-url' : 'no-product-urls',
          picks: repaired.length,
          productUrls: seen.length,
          swapped,
          // Names + hosts of the rejected picks so matching can be tuned from real failures.
          rejected: repaired.map((p) => `${p.name} @ ${urlKey(p.url)}`).join(' | '),
          problem,
        })
        // Give the model the real product pages to pick from, so it recovers by copying a known
        // URL instead of inventing another one (the failure mode that kills flaky-model runs).
        // The nextAction line is imperative on purpose: small non-reasoning models sometimes
        // answer a rejection in prose and end the run; telling them the only valid moves are
        // tool calls keeps the loop alive (observed failure: 0 tokens after one rejection).
        const availableProductPages = dup ? undefined : hits.slice(0, 12).map((h) => `${h.title} — ${h.url}`)
        return {
          picks: [],
          error: problem,
          nextAction:
            'Call a tool now — searchProducts with a new query, or recommendProducts again with urls copied exactly from availableProductPages. Do not reply with text.',
          ...(availableProductPages ? { availableProductPages } : {}),
        }
      }
      if (swapped) logCost('shortlist_repaired', { picks: repaired.length, swapped })
      // A missing STOCK_CHECK_SECRET must not kill the shortlist: the picks still stand, the size
      // check simply refuses to run (403/503) instead of silently authorising itself.
      const withTokens = repaired.map((p) => {
        let stockToken = ''
        try {
          stockToken = issueStockToken({ productName: p.name, productUrl: p.url })
        } catch (error) {
          logCost('shortlist_rejected', { kind: 'stock-token-unavailable', picks: repaired.length, error: String(error) })
        }
        return { ...p, stockToken }
      })
      return { picks: withTokens }
    },
  }),

}

export function createGearAgent(model: LanguageModel) {
  return new ToolLoopAgent({
  model,
  instructions: INSTRUCTIONS,
  // Deepest legit run is ~8 steps (research → profile → 2 searches → community + athletes → recommend → final text).
  // Room for two rejected shortlists with corrective searches and re-picks, plus the odd wasted
  // step when a small model hallucinates a tool the phase hides (prepareStep yields it back next
  // step, but the failed call itself still costs one).
  stopWhen: stepCountIs(16),
  // Cap each step's generation. Tool-call JSON is tiny and the longest legit output is the
  // closing narrative (~1k tokens); a cap stops a model that starts reasoning out loud from
  // burning the whole wall-clock budget on one step (observed on shared open-weight hosts).
  // 8k leaves headroom for reasoning tokens while staying under the 8192 output limit that the
  // Hetzner-hosted Qwen3.6-A3B endpoint enforces (a lower cap truncated the final answer).
  maxOutputTokens: 8_000,
  tools: gearTools,
  // Open-weight models call tools that earlier phases showed but the current step hides; the SDK
  // would feed them an AI_NoSuchToolError text result and they often loop on it until the step
  // budget dies. Repair executes any call that maps to a real tool with fixable args instead.
  repairToolCall: async ({ toolCall, tools, messages }) => {
    const repaired = await repairGearToolCall(toolCall, tools, messages)
    if (repaired && repaired.toolName !== toolCall.toolName) {
      logCost('tool_call_repaired', { from: toolCall.toolName, to: repaired.toolName })
    }
    return repaired
  },
  // Derive the phase from the conversation (not stepNumber) so it survives the approval round-trip.
  prepareStep: ({ messages }) => {
    const depth = depthFromPrompt(promptTextOf(messages))
    const called = messages.flatMap((m) =>
      m.role === 'assistant' && Array.isArray(m.content)
        ? m.content.flatMap((p) => (p.type === 'tool-call' ? [p.toolName] : []))
        : [],
    )
    const count = (name: ToolName) => called.filter((c) => c === name).length
    // Restrict which tools are visible per phase, but do NOT set a hard toolChoice. Open-weight
    // models (Qwen3) sometimes answer a forced-tool step with plain text, and the AI SDK turns that
    // into a fatal AI_ToolChoiceViolationError that kills the whole run. With only activeTools set,
    // a text answer just ends the loop gracefully; the phase ordering still holds because exactly
    // one (or a few) tools are visible and the prompt drives the sequence.
    const only = (name: ToolName) => ({ activeTools: [name] })

    const phase = (): { activeTools: ToolName[]; toolChoice?: 'none' } => {
      if (hasLayer(depth, 'research') && !count('checkEvidence')) return only('checkEvidence')
      if (!count('buildGearProfile')) return only('buildGearProfile')
      // A shortlist with a repeated shoe is rejected by the tool; allow exactly one corrected attempt.
      const rejectedShortlist = messages.some(
        (m) =>
          m.role === 'tool' &&
          m.content.some(
            (p) =>
              p.type === 'tool-result' &&
              p.toolName === 'recommendProducts' &&
              p.output.type === 'json' &&
              typeof (p.output.value as { error?: unknown } | null)?.error === 'string',
          ),
      )
      if (rejectedShortlist && count('recommendProducts') < 3) {
        // Let Forma keep hunting: a rejected shortlist lifts the depth search cap so a
        // monoculture result set (same model, many retailers) can be worked around. Keep toolChoice
        // auto here too — a hard 'required' makes Qwen2.5-72B occasionally answer in text, which the
        // SDK turns into a fatal AI_ToolChoiceViolationError. Recovery is instead driven by the
        // rejection payload's availableProductPages plus the prompt instruction to copy from it.
        // Cap corrective searching so a model that keeps re-searching still converges on a pick.
        return {
          activeTools: (count('searchProducts') < 6
            ? ['searchProducts', 'recommendProducts']
            : ['recommendProducts']) as ToolName[],
        }
      }
      if (!count('recommendProducts')) {
        if (count('searchProducts') < DEPTHS[depth].searches) return only('searchProducts')
        const context: ToolName[] = []
        if (hasLayer(depth, 'riders') && !count('checkCommunity')) context.push('checkCommunity')
        if (hasLayer(depth, 'athletes') && !count('checkAthletes')) context.push('checkAthletes')
        if (context.length === 1) return only(context[0])
        if (context.length > 1) return { activeTools: context }
        return only('recommendProducts')
      }
      return { activeTools: [], toolChoice: 'none' as const }
    }

    const decision = phase()
    // If the last step hallucinated a tool this phase hides, yield: put it back in the active set
    // so the model's retry executes for real instead of bouncing off AI_NoSuchToolError text until
    // the step budget dies (observed: a 14-step run of 12 phantom searches and zero picks). Cap the
    // yields though — observed failure #2 was a model that used the unlocked search as an escape
    // hatch, searching 15 times and never recommending; after three hallucinations the phase gate
    // goes hard again and the only visible move is the one the depth plan calls for.
    const phantom = phantomToolCall(messages, GEAR_TOOL_NAMES)
    if (phantom && phantomToolCalls(messages).length <= 3 && !decision.activeTools.includes(phantom)) {
      return { ...decision, activeTools: [...decision.activeTools, phantom] }
    }
    return decision
  },
  })
}

export type GearAgentUIMessage = InferAgentUIMessage<ReturnType<typeof createGearAgent>>
