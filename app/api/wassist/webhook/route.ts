import { after } from 'next/server'
import { z } from 'zod'
import { isValidWebhookToken, recentTranscript } from '@/lib/wassist/client'
import { replyAgent } from '@/lib/wassist/reply-agent'

export const maxDuration = 60

const inbound = z.object({
  message: z.string().max(4000).default(''),
  phone_number: z.string().min(6).max(20),
  reply_callback: z
    .string()
    .url()
    .refine((u) => /(^|\.)wassist\.app$/.test(new URL(u).hostname), 'Unexpected callback host'),
})

/** Tells the Wassist relay to stay silent; the real answer arrives via reply_callback. */
const SILENT = { content: 'No CUSTOMER message reply' }

export async function POST(request: Request) {
  if (!isValidWebhookToken(new URL(request.url).searchParams.get('token'))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = inbound.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid payload' }, { status: 400 })

  const { message, phone_number, reply_callback } = parsed.data
  if (!message.trim() || message.startsWith('/connect')) return Response.json(SILENT)

  // Wassist expects a reply within ~5s; Grok plus a web search can take longer.
  after(async () => {
    let content: string
    try {
      const transcript = await recentTranscript(phone_number)
      const { text } = await replyAgent.generate({
        prompt: `Transcript so far:\n${transcript || '(empty)'}\n\nShopper's new message: ${message}`,
      })
      content = text.trim() || 'Sorry, I lost my train of thought. Could you ask that again?'
    } catch (error) {
      console.error('[wassist] reply failed', error)
      content = 'Forma hit a snag answering that. Give it another go in a moment.'
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
