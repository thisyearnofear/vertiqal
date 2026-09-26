import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Fitting } from './fitting'

const API = 'https://backend.wassist.app/api/v1'
const AGENT_NAME = 'Forma · vertiqal'

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
  const forma = results.filter((a) => a.name.startsWith('Forma ·'))
  const current = forma.find((a) => a.tools.some((t) => t.apiSchema?.url === webhookUrl))
  if (current) return current

  await Promise.all(forma.map((a) => wassist(`/agents/${a.id}/`, { method: 'DELETE' })))
  const created = await wassist<Agent>('/agents/byoa/', { method: 'POST', json: { webhookUrl } })
  return wassist<Agent>(`/agents/${created.id}/`, {
    method: 'PATCH',
    json: {
      name: AGENT_NAME,
      description: 'Running and climbing shoe fitting from a video of how you move.',
      firstMessage:
        "You're linked to *Forma* from vertiqal. Head back to the screen and your fitting will land here in a few seconds.",
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

type Choice = NonNullable<Fitting['choice']>

const pickMessages = (conversationId: string, fitting: Fitting) =>
  fitting.picks.map((p, i): Parameters<typeof sendUnified> => [
    conversationId,
    `*${i === 0 ? 'Best fit' : `Option ${i + 1}`}: ${p.name}*\n${p.price} at ${p.retailer}\n\n_${p.why}_`,
    [{ type: 'url', text: `Open ${p.retailer}`.slice(0, 20), url: p.url }],
  ])

const choiceMessage = (conversationId: string, fitting: Fitting, choice: Choice): Parameters<typeof sendUnified> => {
  const why = fitting.picks.find((p) => p.url === choice.url)?.why
  return [
    conversationId,
    `*Your pick: ${choice.name}* in ${choice.size}\n${choice.price} at ${choice.retailer}\n${choice.stock}${why ? `\n\n_${why}_` : ''}`,
    [{ type: 'url', text: `Buy at ${choice.retailer}`.slice(0, 20), url: choice.url }],
    'Size checked live by vertiqal',
  ]
}

export async function sendFitting(conversationId: string, fitting: Fitting) {
  const { choice } = fitting
  const others = choice ? fitting.picks.filter((p) => p.url !== choice.url) : []
  const requirements = fitting.requirements.map((r) => `• ${r.attribute}: *${r.target}*`).join('\n')
  const sportLabel = fitting.sport === 'running' ? 'Running' : 'Climbing'
  const messages: Parameters<typeof sendUnified>[] = [
    [
      conversationId,
      `*Your vertiqal fitting · ${sportLabel}*\n${fitting.measurements}\n\n${fitting.summary}\n\nYou need a *${fitting.category}* shoe:\n${requirements}\n\n_Forma voice: ${fitting.voice}_`,
      fitting.passportUrl ? [{ type: 'url', text: 'Fit passport', url: fitting.passportUrl.slice(0, 2000) }] : undefined,
      `Measured from your ${fitting.sport} video`,
    ],
    ...(choice ? [choiceMessage(conversationId, fitting, choice)] : pickMessages(conversationId, fitting)),
    [
      conversationId,
      choice
        ? `${others.length ? `_Also on your shortlist: ${others.map((p) => `${p.name} (${p.price})`).join(', ')}_\n\n` : ''}I'll remember this fitting. Tell me how they feel once you've worn them in, and your next scan on vertiqal will take it into account.`
        : 'Ask me anything about these, or tell me what to change.',
      choice
        ? [
            { type: 'quick_reply', text: 'True to size?', quickReplyId: 'sizing' },
            { type: 'quick_reply', text: 'How to break in?', quickReplyId: 'break-in' },
            { type: 'quick_reply', text: 'Anything cheaper?', quickReplyId: 'cheaper' },
          ]
        : [
            { type: 'quick_reply', text: 'Anything cheaper?', quickReplyId: 'cheaper' },
            { type: 'quick_reply', text: 'Why the best fit?', quickReplyId: 'why-best' },
            fitting.sport === 'running'
              ? { type: 'quick_reply', text: 'Trail version?', quickReplyId: 'trail' }
              : { type: 'quick_reply', text: 'Comfier for gym?', quickReplyId: 'comfort' },
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

/** Only what the shopper typed, newest last, so their next in-app search can build on it. */
export async function shopperLines(phone: string, max = 4) {
  const transcript = await recentTranscript(phone, 30)
  return transcript
    .split('\n')
    .filter((line) => line.startsWith('SHOPPER: '))
    .map((line) => line.slice('SHOPPER: '.length).trim())
    .filter((text) => text && !text.startsWith('/connect'))
    .slice(-max)
    .map((text) => text.slice(0, 160))
}

export const chatUrlFor = (connectUrl: string) => connectUrl.split('?')[0]
