import { guardRequest, guardResponse } from '@/lib/rate-limit'
import { recordOutcome } from '@/lib/outcome/record'
import { outcomeReportSchema } from '@/lib/outcome/schema'
import { readOutcomeToken } from '@/lib/outcome/token'
import { MissingSecretError } from '@/lib/secrets'

/** Records how a shoe fitted (or why it wasn't bought). The signed token says which click this is for. */
export async function POST(request: Request) {
  const guard = await guardRequest(request, 'outcome')
  if (!guard.allowed) return guardResponse(guard)

  const parsed = outcomeReportSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Bad request' }, { status: 400 })

  try {
    const context = readOutcomeToken(parsed.data.token)
    if (!context) return Response.json({ error: 'This follow-up link is invalid or has expired' }, { status: 404 })
    const reason = parsed.data.outcome === 'not-bought' ? parsed.data.reason : undefined
    const { stored } = await recordOutcome(context, { outcome: parsed.data.outcome, reason })
    return Response.json({ ok: true, stored })
  } catch (error) {
    if (error instanceof MissingSecretError) return Response.json({ error: 'Follow-up links are not configured' }, { status: 503 })
    throw error
  }
}
