import type { FrameQuality, Keypoint, Pose } from './types'

const MIN_SCORE = 0.5
const NO_FRAME: FrameQuality = { person: false, hips: false, feet: false }

export function usableKeypoint(keypoint?: Keypoint): keypoint is Keypoint {
  return (
    !!keypoint &&
    Number.isFinite(keypoint.score) &&
    keypoint.score >= MIN_SCORE &&
    keypoint.score <= 1 &&
    Number.isFinite(keypoint.x) &&
    Number.isFinite(keypoint.y) &&
    keypoint.x >= 0 &&
    keypoint.x <= 1 &&
    keypoint.y >= 0 &&
    keypoint.y <= 1
  )
}

const usable = usableKeypoint

export function frameQuality(pose: Pose | null): FrameQuality {
  if (!pose) return NO_FRAME

  const feet = (['left', 'right'] as const).every((side) => {
    const ankle = pose[`${side}_ankle`]
    return usable(ankle) && (usable(pose[`${side}_heel`]) || usable(pose[`${side}_foot`]))
  })

  return {
    person: usable(pose.nose) || usable(pose.left_shoulder) || usable(pose.right_shoulder) || usable(pose.left_hip) || usable(pose.right_hip),
    hips: usable(pose.left_hip) && usable(pose.right_hip),
    feet,
  }
}
