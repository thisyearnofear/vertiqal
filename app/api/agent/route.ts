import { createAgentUIStreamResponse } from 'ai'
import { gearAgent } from '@/lib/agent/gear-agent'

export const maxDuration = 120

export async function POST(request: Request) {
  const { messages } = await request.json()
  return createAgentUIStreamResponse({
    agent: gearAgent,
    uiMessages: messages,
    abortSignal: request.signal,
    onError: (error) => (error instanceof Error ? error.message : 'The agent hit an unexpected error'),
  })
}
