import { z } from 'zod'
import { FOOT_WIDTHS, INTAKE_OPTIONS, type FittingNotesState } from '../agent/fitting-notes.ts'
import type { Sport } from '@/lib/metrics/readout.ts'
import type { BriefQuestion } from './brief-flow.ts'
import type { PrefDraft } from './prefs.ts'

const SIZE_PATTERN = /^(UK|EU|US) \d{1,2}(\.5)?$/

/** Listed option, or null. Unknown strings fail so a wrong sport's option is not stored. */
function listedOrNull<T extends string>(valid: readonly T[]) {
  const known = new Map(valid.map((option) => [option.toLowerCase(), option]))
  return z
    .union([z.string(), z.null()])
    .transform((value, ctx): T | null => {
      if (value === null || value.trim() === '') return null
      const match = known.get(value.toLowerCase().trim())
      if (match) return match
      ctx.addIssue({ code: 'custom', message: `Expected one of: ${valid.join(', ')}` })
      return z.NEVER
    })
}

/** What Grok may extract from one free-text sentence; every field is optional and null means "not stated". */
const money = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value !== 'string') return null
  const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  if (!match) return null
  const amount = Number(match[0])
  if (!Number.isFinite(amount) || amount <= 0 || amount > 2000) return null
  // Shoppers often say dollars; the budget field is pounds.
  return /\$|dollar|usd/i.test(value) ? Math.round(amount * 0.79) : Math.round(amount)
}

/** Accepts the canonical brief and the shorter keys small models tend to invent. */
function normaliseBrief(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const raw = value as Record<string, unknown>
  const pick = (...keys: string[]) => keys.map((key) => raw[key]).find((item) => item !== undefined && item !== '')
  return {
    size: pick('size') ?? null,
    budgetPounds: money(pick('budgetPounds', 'budget')),
    goal: pick('goal') ?? null,
    surface: pick('surface') ?? null,
    width: pick('width', 'foot_width', 'footWidth') ?? null,
    currentShoe: pick('currentShoe', 'current_shoe') ?? null,
    fitNote: pick('fitNote', 'fit', 'fit_note') ?? null,
  }
}

export function briefParseSchema(sport: Sport) {
  const goals = INTAKE_OPTIONS[sport].goals
  const surfaces = INTAKE_OPTIONS[sport].surfaces
  return z.preprocess(normaliseBrief, z.object({
    size: z
      .string()
      .nullable()
      .describe('Street shoe size as stated, normalised to UK like "UK 9" or "UK 9.5". Convert EU or US only if the shopper names the system. null if not stated.'),
    budgetPounds: z
      .number()
      .int()
      .positive()
      .max(2000)
      .nullable()
      .describe('Maximum spend in pounds if stated. null if not stated.'),
    goal: listedOrNull(goals).describe('Closest listed goal only if the shopper clearly implies it. null otherwise.'),
    surface: listedOrNull(surfaces).describe('Closest listed surface only if the shopper clearly implies it. null otherwise.'),
    width: listedOrNull(FOOT_WIDTHS).describe('Only if they say their feet are narrow or wide (or normal width). null otherwise.'),
    currentShoe: z.string().max(80).nullable().describe('Shoe model they currently use, as written. null if none.'),
    fitNote: z.string().max(120).nullable().describe('What they say about how their current shoe fits or feels, in their words. null if nothing.'),
  }))
}

export type ParsedBrief = z.infer<ReturnType<typeof briefParseSchema>>

/** Merges what the shopper wrote into the draft and notes; nulls and bad sizes change nothing, height is never touched. */
export function applyParsedBrief(
  draft: PrefDraft,
  notes: FittingNotesState,
  parsed: ParsedBrief,
): { draft: PrefDraft; notes: FittingNotesState; filled: BriefQuestion[] } {
  const nextDraft = { ...draft }
  const nextNotes = { ...notes }
  const filled: BriefQuestion[] = []

  if (parsed.size && SIZE_PATTERN.test(parsed.size)) {
    nextDraft.size = parsed.size
    filled.push('size')
  }
  if (parsed.budgetPounds !== null) {
    nextDraft.budgetPounds = String(parsed.budgetPounds)
    filled.push('budget')
  }
  if (parsed.goal) {
    nextDraft.goal = parsed.goal
    nextNotes.goal = parsed.goal
    filled.push('goal')
  }
  if (parsed.surface) {
    nextDraft.surface = parsed.surface
    nextNotes.surface = parsed.surface
    filled.push('surface')
  }
  if (parsed.width) {
    nextNotes.width = parsed.width
    filled.push('width')
  }
  const current = [parsed.currentShoe, parsed.fitNote].filter(Boolean).join(' — ')
  if (current) nextNotes.current = current

  return { draft: nextDraft, notes: nextNotes, filled }
}
