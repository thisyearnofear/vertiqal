import type { FittingNotesState } from '../agent/fitting-notes'
import { contextLines } from '../agent/fitting-notes.ts'
import type { ShopperPrefs } from '../agent/brief'
import type { Depth } from '../agent/depth'
import type { Sport } from '../metrics/readout'
import type { Voice } from '../persona'

export const HEIGHT_MIN_CM = 120
export const HEIGHT_MAX_CM = 220
export const FALLBACK_HEIGHT_CM = 175

export interface PrefDraft {
  size: string
  budgetPounds: string
  heightCm: string
  goal: string
  surface: string
}

export type PrefField = 'size' | 'budget' | 'height' | 'goal' | 'surface'
export type PrefErrors = Partial<Record<PrefField, string>>

export function parseHeightCm(raw: string): number | null {
  const value = Number(raw.trim())
  if (!raw.trim() || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return rounded >= HEIGHT_MIN_CM && rounded <= HEIGHT_MAX_CM ? rounded : null
}

export function parseBudgetPounds(raw: string): number | null {
  const cleaned = raw.trim().replace(/^[£$]/, '')
  const value = Number(cleaned)
  if (!cleaned || !Number.isFinite(value) || value <= 0) return null
  return Math.round(value)
}

export function validatePrefs(draft: PrefDraft): PrefErrors {
  const errors: PrefErrors = {}
  if (!draft.size.trim()) errors.size = 'Enter your street shoe size'
  if (parseBudgetPounds(draft.budgetPounds) === null) errors.budget = 'Enter a budget in pounds'
  if (parseHeightCm(draft.heightCm) === null) {
    errors.height = `Enter your height in cm (${HEIGHT_MIN_CM}–${HEIGHT_MAX_CM})`
  }
  if (!draft.goal) errors.goal = 'Pick a goal'
  if (!draft.surface) errors.surface = 'Pick a surface'
  return errors
}

export function prefsValid(draft: PrefDraft): boolean {
  return Object.keys(validatePrefs(draft)).length === 0
}

export function analysisHeight(draft: PrefDraft): { heightCm: number; provisional: boolean } {
  const entered = parseHeightCm(draft.heightCm)
  return entered === null
    ? { heightCm: FALLBACK_HEIGHT_CM, provisional: true }
    : { heightCm: entered, provisional: false }
}

export function heightCalibrated(enteredCm: number | null, calibratedCm: number): boolean {
  return enteredCm !== null && enteredCm === calibratedCm
}

export function mergeDraftNotes(draft: PrefDraft, notes: FittingNotesState): FittingNotesState {
  return { ...notes, goal: draft.goal, surface: draft.surface }
}

export function buildConfirmedPrefs(options: {
  draft: PrefDraft
  notes: FittingNotesState
  sport: Sport
  voice: Voice
  depth: Depth
  memberLines: string[]
}): ShopperPrefs | null {
  const { draft, notes, sport, voice, depth, memberLines } = options
  const pounds = parseBudgetPounds(draft.budgetPounds)
  const heightCm = parseHeightCm(draft.heightCm)
  const size = draft.size.trim()
  if (pounds === null || heightCm === null || !size || !prefsValid(draft)) return null
  return {
    size,
    budget: `£${pounds}`,
    heightCm,
    voice,
    depth,
    notes: [...contextLines(mergeDraftNotes(draft, notes), sport), ...memberLines],
  }
}
