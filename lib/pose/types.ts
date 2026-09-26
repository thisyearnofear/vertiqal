export const KEYPOINT_NAMES = [
  'nose',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
  'left_heel',
  'right_heel',
  'left_foot',
  'right_foot',
] as const

export type KeypointName = (typeof KEYPOINT_NAMES)[number]

/** Coordinates are normalized to the source frame (0..1). */
export interface Keypoint {
  x: number
  y: number
  score: number
}

export type Pose = Partial<Record<KeypointName, Keypoint>>

/**
 * A running pose session. Live providers detect on demand for the current
 * frame; batch providers (e.g. a hosted ViTPose run) precompute a track and
 * look up the nearest frame. Consumers never need to know which.
 */
export interface PoseSession {
  poseAt(video: HTMLVideoElement): Pose | null
  /** Background work that improves the track (e.g. hosted refinement) reports progress here. */
  onStatus?(listener: (status: string | null) => void): void
  dispose(): void
}

export interface PoseProvider {
  id: string
  label: string
  detail: string
  available: boolean
  unavailableReason?: string
  load(): Promise<PoseSession>
}
