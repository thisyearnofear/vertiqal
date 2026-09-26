import { z } from 'zod'
import { VOICES } from '@/lib/persona'

export const passportSchema = z.object({
  v: z.literal(1),
  sport: z.enum(['running', 'climbing']),
  heightCm: z.number().int().min(100).max(250),
  size: z.string().max(20),
  voice: z.enum(VOICES),
  metrics: z
    .array(z.object({ label: z.string().max(40), value: z.number().nullable(), unit: z.string().max(10) }))
    .max(6),
  signals: z.array(z.string().max(200)).max(6),
  profile: z.object({
    summary: z.string().max(400),
    category: z.string().max(40),
    requirements: z.array(z.object({ attribute: z.string().max(80), target: z.string().max(120) })).max(4),
  }),
  picks: z
    .array(z.object({ name: z.string().max(120), retailer: z.string().max(80), url: z.string().url().max(500), price: z.string().max(40) }))
    .max(3),
})

export type Passport = z.infer<typeof passportSchema>

export interface IssuedPassport {
  id: string
  url: string
}

export const fitCheckSchema = z.object({ product: z.string().trim().min(2).max(200) })

export const fitVerdictSchema = z.object({
  verdict: z.enum(['great-fit', 'workable', 'poor-fit']),
  score: z.number().int().min(0).max(100).describe('How well the product suits this body, 0–100'),
  reasons: z.array(z.string().max(200)).min(1).max(3).describe('Each reason must cite a measurement or requirement'),
})

export type FitVerdict = z.infer<typeof fitVerdictSchema>
