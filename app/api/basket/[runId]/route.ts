import { getBasketRun } from '@/lib/agent/browser-use'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  if (!UUID.test(runId)) return Response.json({ error: 'Invalid run id' }, { status: 400 })

  try {
    return Response.json(await getBasketRun(runId))
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 })
  }
}
