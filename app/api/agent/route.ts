import { createAgentUIStreamResponse, type StepResult } from 'ai'
import { agentRequestSchema, briefToPrompt } from '@/lib/agent/brief'
import { gearAgent } from '@/lib/agent/gear-agent'
import { logCost } from '@/lib/cost-log'

export const maxDuration = 120

const MAX_BODY_BYTES = 32_768

type AgentStep = StepResult<(typeof gearAgent)['tools']>

const sumUsage = (steps: AgentStep[], key: 'inputTokens' | 'outputTokens' | 'totalTokens') =>
  steps.every((s) => typeof s.usage?.[key] === 'number')
    ? steps.reduce((sum, s) => sum + (s.usage?.[key] ?? 0), 0)
    : null

export async function POST(request: Request) {
  const started = Date.now()

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: 'Request is too large' }, { status: 413 })
  }
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) {
    return Response.json({ error: 'Request is too large' }, { status: 413 })
  }

  // The client may still send `messages`; they are ignored — the prompt is built here from validated fields only.
  const parsed = agentRequestSchema.safeParse(
    (() => {
      try {
        return JSON.parse(text)
      } catch {
        return null
      }
    })(),
  )
  if (!parsed.success) {
    return Response.json({ error: 'Send a valid { brief, prefs } from a completed fitting' }, { status: 400 })
  }
  const { brief, prefs } = parsed.data

  const uiMessages = [
    { id: crypto.randomUUID(), role: 'user' as const, parts: [{ type: 'text' as const, text: briefToPrompt(brief, prefs) }] },
  ]

  const steps: AgentStep[] = []
  return createAgentUIStreamResponse({
    agent: gearAgent,
    uiMessages,
    abortSignal: request.signal,
    onStepEnd: (step) => {
      steps.push(step)
    },
    onEnd: ({ outcome }) => {
      const toolCalls: Record<string, number> = {}
      let athleteModels = 0
      for (const step of steps) {
        for (const call of step.toolCalls) {
          toolCalls[call.toolName] = (toolCalls[call.toolName] ?? 0) + 1
          if (call.toolName === 'checkAthletes') {
            const models = (call.input as { models?: unknown }).models
            if (Array.isArray(models)) athleteModels += models.length
          }
        }
      }
      // Tavily billable searches: 1 per searchProducts / checkCommunity / checkEvidence call,
      // plus 2 per model inside each checkAthletes call (model-angle + brand-angle).
      const tavilyCalls =
        (toolCalls.searchProducts ?? 0) + (toolCalls.checkCommunity ?? 0) + (toolCalls.checkEvidence ?? 0) + athleteModels * 2
      logCost('agent_run', {
        sport: brief.sport,
        depth: prefs.depth,
        steps: steps.length,
        inputTokens: sumUsage(steps, 'inputTokens'),
        outputTokens: sumUsage(steps, 'outputTokens'),
        totalTokens: sumUsage(steps, 'totalTokens'),
        ms: Date.now() - started,
        ...Object.fromEntries(Object.entries(toolCalls).map(([name, count]) => [`toolCalls_${name}`, count])),
        tavilyCalls,
        finishReason: steps.at(-1)?.finishReason ?? null,
        outcome: outcome.status,
        error: outcome.status === 'failed',
      })
    },
    onError: (error) => (error instanceof Error ? error.message : 'The agent hit an unexpected error'),
  })
}
