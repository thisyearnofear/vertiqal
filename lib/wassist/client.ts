import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Fitting } from './fitting'

const API = 'https://backend.wassist.app/api/v1'
const AGENT_NAME = 'Forma · stride fitting'

interface Agent {
  id: string
  name: string
  connectUrl: string
  tools: { name: string; apiSchema?: { url?: string } }[]
}

interface Conversation {
  id: string
  contact: { phoneNumber: string; name: string | null }
  active: unknown
}

interface Message {
  role: string
  createdAt: string
  text: unknown
  unified: unknown
}

type Paginated<T> = { results: T[] }

function apiKey() {
  const key = process.env.WASSIST_API_KEY
  if (!key) throw new Error('WASSIST_API_KEY is not configured')
  return key
}

async function wassist<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: { 'X-API-Key': apiKey(), 'Content-Type': 'application/json' },
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
    cache: 'no-store',
  })
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300)
    throw new Error(`Wassist ${init.method ?? 'GET'} ${path} failed (${res.status}): ${detail}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

/** Wassist BYOA webhooks are unsigned, so the URL carries a secret derived from the API key. */
export const webhookToken = () => createHmac('sha256', apiKey()).update('forma-wassist-webhook').digest('hex').slice(0, 40)

export function isValidWebhookToken(token: string | null) {
  if (!token) return false
  const expected = Buffer.from(webhookToken())
  const given = Buffer.from(token)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const digits = (s: string) => s.replace(/\D/g, '')

/** Reuses the Forma agent if it already points at this deployment, otherwise replaces it. */
export async function ensureAgent(origin: string): Promise<Agent> {
  const webhookUrl = `${origin}/api/wassist/webhook?token=${webhookToken()}`
  const { results } = await wassist<Paginated<Agent>>('/agents/?limit=100')
  const forma = results.filter((a) => a.name === AGENT_NAME)
  const current = forma.find((a) => a.tools.some((t) => t.apiSchema?.url === webhookUrl))
  if (current) return current

  await Promise.all(forma.map((a) => wassist(`/agents/${a.id}/`, { method: 'DELETE' })))
  const created = await wassist<Agent>('/agents/byoa/', { method: 'POST', json: { webhookUrl } })
  return wassist<Agent>(`/agents/${created.id}/`, {
    method: 'PATCH',
    json: {
      name: AGENT_NAME,
      description: 'Running-shoe fitting from a video of your stride.',
      firstMessage:
        "You're linked to *Forma*. Head back to the screen and your fitting will land here in a few seconds.",
    },
  })
}

export async function findConversation(phone: string) {
  const { results } = await wassist<Paginated<Conversation>>('/conversations/?limit=100')
  return results.find((c) => digits(c.contact.phoneNumber) === digits(phone)) ?? null
}

type UnifiedButton = { type: 'url'; text: string; url: string } | { type: 'quick_reply'; text: string; quickReplyId: string }

const sendUnified = (conversationId: string, text: string, buttons?: UnifiedButton[], footer?: string) =>
  wassist(`/conversations/${conversationId}/messages/`, {
    method: 'POST',
    json: { type: 'unified', unified: { text: text.slice(0, 1024), footer, buttons } },
  })

export async function sendFitting(conversationId: string, fitting: Fitting) {
  const requirements = fitting.requirements.map((r) => `• ${r.attribute}: *${r.target}*`).join('\n')
  const messages: Parameters<typeof sendUnified>[] = [
    [
      conversationId,
      `*Your Forma fitting*\n${fitting.measurements}\n\n${fitting.summary}\n\nYou need a *${fitting.category}* shoe:\n${requirements}`,
      undefined,
      'Measured from your running video',
    ],
    ...fitting.picks.map((p, i): Parameters<typeof sendUnified> => [
      conversationId,
      `*${i === 0 ? 'Best fit' : `Option ${i + 1}`}: ${p.name}*\n${p.price} at ${p.retailer}\n\n_${p.why}_`,
      [{ type: 'url', text: `Open ${p.retailer}`.slice(0, 20), url: p.url }],
    ]),
    [
      conversationId,
      'Ask me anything about these, or tell me what to change.',
      [
        { type: 'quick_reply', text: 'Anything cheaper?', quickReplyId: 'cheaper' },
        { type: 'quick_reply', text: 'Why the best fit?', quickReplyId: 'why-best' },
        { type: 'quick_reply', text: 'Trail version?', quickReplyId: 'trail' },
      ],
    ],
  ]
  // Sequential so WhatsApp shows them in order.
  for (const args of messages) await sendUnified(...args)
  return messages.length
}

const textOf = (m: Message): string => {
  for (const v of [m.text, m.unified]) {
    if (typeof v === 'string' && v.trim()) return v
    if (v && typeof v === 'object') {
      const t = (v as { body?: unknown; text?: unknown }).body ?? (v as { text?: unknown }).text
      if (typeof t === 'string' && t.trim()) return t
    }
  }
  return ''
}

/** Recent chat as plain lines, oldest first, for the reply agent's context. */
export async function recentTranscript(phone: string, limit = 20) {
  const conversation = await findConversation(phone)
  if (!conversation) return ''
  const { results } = await wassist<Paginated<Message>>(`/conversations/${conversation.id}/messages/?limit=${limit}`)
  return results
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((m) => ({ role: m.role, text: textOf(m) }))
    .filter((m) => m.text)
    .map((m) => `${/user|customer|contact/i.test(m.role) ? 'SHOPPER' : 'FORMA'}: ${m.text}`)
    .join('\n')
}

export const chatUrlFor = (connectUrl: string) => connectUrl.split('?')[0]
