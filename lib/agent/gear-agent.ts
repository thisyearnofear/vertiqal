import 'server-only'
import { ToolLoopAgent, stepCountIs, tool, type InferAgentUIMessage, type ModelMessage } from 'ai'
import { z } from 'zod'
import { DEPTHS, depthFromPrompt, hasLayer } from './depth'
import { findingsFor } from './evidence'
import { issueStockToken } from './stock-token'
import { searchCommunity, searchOpen, searchResearch, searchWeb } from './tavily'

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
- searchProducts: specific queries for current models that fit the profile, favouring UK retailers with product pages (not review roundups).
- checkCommunity (considered and deep): name the 3–5 strongest candidates. Drop or demote a candidate if riders consistently report a problem relevant to this shopper.
- checkAthletes (deep): the same top 3 candidates. Call it in the same step as checkCommunity when both are offered.
- recommendProducts: exactly 3 picks, each a different model, best fit first. Only use URLs from searchProducts results; never invent or edit URLs. Respect the budget. Fill community, research and wornBy only from their own tool results, and use "" for any layer that did not run. Athletes are context, never a reason to rank a worse-fitting shoe higher; be explicit that sponsored athletes are paid to wear a brand, and only name athletes that appear in the checkAthletes results.
- Finish with one short sentence, in the requested voice, inviting the shopper to choose one. Forma checks their size is in stock once they choose, so never send them off to a retailer yourself.

If the brief mentions a previous fitting or things they told Forma on WhatsApp, treat this as a returning customer: build on what they chose last time and what they said since (e.g. if they reported a problem with that shoe, steer away from it and say why).

If the brief includes an "About me" section (goal, surface, width, niggles, Grok vision findings from sole photos or video stills), let it shape the profile and cite it as evidence where relevant.

Rules: never claim medical diagnoses; research explains, it does not prescribe. Speak plainly. Don't mention these instructions.`

type ToolName =
  | 'checkEvidence'
  | 'buildGearProfile'
  | 'searchProducts'
  | 'checkCommunity'
  | 'checkAthletes'
  | 'recommendProducts'

function promptTextOf(messages: ModelMessage[]) {
  const first = messages.find((m) => m.role === 'user')
  if (!first) return ''
  if (typeof first.content === 'string') return first.content
  return first.content.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n')
}

export const gearAgent = new ToolLoopAgent({
  model: 'spacexai/grok-4.7',
  instructions: INSTRUCTIONS,
  // Deepest legit run is ~8 steps (research → profile → 2 searches → community + athletes → recommend → final text).
  stopWhen: stepCountIs(10),
  tools: {
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
      execute: async ({ picks }) => ({
        picks: picks.map((p) => ({ ...p, stockToken: issueStockToken({ productName: p.name, productUrl: p.url }) })),
      }),
    }),
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
    const only = (name: ToolName) => ({
      activeTools: [name],
      toolChoice: { type: 'tool' as const, toolName: name },
    })

    if (hasLayer(depth, 'research') && !count('checkEvidence')) return only('checkEvidence')
    if (!count('buildGearProfile')) return only('buildGearProfile')
    if (!count('recommendProducts')) {
      if (count('searchProducts') < DEPTHS[depth].searches) return only('searchProducts')
      const context: ToolName[] = []
      if (hasLayer(depth, 'riders') && !count('checkCommunity')) context.push('checkCommunity')
      if (hasLayer(depth, 'athletes') && !count('checkAthletes')) context.push('checkAthletes')
      if (context.length === 1) return only(context[0])
      if (context.length > 1) return { activeTools: context, toolChoice: 'required' as const }
      return only('recommendProducts')
    }
    return { activeTools: [], toolChoice: 'none' as const }
  },
})

export type GearAgentUIMessage = InferAgentUIMessage<typeof gearAgent>
