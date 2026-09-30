import type { FittingNotesState } from '../agent/fitting-notes'

export type FittingStage = 'invite' | 'capture' | 'confirm' | 'research' | 'choose' | 'decision'

export function stageOf(state: {
  example: boolean
  capturing: boolean
  measuredReady: boolean
  sent: boolean
  hasOutputs: boolean
  hasChoice: boolean
}): FittingStage {
  if (state.example) return 'invite'
  if (state.hasChoice) return 'decision'
  if (state.hasOutputs) return 'choose'
  if (state.sent) return 'research'
  if (state.measuredReady) return 'confirm'
  if (state.capturing) return 'capture'
  return 'invite'
}

export type ResetReason = 'new-clip' | 'record' | 'sport' | 'example' | 'start-fresh'

export function notesAfterReset(reason: ResetReason, notes: FittingNotesState): FittingNotesState {
  const next = { ...notes, sole: null, frames: null }
  if (reason === 'sport' || reason === 'start-fresh') return { ...next, goal: '', surface: '' }
  return next
}

export function clearsBaseline(reason: ResetReason): boolean {
  return reason === 'sport' || reason === 'start-fresh'
}

export function canFindShoes(state: {
  example: boolean
  liveActive: boolean
  busy: boolean
  measuredReady: boolean
  prefsValid: boolean
  heightCalibrated: boolean
}): boolean {
  return (
    !state.example &&
    !state.liveActive &&
    !state.busy &&
    state.measuredReady &&
    state.prefsValid &&
    state.heightCalibrated
  )
}

export type RemeasurePlan = 'none' | 'reanalyse' | 'recapture'

export function remeasurePlan(state: {
  enteredCm: number | null
  calibratedCm: number
  providerChanged: boolean
  liveDone: boolean
}): RemeasurePlan {
  const heightChanged = state.enteredCm !== null && state.enteredCm !== state.calibratedCm
  if (!state.providerChanged && !heightChanged) return 'none'
  return state.liveDone ? 'recapture' : 'reanalyse'
}

export function measurementInvalidated(state: {
  enteredCm: number | null
  calibratedCm: number
  providerMismatch: boolean
}): boolean {
  if (state.providerMismatch) return true
  return state.enteredCm !== null && state.enteredCm !== state.calibratedCm
}
