import { readVerifiedMember, writeMember } from '@/lib/member/cookie'
import { chatUrlFor, ensureAgent, findConversation, linkKey, sendFitting, transcriptOf } from '@/lib/wassist/client'
import { LINK_TTL_MS, issueLinkToken, newLinkCode, readLinkToken, transcriptHasCode } from '@/lib/wassist/link'
import { handoffSchema, type HandoffResult } from '@/lib/wassist/fitting'

export const maxDuration = 60

const digits = (s: string) => s.replace(/\D/g, '')

// Per-instance memos (10 min) so polling doesn't re-list agents/conversations every 3 s.
// Conversation misses are never cached — a fresh "hello" must be discovered on the next poll.
const MEMO_MS = 10 * 60_000
const MEMO_MAX = 500
const agentMemo = new Map<string, { agent: Awaited<ReturnType<typeof ensureAgent>>; at: number }>()
const conversationMemo = new Map<string, { conversation: NonNullable<Awaited<ReturnType<typeof findConversation>>>; at: number }>()

function agentFor(origin: string) {
  const cached = agentMemo.get(origin)
  if (cached && Date.now() - cached.at < MEMO_MS) return Promise.resolve(cached.agent)
  if (agentMemo.size >= MEMO_MAX) agentMemo.clear()
  return ensureAgent(origin).then((agent) => {
    agentMemo.set(origin, { agent, at: Date.now() })
    return agent
  })
}

function conversationFor(phone: string) {
  const key = digits(phone)
  const cached = conversationMemo.get(key)
  if (cached && Date.now() - cached.at < MEMO_MS) return Promise.resolve(cached.conversation)
  if (conversationMemo.size >= MEMO_MAX) conversationMemo.clear()
  return findConversation(key).then((conversation) => {
    if (conversation) conversationMemo.set(key, { conversation, at: Date.now() })
    return conversation
  })
}

/** The public origin Wassist should call back; localhost can't receive webhooks. */
function publicOrigin(request: Request) {
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
  if (!host || /^(localhost|127\.|0\.0\.0\.0)/.test(host)) return null
  return `https://${host}`
}

/** Issue a fresh code + signed token and the wa.me-style URL that pre-fills it. */
function awaitingCode(agent: Awaited<ReturnType<typeof ensureAgent>>, phone: string, now = Date.now()): HandoffResult {
  const code = newLinkCode()
  const link = issueLinkToken(linkKey(), { phone, code, now })
  const sendUrl = new URL(agent.connectUrl)
  sendUrl.searchParams.set('text', code)
  return { status: 'awaiting-code', code, link, sendUrl: sendUrl.toString(), expiresAt: new Date(now + LINK_TTL_MS).toISOString() }
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

  // A verified member can send without retyping their number; unverified or mismatched phones go
  // through the code flow so a typed number can never reach someone else's chat.
  const member = await readVerifiedMember()
  const typed = parsed.data.phone
  const trusted = member && (!typed || typed === member.phone) ? member : null
  const phone = trusted ? trusted.phone : typed
  if (!phone) return Response.json({ error: 'Enter your WhatsApp number' }, { status: 400 })

  const now = Date.now()
  try {
    const agent = await agentFor(origin)
    const conversation = await conversationFor(phone)
    if (!conversation) {
      return Response.json({ status: 'awaiting-link', connectUrl: agent.connectUrl } satisfies HandoffResult)
    }

    let verified = Boolean(trusted)
    if (!verified && parsed.data.link) {
      const link = readLinkToken(linkKey(), parsed.data.link, now)
      if (!link || link.phone !== phone) {
        return Response.json({ status: 'expired' } satisfies HandoffResult)
      }
      const transcript = await transcriptOf(conversation.id, 30)
      if (transcriptHasCode(transcript, link.code)) {
        verified = true
      } else {
        // Same token back out: no new code, no send, no cookie until the code is seen on the phone.
        const sendUrl = new URL(agent.connectUrl)
        sendUrl.searchParams.set('text', link.code)
        return Response.json({
          status: 'awaiting-code',
          code: link.code,
          link: parsed.data.link,
          sendUrl: sendUrl.toString(),
          expiresAt: new Date(now + LINK_TTL_MS).toISOString(),
        } satisfies HandoffResult)
      }
    }
    if (!verified) {
      return Response.json(awaitingCode(agent, phone, now) satisfies HandoffResult)
    }

    const { fitting } = parsed.data
    const messages = await sendFitting(conversation.id, fitting)
    const previous = member?.phone === phone ? member.last : null
    await writeMember({
      phone,
      verifiedAt: new Date(now).toISOString(),
      last: fitting.choice
        ? {
            sport: fitting.sport,
            name: fitting.choice.name,
            retailer: fitting.choice.retailer,
            price: fitting.choice.price,
            size: fitting.choice.size,
            at: new Date(now).toISOString(),
          }
        : previous,
    })
    return Response.json({ status: 'sent', chatUrl: chatUrlFor(agent.connectUrl), messages } satisfies HandoffResult)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 })
  }
}
