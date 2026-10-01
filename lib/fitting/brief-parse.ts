import { z } from 'zod'
import { FOOT_WIDTHS, INTAKE_OPTIONS, type FittingNotesState } from '../agent/fitting-notes.ts'
import type { Sport } from '../metrics/readout.ts'
import type { BriefQuestion } from './brief-flow.ts'
import type { PrefDraft } from './prefs.ts'

const SIZE_PATTERN = /^(UK|EU|US) \d{1,2}(\.5)?$/

/** What Grok may extract from one free-text sentence; every field is optional and null means "not stated". */
export function briefParseSchema(sport: Sport) {
  return z.object({
    size: z
      .string()
      .nullable()
      .describe('Street shoe size as stated, normalised to UK like "UK 9" or "UK 9.5". Convert EU or US only if the shopper names the system. null if not stated.'),
    budgetPounds: z.number().int().positive().max(2000).nullable().describe('Maximum spend in pounds if stated. null if not stated.'),
    goal: z.enum(INTAKE_OPTIONS[sport].goals).nullable().describe('Closest listed goal only if the shopper clearly implies it. null otherwise.'),
    surface: z.enum(INTAKE_OPTIONS[sport].surfaces).nullable().describe('Closest listed surface only if the shopper clearly implies it. null otherwise.'),
    width: z.enum(FOOT_WIDTHS).nullable().describe('Only if they say their feet are narrow or wide (or normal width). null otherwise.'),
    currentShoe: z.string().max(80).nullable().describe('Shoe model they currently use, as written. null if none.'),
    fitNote: z.string().max(120).nullable().describe('What they say about how their current shoe fits or feels, in their words. null if nothing.'),
  })
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
