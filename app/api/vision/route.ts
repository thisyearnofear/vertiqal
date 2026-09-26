import { Output, generateText } from 'ai'
import { z } from 'zod'
import { visionFindingSchema } from '@/lib/agent/fitting-notes'

export const maxDuration = 60

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
const MAX_IMAGE_CHARS = 900_000

const bodySchema = z.object({
  kind: z.enum(['soles', 'frames']),
  sport: z.enum(['running', 'climbing']),
  images: z.array(z.string().max(MAX_IMAGE_CHARS).regex(DATA_URL)).min(1).max(3),
  measurements: z.string().max(600).optional(),
})

const SYSTEM = {
  soles: (sport: string) =>
    `You are Forma, a ${sport} shoe fitter. The photo shows the sole or rubber of the shopper's current, worn ${sport} shoes. Describe only wear you can actually see: where rubber is thinnest, asymmetry, delamination, rand or toe wear. Relate it to how they move and what their next shoe should do differently. If the image is not a worn shoe sole, say so in one observation, set wearPattern to "unclear" and confidence to "low". No medical diagnoses.`,
  frames: (sport: string) =>
    `You are Forma, a ${sport} movement analyst. These are stills from the shopper's own video, taken at the moment of a ${sport === 'running' ? 'foot strike' : 'foot placement'}, with the pose model's skeleton drawn on top. Point out 2–4 things a pose model's numbers would miss: foot orientation, ankle roll, how the shoe meets the ground or hold, posture. Refer to what is visible. Set wearPattern to "unclear". No medical diagnoses.`,
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Send 1–3 JPEG, PNG or WebP images as data URLs' }, { status: 400 })
  const { kind, sport, images, measurements } = parsed.data

  try {
    const { output } = await generateText({
      model: 'spacexai/grok-4.7',
      system: SYSTEM[kind](sport),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: measurements ? `Pose-model measurements for context:\n${measurements}` : 'Analyse the image.',
            },
            ...images.map((image) => {
              const [, mediaType, data] = image.match(DATA_URL)!
              return { type: 'file' as const, mediaType, data }
            }),
          ],
        },
      ],
      output: Output.object({ schema: visionFindingSchema }),
      abortSignal: AbortSignal.timeout(50_000),
    })
    return Response.json(output)
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Vision analysis failed' }, { status: 502 })
  }
}
