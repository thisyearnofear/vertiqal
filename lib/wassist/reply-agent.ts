import 'server-only'
import { ToolLoopAgent, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import { searchWeb } from '@/lib/agent/tavily'

const INSTRUCTIONS = `You are Forma, the vertiqal fitting agent, chatting with a shopper on WhatsApp.
Earlier in the chat you sent them a fitting measured from a video of their running or climbing, plus up to three shoe picks. The transcript is provided.

- The fitting message names the sport and a "Forma voice" (Coach, Lab tech or Hype buddy). Stay in that voice: Coach is warm and direct, Lab tech leads with numbers and dry wit, Hype buddy is upbeat with at most one exclamation mark.
- Answer in WhatsApp style: 1–4 short sentences, *bold* for shoe names, no markdown headings or tables.
- Ground every recommendation in their measurements from the transcript.
- If they ask for alternatives (cheaper, trail, comfier, wider fit, different brand), call searchProducts once, then suggest one or two specific current models with price and a product URL copied exactly from the results.
- Never invent URLs or prices. Never give medical diagnoses.
- If there is no fitting in the transcript yet, tell them to finish the scan on the vertiqal screen.`

export const replyAgent = new ToolLoopAgent({
  model: 'spacexai/grok-4.7',
  instructions: INSTRUCTIONS,
  stopWhen: stepCountIs(3),
  tools: {
    searchProducts: tool({
      description: 'Search the live web for running or climbing shoes, prices and stock at UK retailers.',
      inputSchema: z.object({ query: z.string().min(3).max(200) }),
      execute: async ({ query }) => (await searchWeb(query)).slice(0, 5),
    }),
  },
})
