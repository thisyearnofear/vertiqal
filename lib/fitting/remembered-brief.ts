import { z } from 'zod'
import type { FittingNotesState } from '../agent/fitting-notes.ts'
import type { Sport } from '../metrics/readout.ts'
import type { PrefDraft } from './prefs.ts'

export const BRIEF_COOKIE = 'vertiqal-brief'

const sportBriefSchema = z.object({
  goal: z.string().max(60),
  surface: z.string().max(60),
})

export const rememberedBriefSchema = z.object({
  size: z.string().max(20),
  budgetPounds: z.string().max(8),
  heightCm: z.string().max(4),
  width: z.enum(['', 'narrow', 'standard', 'wide']),
  bySport: z.object({
    running: sportBriefSchema.optional(),
    climbing: sportBriefSchema.optional(),
  }),
})

export type RememberedBrief = z.infer<typeof rememberedBriefSchema>

export function parseRememberedBrief(raw: string | undefined): RememberedBrief | null {
  if (!raw) return null
  try {
    const parsed = rememberedBriefSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Confirmed brief answers worth keeping for next time. Niggles (health free
 * text) and anything derived from the clip are deliberately never stored.
 */
export function rememberBrief(
  previous: RememberedBrief | null,
  draft: PrefDraft,
  notes: FittingNotesState,
  sport: Sport,
): RememberedBrief {
  return {
    size: draft.size.trim().slice(0, 20),
    budgetPounds: draft.budgetPounds.trim().slice(0, 8),
    heightCm: draft.heightCm.trim().slice(0, 4),
    width: notes.width,
    bySport: {
      running: sport === 'running' ? { goal: draft.goal, surface: draft.surface } : previous?.bySport.running,
      climbing: sport === 'climbing' ? { goal: draft.goal, surface: draft.surface } : previous?.bySport.climbing,
    },
  }
}

export function draftFromRemembered(brief: RememberedBrief | null, sport: Sport, fallbackSize: string | null): PrefDraft {
  const bySport = brief?.bySport[sport]
  return {
    size: brief?.size || fallbackSize || '',
    budgetPounds: brief?.budgetPounds ?? '',
    heightCm: brief?.heightCm ?? '',
    goal: bySport?.goal ?? '',
    surface: bySport?.surface ?? '',
  }
}
