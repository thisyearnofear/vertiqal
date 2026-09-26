import { z } from 'zod'
import { verifyStock } from '@/lib/agent/solari'

export const maxDuration = 60

const bodySchema = z.object({
  productName: z.string().trim().min(2).max(160),
  productUrl: z
    .string()
    .url()
    .max(600)
    .refine((url) => url.startsWith('https://'), 'Only https product pages can be checked'),
  size: z.string().trim().min(1).max(24),
})

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  try {
    return Response.json(await verifyStock(parsed.data))
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Stock check failed' }, { status: 502 })
  }
}
