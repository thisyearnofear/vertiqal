import { z } from 'zod'
import { KEYPOINT_NAMES, type KeypointName, type Pose } from '@/lib/pose/types'

export const maxDuration = 60

const ENDPOINT = 'https://api.vlm.run/v1/openai/chat/completions'
const MODEL = 'vlmrun-orion-1:auto'
const MAX_IMAGE_CHARS = 600_000

const requestSchema = z.object({
  image: z
    .string()
    .startsWith('data:image/jpeg;base64,')
    .max(MAX_IMAGE_CHARS),
})

const responseSchema = z.object({
  keypoints: z.array(
    z.object({
      label: z.string(),
      xy: z.array(z.number()).min(2),
      confidence: z.number().optional(),
    }),
  ),
})

const KEYPOINT_SCHEMA = {
  type: 'object',
  properties: {
    keypoints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', enum: [...KEYPOINT_NAMES] },
          xy: { type: 'array', items: { type: 'number' }, description: 'Normalized [x, y], 0..1 of image width and height' },
          confidence: { type: 'number' },
        },
        required: ['label', 'xy'],
      },
    },
  },
  required: ['keypoints'],
}

const PROMPT = `Point to the body keypoints of the single main person in this image (an athlete filmed side-on).
Use exactly these labels: ${KEYPOINT_NAMES.join(', ')}.
"left_foot" and "right_foot" are the toe tips. Left and right are the person's own left and right.
Omit any keypoint that is not visible. Coordinates are normalized to the image: x by width, y by height, both 0..1.`

const ALIASES: Record<string, KeypointName> = {
  left_toe: 'left_foot',
  right_toe: 'right_foot',
  left_foot_index: 'left_foot',
  right_foot_index: 'right_foot',
}

function toKeypointName(label: string): KeypointName | null {
  const key = label.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if ((KEYPOINT_NAMES as readonly string[]).includes(key)) return key as KeypointName
  return ALIASES[key] ?? null
}

const apiKey = () => process.env.VLMRUN_API_KEY

export function GET() {
  return Response.json({ configured: Boolean(apiKey()) })
}

export async function POST(request: Request) {
  const key = apiKey()
  if (!key) return Response.json({ error: 'VLMRUN_API_KEY is not set' }, { status: 503 })

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Expected a JPEG data URL under 600 KB' }, { status: 400 })

  const upstream = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: parsed.data.image, detail: 'auto' } },
          ],
        },
      ],
      response_format: { type: 'json_schema', schema: KEYPOINT_SCHEMA },
    }),
    signal: AbortSignal.timeout(55_000),
  }).catch((error: Error) => error)

  if (upstream instanceof Error) return Response.json({ error: upstream.message }, { status: 504 })
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '')
    return Response.json({ error: `VLM Run ${upstream.status}: ${detail.slice(0, 200)}` }, { status: 502 })
  }

  const completion = (await upstream.json()) as { choices?: { message?: { content?: string } }[] }
  const content = completion.choices?.[0]?.message?.content ?? ''
  const json = z
    .string()
    .transform((text, ctx) => {
      try {
        return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))
      } catch {
        ctx.addIssue({ code: 'custom', message: 'not JSON' })
        return z.NEVER
      }
    })
    .pipe(responseSchema)
    .safeParse(content)
  if (!json.success) return Response.json({ error: 'VLM Run returned no usable keypoints' }, { status: 502 })

  const pose: Pose = {}
  for (const { label, xy, confidence } of json.data.keypoints) {
    const name = toKeypointName(label)
    const [x, y] = xy
    if (!name || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) continue
    pose[name] = { x, y, score: confidence ?? 0.9 }
  }
  return Response.json({ pose })
}
