import { cookies } from 'next/headers'
import { z } from 'zod'
import { subscriptionActive } from '@/lib/paypal/subscription'
import { BRIEF_COOKIE, rememberedBriefSchema } from '@/lib/fitting/remembered-brief'
import { guardRequest, guardResponse } from '@/lib/rate-limit'

const bodySchema = z.object({ subscriptionId: z.string().min(3).max(64) })

const COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 365,
  path: '/',
  sameSite: 'none',
  secure: true,
  httpOnly: true,
} as const

/** After PayPal approval: verify ACTIVE server-side before the tier flips. */
export async function POST(request: Request) {
  const guard = await guardRequest(request, 'outcome')
  if (!guard.allowed) return guardResponse(guard)
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Bad request' }, { status: 400 })
  if (!(await subscriptionActive(parsed.data.subscriptionId))) {
    return Response.json({ active: false }, { status: 202 })
  }
  const store = await cookies()
  const brief = rememberedBriefSchema.safeParse(
    (() => {
      try {
        return JSON.parse(store.get(BRIEF_COOKIE)?.value ?? '')
      } catch {
        return null
      }
    })(),
  )
  const base = brief.success ? brief.data : { size: '', budgetPounds: '', heightCm: '', width: '', bySport: {} }
  store.set(BRIEF_COOKIE, JSON.stringify({ ...base, tier: 'pro' }), COOKIE_OPTIONS)
  return Response.json({ active: true, tier: 'pro' })
}
