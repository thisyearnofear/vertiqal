import { z } from 'zod'

/**
 * Awin click references: lowercase letters and digits only, 50 characters at most (longer values are
 * truncated in Awin's Click References report). Random and opaque; it carries no personal data.
 */
export const CLICK_REF_PATTERN = /^vq[a-z0-9]{12,30}$/

export const clickRefSchema = z.string().regex(CLICK_REF_PATTERN)

/** What the shopper reports after wearing (or not buying) the shoes. */
export const OUTCOMES = [
  'fits-well',
  'too-tight',
  'too-loose',
  'wrong-type',
  'returned',
  'not-bought',
] as const

export type Outcome = (typeof OUTCOMES)[number]

export const OUTCOME_LABEL: Record<Outcome, string> = {
  'fits-well': 'They fit well',
  'too-tight': 'Too tight or too small',
  'too-loose': 'Too loose or too big',
  'wrong-type': 'Right size, wrong kind of shoe',
  returned: 'I sent them back',
  'not-bought': "I didn't buy them",
}

/** Shown only for 'not-bought', so Forma learns what stopped the sale. */
export const NOT_BOUGHT_REASONS = ['Too expensive', 'Found them cheaper elsewhere', 'Not sure of the size', 'Chose a different shoe', 'Just browsing'] as const

/** The shoe and size a click-out was for. Signed into the follow-up link, so no database is needed to render it. */
export const outcomeContextSchema = z.object({
  ref: clickRefSchema,
  sport: z.enum(['running', 'climbing']),
  name: z.string().max(120),
  retailer: z.string().max(80),
  size: z.string().max(20),
  /** Epoch ms when the link was issued, just before the shopper could click through. */
  at: z.number().int().positive(),
})

export type OutcomeContext = z.infer<typeof outcomeContextSchema>

export const outcomeReportSchema = z.object({
  token: z.string().min(10).max(2000),
  outcome: z.enum(OUTCOMES),
  reason: z.enum(NOT_BOUGHT_REASONS).optional(),
})

export const outcomeLinkRequestSchema = outcomeContextSchema.omit({ at: true })

export type OutcomeReport = z.infer<typeof outcomeReportSchema>
