import { readMember, writeMember } from '@/lib/member/cookie'
import { chatUrlFor, ensureAgent, findConversation, sendFitting } from '@/lib/wassist/client'
import { handoffSchema, type HandoffResult } from '@/lib/wassist/fitting'

export const maxDuration = 60

/** The public origin Wassist should call back; localhost can't receive webhooks. */
function publicOrigin(request: Request) {
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
  if (!host || /^(localhost|127\.|0\.0\.0\.0)/.test(host)) return null
  return `https://${host}`
}

export async function POST(request: Request) {
  const parsed = handoffSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const origin = publicOrigin(request)
  if (!origin) {
    return Response.json({ error: 'Open Forma on its public URL so WhatsApp can reach it.' }, { status: 400 })
  }

  // A returning shopper can send without retyping their number; it never leaves the server.
  const member = await readMember()
  const phone = parsed.data.phone ?? member?.phone
  if (!phone) return Response.json({ error: 'Enter your WhatsApp number' }, { status: 400 })

  try {
    const agent = await ensureAgent(origin)
    const conversation = await findConversation(phone)
    if (!conversation) {
      return Response.json({ status: 'awaiting-link', connectUrl: agent.connectUrl } satisfies HandoffResult)
    }
    const { fitting } = parsed.data
    const messages = await sendFitting(conversation.id, fitting)
    const previous = member?.phone === phone ? member.last : null
    await writeMember({
      phone,
      last: fitting.choice
        ? {
            sport: fitting.sport,
            name: fitting.choice.name,
            retailer: fitting.choice.retailer,
            price: fitting.choice.price,
            size: fitting.choice.size,
            at: new Date().toISOString(),
          }
        : previous,
    })
    return Response.json({ status: 'sent', chatUrl: chatUrlFor(agent.connectUrl), messages } satisfies HandoffResult)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 })
  }
}
