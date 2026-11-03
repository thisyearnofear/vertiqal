import { logCost } from '@/lib/cost-log'
import { guardRequest, guardResponse } from '@/lib/rate-limit'
import { newClickRef, issueOutcomeToken } from '@/lib/outcome/token'
import { outcomeLinkRequestSchema } from '@/lib/outcome/schema'
import { MissingSecretError } from '@/lib/secrets'

/**
 * Issues a click reference and a signed follow-up link for one click-out. The browser sends it as the
 * Awin `clickref` and keeps the link so the shopper can say how the shoes fit weeks later. Nothing is
 * stored here: the link carries its own context.
 */
export async function POST(request: Request) {
  const guard = await guardRequest(request, 'outcome')
  if (!guard.allowed) return guardResponse(guard)

  const parsed = outcomeLinkRequestSchema.omit({ ref: true }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Bad request' }, { status: 400 })

  try {
    const ref = newClickRef()
    const token = issueOutcomeToken({ ...parsed.data, ref, at: Date.now() })
    logCost('outcome_link_issued', { ref, sport: parsed.data.sport, retailer: parsed.data.retailer })
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
    const origin = host ? `${host.startsWith('localhost') ? 'http' : 'https'}://${host}` : new URL(request.url).origin
    return Response.json({ ref, url: `${origin}/fit/${token}` })
  } catch (error) {
    if (error instanceof MissingSecretError) return Response.json({ error: 'Follow-up links are not configured' }, { status: 503 })
    throw error
  }
}
