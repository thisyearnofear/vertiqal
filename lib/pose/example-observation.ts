import type { FrameQuality } from './types.ts'

export const EXAMPLE_OBSERVATION_INTERVAL_MS = 1000 / 12

export type ExampleTrackingStatus = 'loading' | 'tracking' | 'paused' | 'hidden' | 'disabled' | 'unavailable'

export interface ExampleObservation {
  status: ExampleTrackingStatus
  framing: FrameQuality
}

export function shouldRunExampleTracking(state: { playing: boolean; visible: boolean; enabled: boolean; sessionReady: boolean }): boolean {
  return state.playing && state.visible && state.enabled && state.sessionReady
}

export function exampleTrackingStatus(state: {
  playing: boolean
  visible: boolean
  enabled: boolean
  sessionReady: boolean
  unavailable: boolean
}): ExampleTrackingStatus {
  if (state.unavailable) return 'unavailable'
  if (!state.enabled) return 'disabled'
  if (!state.visible) return 'hidden'
  if (!state.sessionReady) return 'loading'
  if (!state.playing) return 'paused'
  return 'tracking'
}

export function exampleObservationLine({ status, framing }: ExampleObservation): string {
  if (status === 'loading') return 'Loading on-device pose tracking. The video remains an AI-generated illustration.'
  if (status === 'paused') return 'Clip paused. Pose tracking is paused too.'
  if (status === 'hidden') return 'Tracking pauses while this motion view is not visible.'
  if (status === 'disabled') return 'Pose overlay off. You can still watch the generated clip.'
  if (status === 'unavailable') return 'Pose tracking is unavailable here. The generated clip can still play.'
  if (!framing.person) return 'Looking for visible landmarks in this generated scene.'
  if (framing.hips && framing.feet) return 'Hips and both feet are tracked in this generated scene.'
  if (framing.hips) return 'Hips are tracked; both feet are not reliably visible.'
  return 'Some landmarks are occluded. Framing affects what can be observed.'
}
