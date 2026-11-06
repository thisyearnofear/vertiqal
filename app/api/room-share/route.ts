import { z } from 'zod'

export const maxDuration = 15

const bodySchema = z.object({ url: z.string().url().max(800) })

/**
 * Post a fit passport into the Switch team room, as the room agent.
 * The room agent sees its own post, reads the passport, and opens the
 * approval flow — the app→room handoff in one click.
 */
export async function POST(request: Request) {
  const base = process.env.SWITCH_BASE_URL?.replace(/\/+$/, '')
  const agentId = process.env.SWITCH_AGENT_ID
  const apiKey = process.env.SWITCH_AGENT_API_KEY
  const roomId = process.env.SWITCH_ROOM_ID
  if (!base || !agentId || !apiKey || !roomId) {
    return Response.json({ error: 'No team room is configured on this deployment' }, { status: 503 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Send a passport URL' }, { status: 400 })

  // Only passport links may be relayed — this is not a general chat bridge.
  const url = new URL(parsed.data.url)
  const origin = new URL(request.url).origin
  if (url.origin !== origin || !url.pathname.startsWith('/api/passport/')) {
    return Response.json({ error: 'Only passports issued by this app can be shared to the room' }, { status: 400 })
  }

  const res = await fetch(`${base}/agents/${agentId}/message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      room_id: roomId,
      content: `Shared from the vertiqal fitting — a passport for the room: ${parsed.data.url}`,
    }),
  }).catch(() => null)

  if (!res?.ok) {
    return Response.json({ error: `The room could not be reached${res ? ` (${res.status})` : ''}` }, { status: 502 })
  }
  return Response.json({ ok: true })
}
