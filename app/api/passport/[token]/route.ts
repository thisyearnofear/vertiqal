import { passportId, readPassport } from '@/lib/passport/token'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/** Machine-readable fit passport, meant for retailer bots and shopping agents. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const passport = readPassport(token)
  if (!passport) return Response.json({ error: 'Invalid or tampered passport' }, { status: 404, headers: CORS })

  const self = new URL(request.url)
  return Response.json(
    {
      id: passportId(token),
      issuer: 'vertiqal',
      description: `Body-measured ${passport.sport} shoe fitting, derived from pose tracking of the owner's own video.`,
      passport,
      actions: {
        fitCheck: {
          method: 'POST',
          url: `${self.origin}${self.pathname}/fit`,
          body: { product: 'Full product name, e.g. "La Sportiva Solution Comp"' },
          returns: 'verdict (great-fit | workable | poor-fit), score 0–100, reasons citing measurements',
        },
      },
    },
    { headers: { ...CORS, 'Cache-Control': 'public, max-age=3600' } },
  )
}
