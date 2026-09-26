import { passportSchema, type IssuedPassport } from '@/lib/passport/schema'
import { issuePassport } from '@/lib/passport/token'

export async function POST(request: Request) {
  const parsed = passportSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid passport' }, { status: 400 })
  }
  const { token, id } = issuePassport(parsed.data)
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const origin = host ? `${host.startsWith('localhost') ? 'http' : 'https'}://${host}` : new URL(request.url).origin
  return Response.json({ id, url: `${origin}/api/passport/${token}` } satisfies IssuedPassport)
}
