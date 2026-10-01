import type { FittingNotesState } from '../agent/fitting-notes'
import type { Sport } from '../metrics/readout'
import { FALLBACK_HEIGHT_CM, HEIGHT_MAX_CM, HEIGHT_MIN_CM, parseBudgetPounds, parseHeightCm, type PrefDraft } from './prefs.ts'

export type BriefQuestion = 'height' | 'goal' | 'surface' | 'size' | 'budget' | 'width' | 'niggles' | 'describe'

/** Asked in this order; height first because it calibrates every distance. */
export const REQUIRED_QUESTIONS = ['height', 'goal', 'surface', 'size', 'budget'] as const satisfies readonly BriefQuestion[]

export const UK_SIZES = Array.from({ length: 21 }, (_, i) => `UK ${3 + i / 2}`)
export const BUDGET_PRESETS = [80, 120, 160, 200, 250] as const
export const DEFAULT_SIZE = 'UK 8'

export function isAnswered(question: BriefQuestion, draft: PrefDraft, notes: FittingNotesState): boolean {
  switch (question) {
    case 'height':
      return parseHeightCm(draft.heightCm) !== null
    case 'goal':
      return Boolean(draft.goal)
    case 'surface':
      return Boolean(draft.surface)
    case 'size':
      return Boolean(draft.size.trim())
    case 'budget':
      return parseBudgetPounds(draft.budgetPounds) !== null
    case 'width':
      return Boolean(notes.width)
    case 'niggles':
      return Boolean(notes.niggles.trim())
    case 'describe':
      return false
  }
}

export function answeredCount(draft: PrefDraft, notes: FittingNotesState): number {
  return REQUIRED_QUESTIONS.filter((q) => isAnswered(q, draft, notes)).length
}

/** The next unanswered, unskipped required question. Height is left out while the stage screen is asking for it. */
export function nextQuestion(state: {
  draft: PrefDraft
  notes: FittingNotesState
  skipped: ReadonlySet<BriefQuestion>
  heightOnScreen: boolean
}): BriefQuestion | null {
  return (
    REQUIRED_QUESTIONS.find(
      (q) => !(q === 'height' && state.heightOnScreen) && !state.skipped.has(q) && !isAnswered(q, state.draft, state.notes),
    ) ?? null
  )
}

export function previousQuestion(current: BriefQuestion): BriefQuestion | null {
  const index = REQUIRED_QUESTIONS.indexOf(current as (typeof REQUIRED_QUESTIONS)[number])
  return index > 0 ? REQUIRED_QUESTIONS[index - 1] : null
}

export function questionPrompt(question: BriefQuestion, sport: Sport): string {
  const verb = sport === 'running' ? 'run' : 'climb'
  switch (question) {
    case 'height':
      return 'How tall are you? It turns pixels into centimetres.'
    case 'goal':
      return 'What are these shoes for?'
    case 'surface':
      return `Where do you mostly ${verb}?`
    case 'size':
      return 'What size are your everyday shoes?'
    case 'budget':
      return 'Top budget for this pair?'
    case 'width':
      return 'How wide are your feet?'
    case 'niggles':
      return 'Anything that hurts or rubs?'
    case 'describe':
      return sport === 'running'
        ? 'Tell me in a sentence — what do you run in now, what size, what budget?'
        : 'Tell me in a sentence — what do you climb in now, what size, what budget?'
  }
}

export function clampHeight(cm: number): number {
  return Math.min(HEIGHT_MAX_CM, Math.max(HEIGHT_MIN_CM, Math.round(cm)))
}

/** Steps from the typed height, or from a typical adult height when nothing valid is typed yet. */
export function stepHeight(raw: string, delta: number): number {
  return clampHeight((parseHeightCm(raw) ?? FALLBACK_HEIGHT_CM) + delta)
}

export function feetInches(cm: number): string {
  const totalInches = Math.round(cm / 2.54)
  return `${Math.floor(totalInches / 12)}′${totalInches % 12}″`
}
