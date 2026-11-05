import { Output, generateText } from 'ai'
import { z } from 'zod'
import { INTAKE_OPTIONS } from '@/lib/agent/fitting-notes'
import { friendlyModelError, resolveModel } from '@/lib/agent/models'
import { briefParseSchema } from '@/lib/fitting/brief-parse'
import { logCost } from '@/lib/cost-log'
import { checkFeature, quotaResponse } from '@/lib/fitting/usage'
import { guardRequest, guardResponse } from '@/lib/rate-limit'

export const maxDuration = 30

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
const MAX_IMAGE_CHARS = 900_000

const bodySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    sport: z.enum(['running', 'climbing']),
    text: z.string().trim().min(3).max(300),
  }),
  z.object({
    kind: z.literal('surface'),
    sport: z.enum(['running', 'climbing']),
    image: z.string().max(MAX_IMAGE_CHARS).regex(DATA_URL),
  }),
])

const surfaceSchema = (sport: 'running' | 'climbing') =>
  z.object({
    surface: z.enum(INTAKE_OPTIONS[sport].surfaces).nullable(),
    confidence: z.enum(['low', 'medium', 'high']),
  })

export async function POST(request: Request) {
  const guard = await guardRequest(request, 'brief')
  if (!guard.allowed) {
    logCost('limit_hit', { surface: 'brief', reason: guard.reason })
    return guardResponse(guard)
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Bad request' }, { status: 400 })
  const { kind, sport } = parsed.data

  const quota = await checkFeature(request, kind === 'surface' ? 'surface-guess' : 'describe')
  if (!quota.ok) {
    logCost('limit_hit', { surface: 'brief', reason: 'tier_quota', tier: quota.tier, used: quota.used })
    return quotaResponse(quota)
  }

  const started = Date.now()
  const role = kind === 'surface' ? 'vision' : 'fast'

  // One call-level fallback: if the resolved model errors (a provider hiccup, an unparseable
  // completion), probe the rest of the chain with the failed model skipped and retry once. This
  // converts a transient single-provider failure into a pass on the backup instead of a 502.
  const runOnce = async (skip?: readonly string[]) => {
    const resolved = await resolveModel(role, skip ? { skip } : undefined)
    if (!resolved) return { resolved: null as Awaited<ReturnType<typeof resolveModel>>, output: null }
    if (kind === 'text') {
      const { output } = await generateText({
        model: resolved.model,
        system: `You are Forma, a ${sport} shoe fitter. Return one JSON object with exactly these keys: size, budgetPounds, goal, surface, width, currentShoe, fitNote. Use null for anything not stated. size looks like "UK 9". budgetPounds is a number: "under 150 pounds" means 150. goal is one of ${INTAKE_OPTIONS[sport].goals.join(', ')} or null. surface is one of ${INTAKE_OPTIONS[sport].surfaces.join(', ')} or null. width is narrow, standard, wide, or null. No other text.`,
        providerOptions: { openaiCompatible: { structuredOutputs: false } },
        messages: [{ role: 'user', content: parsed.data.text }],
        output: Output.object({ schema: briefParseSchema(sport) }),
        abortSignal: AbortSignal.timeout(20_000),
      })
      return { resolved, output }
    }

    const [, mediaType, data] = parsed.data.image.match(DATA_URL)!
    const { output } = await generateText({
      model: resolved.model,
      system: `You are Forma, a ${sport} shoe fitter. This is one still from the shopper's own ${sport === 'running' ? 'running' : 'climbing'} video with a pose skeleton drawn on top. Say which listed ${sport === 'running' ? 'surface' : 'rock or wall type'} they are on, only if it is visible. If you cannot tell, return null with low confidence. Return JSON only: {"surface": one of ${INTAKE_OPTIONS[sport].surfaces.join(', ')} or null, "confidence": "low" | "medium" | "high"}.`,
      providerOptions: { openaiCompatible: { structuredOutputs: false } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Which surface is this?' },
            { type: 'file' as const, mediaType, data },
          ],
        },
      ],
      output: Output.object({ schema: surfaceSchema(sport) }),
      abortSignal: AbortSignal.timeout(20_000),
    })
    return { resolved, output }
  }

  try {
    const first = await runOnce()
    if (!first.resolved) {
      logCost('paid_call', { route: 'brief', ok: false, ms: Date.now() - started, kind, sport, reason: 'no_model_available' })
      return Response.json({ error: 'Forma’s model is unreachable right now — try again shortly.' }, { status: 503 })
    }
    logCost('paid_call', { route: 'brief', ok: true, ms: Date.now() - started, kind, sport, model: first.resolved.label })
    return Response.json(first.output)
  } catch (error) {
    const failedLabel = (await resolveModel(role))?.label ?? 'unknown'
    logCost('paid_call', { route: 'brief', ok: false, ms: Date.now() - started, kind, sport, model: failedLabel, error: friendlyModelError(error) })
    try {
      const retry = await runOnce([failedLabel])
      if (retry.resolved) {
        logCost('paid_call', { route: 'brief', ok: true, ms: Date.now() - started, kind, sport, model: retry.resolved.label, fallback: true })
        return Response.json(retry.output)
      }
    } catch {
      // fall through to the 502 below
    }
    return Response.json({ error: friendlyModelError(error) }, { status: 502 })
  }
}
