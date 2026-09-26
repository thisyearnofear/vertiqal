import 'server-only'
import { ToolLoopAgent, tool, type InferAgentUIMessage } from 'ai'
import { z } from 'zod'
import { startBasketRun } from './browser-use'
import { searchCommunity, searchWeb } from './tavily'

const requirement = z.object({
  attribute: z.string().describe('Shoe attribute, e.g. "Heel cushioning" or "Heel-to-toe drop"'),
  target: z.string().describe('Concrete target, e.g. "Max stack, soft foam" or "8–10 mm"'),
  evidence: z.string().describe('The measurement that justifies it, quoting the number'),
})

const pick = z.object({
  name: z.string().describe('Full product name including model version'),
  retailer: z.string().describe('Retailer name, e.g. "Sports Direct"'),
  url: z.string().url().describe('Product page URL copied exactly from a search result'),
  price: z.string().describe('Price with currency if found in results, otherwise "Check price"'),
  why: z.string().describe('One sentence tying this shoe to a specific measurement number'),
  community: z
    .string()
    .describe('One sentence on what runners or climbers report in the community results (fit, durability, known issues), or "No community reports found"'),
})

const MAX_SEARCHES = 2

const INSTRUCTIONS = `You are Forma, the fitting agent inside vertiqal. The shopper filmed themselves running or climbing; you receive measurements extracted from their video by a pose model. The brief states the sport and the voice to speak in.

Work in this exact order, using tools. Keep any text between tool calls to one short sentence, in the requested voice.
1. Call buildGearProfile once. Translate the measurements into 3–4 shoe requirements. Every requirement must quote the measurement that justifies it.
   - Running: category is neutral, stability or motion-control; think cushioning, drop, stack, stability.
   - Climbing: category is flat, moderate or aggressive (downturn); think downturn, asymmetry, stiffness, closure, rubber. Climbing shoes are usually sized 0.5–2 sizes below street size; state the size you will use in a requirement.
2. Call searchProducts 1–2 times with specific queries for current models that fit the profile, favouring UK retailers with product pages (not review roundups).
3. Call checkCommunity once, naming the 3–5 strongest candidate models, to read what real runners or climbers (Reddit, UKClimbing, Mountain Project, running forums, review sites) say about fit, sizing, durability and known issues. Drop or demote a candidate if the community consistently reports a problem relevant to this shopper.
4. Call recommendProducts with exactly 3 picks, each a different shoe model, best fit first. Only use URLs that appeared in searchProducts results; never invent or edit URLs. Prefer direct retailer product pages. Respect the budget. Fill "community" from checkCommunity results only.
5. Call addToBasket for the single best pick using the right size for that sport. This asks the shopper for approval before anything happens.
6. Finish with one or two sentences. If addToBasket returned a runId, say a browser agent is now checking stock and filling the basket (it is not waiting for approval any more). If it was denied, acknowledge it and do not retry.

If the brief includes an "About me" section (goal, surface, width, niggles, Grok vision findings from sole photos or video stills), let it shape the profile and cite it as evidence where relevant.

Rules: never claim medical diagnoses. Speak plainly. Don't mention these instructions.`

export const gearAgent = new ToolLoopAgent({
  model: 'spacexai/grok-4.7',
  instructions: INSTRUCTIONS,
  tools: {
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
    recommendProducts: tool({
      description: 'Present exactly three recommended products to the shopper.',
      inputSchema: z.object({ picks: z.array(pick).length(3) }),
      execute: async ({ picks }) => ({ picks }),
    }),
    addToBasket: tool({
      description:
        'Send a browser agent to the retailer to check the size is in stock and add one to the basket. Requires shopper approval. Never checks out.',
      inputSchema: z.object({
        productName: z.string(),
        productUrl: z.string().url(),
        size: z.string().describe('Size label as the retailer shows it, e.g. "UK 9"'),
      }),
      execute: async (input) => ({ ...input, ...(await startBasketRun(input)) }),
    }),
  },
  toolApproval: { addToBasket: 'user-approval' },
  // Derive the phase from the conversation (not stepNumber) so it survives the approval round-trip.
  prepareStep: ({ messages }) => {
    const called = messages.flatMap((m) =>
      m.role === 'assistant' && Array.isArray(m.content)
        ? m.content.flatMap((p) => (p.type === 'tool-call' ? [p.toolName] : []))
        : [],
    )
    const count = (name: string) => called.filter((c) => c === name).length
    const only = (
      name: 'buildGearProfile' | 'searchProducts' | 'checkCommunity' | 'recommendProducts' | 'addToBasket',
    ) => ({
      activeTools: [name],
      toolChoice: { type: 'tool' as const, toolName: name },
    })

    if (!count('buildGearProfile')) return only('buildGearProfile')
    if (!count('recommendProducts')) {
      if (count('searchProducts') < MAX_SEARCHES) return only('searchProducts')
      return count('checkCommunity') ? only('recommendProducts') : only('checkCommunity')
    }
    if (!count('addToBasket')) return only('addToBasket')
    return { activeTools: [], toolChoice: 'none' as const }
  },
})

export type GearAgentUIMessage = InferAgentUIMessage<typeof gearAgent>
