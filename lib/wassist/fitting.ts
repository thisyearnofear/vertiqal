import { z } from 'zod'

export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ''))
  .pipe(z.string().min(8, 'Enter your number with country code').max(15, 'That number is too long'))

export const fittingSchema = z.object({
  sport: z.enum(['running', 'climbing']),
  voice: z.string().max(20),
  passportUrl: z.string().url().max(6000).optional(),
  measurements: z.string().max(200),
  summary: z.string().max(400),
  category: z.string().max(40),
  requirements: z
    .array(z.object({ attribute: z.string().max(80), target: z.string().max(120) }))
    .max(4),
  picks: z
    .array(
      z.object({
        name: z.string().max(120),
        retailer: z.string().max(80),
        url: z.string().url().max(500),
        price: z.string().max(40),
        why: z.string().max(300),
      }),
    )
    .min(1)
    .max(3),
})

export const handoffSchema = z.object({ phone: phoneSchema, fitting: fittingSchema })

export type Fitting = z.infer<typeof fittingSchema>

export type HandoffResult =
  | { status: 'awaiting-link'; connectUrl: string }
  | { status: 'sent'; chatUrl: string; messages: number }
