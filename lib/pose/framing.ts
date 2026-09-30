import type { FrameQuality, Keypoint, Pose } from './types'

const MIN_SCORE = 0.5
const NO_FRAME: FrameQuality = { person: false, hips: false, feet: false }

const usable = (keypoint?: Keypoint) => Boolean(keypoint && keypoint.score >= MIN_SCORE)

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
