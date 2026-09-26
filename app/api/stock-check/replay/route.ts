import { getReplayUrl } from '@/lib/agent/solari'

const SESSION_ID = /^[A-Za-z0-9_.-]{16,400}$/

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get('session') ?? ''
  if (!SESSION_ID.test(sessionId)) return Response.json({ error: 'Invalid session id' }, { status: 400 })

  try {
    const url = await getReplayUrl(sessionId)
    return Response.json({ url }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Replay lookup failed' }, { status: 502 })
  }
}
