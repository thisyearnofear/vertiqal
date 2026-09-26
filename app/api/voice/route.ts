import { generateSpeech } from 'ai'
import { z } from 'zod'

const bodySchema = z.object({ text: z.string().trim().min(1).max(240) })

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Send { text } up to 240 characters' }, { status: 400 })

  try {
    const { audio } = await generateSpeech({
      model: 'spacexai/grok-tts',
      text: parsed.data.text,
      abortSignal: AbortSignal.timeout(15_000),
    })
    return new Response(new Uint8Array(audio.uint8Array), {
      headers: { 'Content-Type': audio.mediaType || 'audio/mpeg', 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Speech failed' }, { status: 502 })
  }
}
