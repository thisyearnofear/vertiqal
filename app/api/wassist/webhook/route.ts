import { after } from 'next/server'
import type { ModelMessage } from 'ai'
import { z } from 'zod'
import { createRateLimiter } from '@/lib/agent/stock-policy'
import { logCost } from '@/lib/cost-log'
import { fetchInboundImage, findConversation, isValidWebhookToken, markTyping, transcriptOf } from '@/lib/wassist/client'
import { isLinkCodeMessage } from '@/lib/wassist/link'
import { replyAgent } from '@/lib/wassist/reply-agent'

export const maxDuration = 60

const wassistUrl = z
  .string()
  .url()
  .refine((u) => /(^|\.)wassist\.app$/.test(new URL(u).hostname), 'Unexpected host')

const inbound = z.object({
  message: z.string().max(4000).nullish(),
  image: wassistUrl.nullish(),
  phone_number: z.string().min(6).max(20),
  reply_callback: wassistUrl,
})

/** Tells the Wassist relay to stay silent; the real answer arrives via reply_callback. */
const SILENT = { content: 'No CUSTOMER message reply' }
const TYPING_REFRESH_MS = 8_000
const LINK_ACK = 'Got it — linking you to your fitting now. Head back to the screen.'
const LIMITED_REPLY = "I've answered a lot today — message me again tomorrow and I'll pick up where we left off."
// Per-phone reply cap. In-memory per serverless instance like the stock-check limiter; a shared
// store (Upstash) is a later step, so this bounds casual use rather than a determined abuser.
const REPLY_LIMIT = 25
const replyLimiter = createRateLimiter({ limit: REPLY_LIMIT, windowMs: 24 * 60 * 60_000 })

export async function POST(request: Request) {
  if (!isValidWebhookToken(new URL(request.url).searchParams.get('token'))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = inbound.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid payload' }, { status: 400 })

  const { phone_number, reply_callback, image } = parsed.data
  const message = parsed.data.message?.trim() ?? ''
  if ((!message && !image) || message.startsWith('/connect')) return Response.json(SILENT)
  // Link codes just need an ack — no model call, and they don't count toward the reply cap.
  const linkAck = isLinkCodeMessage(message) && !image

  // Wassist expects a reply within ~5s; Grok plus a web search or a photo can take longer.
  after(async () => {
    let content: string
    let typing: ReturnType<typeof setInterval> | undefined
    const started = Date.now()
    if (linkAck) {
      content = LINK_ACK
    } else if (!replyLimiter(phone_number.replace(/\D/g, '')).allowed) {
      logCost('paid_call', { route: 'wassist-reply', ok: false, limited: true, ms: 0 })
      content = LIMITED_REPLY
    } else try {
      const conversation = await findConversation(phone_number)
      if (conversation) {
        void markTyping(conversation.id)
        typing = setInterval(() => void markTyping(conversation.id), TYPING_REFRESH_MS)
      }
      const [transcript, photo] = await Promise.all([
        conversation ? transcriptOf(conversation.id) : '',
        image ? fetchInboundImage(image).catch(() => null) : null,
      ])
      const text = [
        `Transcript so far:\n${transcript || '(empty)'}`,
        `Shopper's new message: ${message || '(no text)'}`,
        image && !photo ? 'They sent a photo, but it could not be loaded. Ask them to try sending it again.' : '',
        photo ? 'They attached the photo below.' : '',
      ]
        .filter(Boolean)
        .join('\n\n')
      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text }, ...(photo ? [{ type: 'file' as const, ...photo }] : [])],
        },
      ]
      const result = await replyAgent.generate({ messages })
      const searches = result.steps.flatMap((s) => s.toolCalls).filter((c) => c.toolName === 'searchProducts').length
      logCost('paid_call', {
        route: 'wassist-reply',
        ok: true,
        ms: Date.now() - started,
        photo: Boolean(photo),
        searches,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
      })
      content = result.text.trim() || 'Sorry, I lost my train of thought. Could you ask that again?'
    } catch (error) {
      logCost('paid_call', { route: 'wassist-reply', ok: false, ms: Date.now() - started })
      console.error('[wassist] reply failed', error)
      content = 'Forma hit a snag answering that. Give it another go in a moment.'
    } finally {
      clearInterval(typing)
    }
    const res = await fetch(reply_callback, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) console.error(`[wassist] reply_callback ${res.status}; reply was: ${content.slice(0, 160)}`)
  })

  return Response.json(SILENT)
}
