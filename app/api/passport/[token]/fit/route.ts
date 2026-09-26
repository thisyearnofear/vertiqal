import { checkFit } from '@/lib/passport/fit'
import { fitCheckSchema } from '@/lib/passport/schema'
import { readPassport } from '@/lib/passport/token'

export const maxDuration = 30

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const passport = readPassport(token)
  if (!passport) return Response.json({ error: 'Invalid or tampered passport' }, { status: 404, headers: CORS })

  const parsed = fitCheckSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Send { "product": "<name>" }' }, { status: 400, headers: CORS })

  try {
    return Response.json(await checkFit(passport, parsed.data.product), { headers: CORS })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502, headers: CORS })
  }
}
