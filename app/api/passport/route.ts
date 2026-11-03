import { passportSchema, type IssuedPassport } from '@/lib/passport/schema'
import { issuePassport } from '@/lib/passport/token'
import { MissingSecretError } from '@/lib/secrets'

export async function POST(request: Request) {
  const parsed = passportSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid passport' }, { status: 400 })
  }
  let issued: { token: string; id: string }
  try {
    issued = issuePassport(parsed.data)
  } catch (error) {
    if (error instanceof MissingSecretError) {
      return Response.json({ error: 'Fit passports are not configured on this deployment' }, { status: 503 })
    }
    throw error
  }
  const { token, id } = issued
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const origin = host ? `${host.startsWith('localhost') ? 'http' : 'https'}://${host}` : new URL(request.url).origin
  return Response.json({ id, url: `${origin}/api/passport/${token}` } satisfies IssuedPassport)
}
