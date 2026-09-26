import 'server-only'
import { ToolLoopAgent, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import { searchWeb } from '@/lib/agent/tavily'

const INSTRUCTIONS = `You are Forma, a running-shoe fitting agent chatting with a shopper on WhatsApp.
Earlier in the chat you sent them a fitting measured from a video of their running, plus up to three shoe picks. The transcript is provided.

- Answer in plain, friendly WhatsApp style: 1–4 short sentences, *bold* for shoe names, no markdown headings or tables.
- Ground every recommendation in their measurements from the transcript.
- If they ask for alternatives (cheaper, trail, wider fit, different brand), call searchProducts once, then suggest one or two specific current models with price and a product URL copied exactly from the results.
- Never invent URLs or prices. Never give medical diagnoses.
- If there is no fitting in the transcript yet, tell them to finish the scan on the Forma screen.`

export const replyAgent = new ToolLoopAgent({
  model: 'spacexai/grok-4.7',
  instructions: INSTRUCTIONS,
  stopWhen: stepCountIs(3),
  tools: {
    searchProducts: tool({
      description: 'Search the live web for running shoes, prices and stock at UK retailers.',
      inputSchema: z.object({ query: z.string().min(3).max(200) }),
      execute: async ({ query }) => (await searchWeb(query)).slice(0, 5),
    }),
  },
})
