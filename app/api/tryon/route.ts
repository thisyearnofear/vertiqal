import { generateImage } from 'ai'
import { z } from 'zod'
import { logCost } from '@/lib/cost-log'

export const maxDuration = 60

const TRYON_MODEL = 'bfl/flux-kontext-pro'
const MAX_IMAGE_CHARS = 4_000_000

const requestSchema = z.object({
  image: z
    .string()
    .max(MAX_IMAGE_CHARS)
    .regex(/^data:image\/(jpeg|png|webp);base64,/),
  shoe: z.string().trim().min(2).max(120),
  sport: z.enum(['running', 'climbing']),
})

const promptFor = (shoe: string, sport: 'running' | 'climbing') =>
  [
    `Replace only the footwear on this person with the ${shoe} ${sport === 'running' ? 'running shoes' : 'climbing shoes'}, using that model's real colourway and silhouette.`,
    'Keep the person, their face, body shape, proportions, pose, clothing, background, lighting and camera angle exactly as they are.',
    'Do not slim, smooth, reshape or beautify the person. Photorealistic, same framing.',
  ].join(' ')

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Send one JPEG, PNG or WebP frame and a shoe name' }, { status: 400 })

  const { image, shoe, sport } = parsed.data
  const started = Date.now()
  try {
    const { image: result } = await generateImage({
      model: TRYON_MODEL,
      prompt: { images: [image.slice(image.indexOf(',') + 1)], text: promptFor(shoe, sport) },
    })
    logCost('paid_call', { route: 'tryon', ok: true, ms: Date.now() - started, sport })
    return Response.json({ image: `data:${result.mediaType};base64,${result.base64}`, model: TRYON_MODEL })
  } catch (error) {
    logCost('paid_call', { route: 'tryon', ok: false, ms: Date.now() - started, sport })
    const message = error instanceof Error ? error.message : 'Image generation failed'
    return Response.json({ error: message.slice(0, 200) }, { status: 502 })
  }
}
