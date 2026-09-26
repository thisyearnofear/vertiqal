import { Output, generateText } from 'ai'
import { fitCheckSchema, fitVerdictSchema } from '@/lib/passport/schema'
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
    const { output } = await generateText({
      model: 'spacexai/grok-4.7',
      system:
        'You are Forma, the vertiqal fitting agent. Judge whether a named shoe suits the passport owner using only their measured passport and your knowledge of that product. Be specific and honest; if you do not know the product, say so in a reason and score conservatively. No medical claims.',
      prompt: `Fit passport:\n${JSON.stringify(passport)}\n\nProduct to judge: ${parsed.data.product}`,
      output: Output.object({ schema: fitVerdictSchema }),
    })
    return Response.json({ product: parsed.data.product, ...output }, { headers: CORS })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502, headers: CORS })
  }
}
