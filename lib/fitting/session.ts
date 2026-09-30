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

export type CapturePhase = 'off' | 'starting' | 'countdown' | 'recording' | 'done' | 'error'
export type NextAction = 'example' | 'upload-example' | 'upload' | 'brief' | 'results' | 'recapture'

export interface NextStep {
  eyebrow: string
  title: string
  detail: string
  action: { kind: NextAction; label: string } | null
}

export function nextStepFor(state: {
  stage: FittingStage
  example: boolean
  capture: CapturePhase
  events: number
  target: number
  eventLabel: string
  missingPrefs: number
  needsRecapture: boolean
}): NextStep {
  if (state.example) {
    return {
      eyebrow: 'Next · Example',
      title: 'Watch the fitting loop',
      detail: 'This walkthrough is synthetic. Upload or film your own clip when you want real measurements.',
      action: { kind: 'upload-example', label: 'Upload my clip' },
    }
  }

  if (state.needsRecapture) {
    return {
      eyebrow: 'Next · Recapture',
      title: 'Film again to recalibrate',
      detail: 'The height or pose engine changed after recording. Live capture is not saved, so a fresh clip is needed.',
      action: { kind: 'recapture', label: 'Film again' },
    }
  }

  if (state.stage === 'invite') {
    return {
      eyebrow: 'Step 1 of 3 · Observe',
      title: 'Start with movement',
      detail: 'Play the illustrative walkthrough or analyse a real clip.',
      action: { kind: 'example', label: 'See an example' },
    }
  }

  if (state.stage === 'capture') {
    const remaining = Math.max(0, state.target - state.events)
    const shortCapture = state.capture === 'done' && remaining > 0
    const detail =
      state.capture === 'error'
        ? 'Camera unavailable. Upload a clip or check the permission and try again.'
        : shortCapture
          ? `Only ${state.events} ${state.eventLabel} were seen. Film again with your full body in frame.`
          : state.capture === 'starting'
            ? 'Approve camera access to begin. The camera turns off when capture ends.'
            : state.capture === 'countdown'
              ? 'Use the framing checks on screen. Recording starts automatically.'
              : state.capture === 'recording'
                ? `${remaining} more ${state.eventLabel} needed. Keep moving; capture ends automatically.`
                : remaining > 0
                  ? `Let the clip play — ${remaining} more ${state.eventLabel} needed.`
                  : 'Review the measurements and confirm your brief.'
    return {
      eyebrow: 'Step 1 of 3 · Observe',
      title:
        state.capture === 'countdown'
          ? 'Get into frame'
          : state.capture === 'recording'
            ? 'Keep moving'
            : shortCapture
              ? 'Not enough movement'
              : 'Let Forma observe',
      detail,
      action:
        state.capture === 'error'
          ? { kind: 'upload', label: 'Upload a clip' }
          : shortCapture
            ? { kind: 'recapture', label: 'Film again' }
            : null,
    }
  }

  if (state.stage === 'confirm') {
    return {
      eyebrow: 'Step 2 of 3 · Confirm',
      title: state.missingPrefs ? `${state.missingPrefs} detail${state.missingPrefs === 1 ? '' : 's'} still needed` : 'Confirm the fitting brief',
      detail: 'Movement is only one input. Add what the shoes need to do before Forma searches.',
      action: { kind: 'brief', label: state.missingPrefs ? 'Complete the brief' : 'Review the brief' },
    }
  }

  if (state.stage === 'research') {
    return {
      eyebrow: 'Step 3 of 3 · Compare',
      title: 'Forma is searching',
      detail: 'Recommendations are being checked against your measurements and confirmed brief.',
      action: { kind: 'results', label: 'View progress' },
    }
  }

  if (state.stage === 'choose') {
    return {
      eyebrow: 'Step 3 of 3 · Compare',
      title: 'Review the starting point',
      detail: 'Check the evidence, compare alternatives, then pick a shoe to verify your size.',
      action: { kind: 'results', label: 'Review recommendations' },
    }
  }

  return {
    eyebrow: 'Step 3 of 3 · Decide',
    title: 'Check the exact size',
    detail: 'Only a submitted size is checked. Open the retailer after reviewing the result.',
    action: { kind: 'results', label: 'Review stock check' },
  }
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
