import type { Keypoint, KeypointName, Pose } from '@/lib/pose/types'

const CADENCE_SPM = 172
const STRIDE_HZ = CADENCE_SPM / 120
const THIGH = 0.245
const SHIN = 0.25
const TORSO = 0.3
const UPPER_ARM = 0.15
const FOREARM = 0.14
const LEAN = 0.14

interface AttractOptions {
  /** Horizontal centre of the hips, 0..1 of the frame width. */
  centerX: number
  /** Body height as a fraction of the frame height. */
  height: number
  groundY: number
  /** Frame height divided by width, so body proportions survive any screen shape. */
  aspect: number
}

type Vec = [number, number]
const along = (from: Vec, length: number, angle: number): Vec => [
  from[0] + length * Math.sin(angle),
  from[1] + length * Math.cos(angle),
]

/**
 * A synthetic side-on runner facing right, for the idle monitor's attract loop.
 * Angles are measured from straight down, positive forward; lengths are in body heights.
 */
export function attractPose(timeSec: number, { centerX, height, groundY, aspect }: AttractOptions): Pose {
  const phase = timeSec * STRIDE_HZ * Math.PI * 2
  const hip: Vec = [0, -(THIGH + SHIN) * 0.95 + 0.012 * Math.cos(phase * 2)]
  const shoulder: Vec = [hip[0] + TORSO * Math.sin(LEAN), hip[1] - TORSO * Math.cos(LEAN)]
  const pose: Pose = {}

  const put = (name: KeypointName, [x, y]: Vec) => {
    const point: Keypoint = { x: centerX + x * height * aspect, y: groundY + y * height, score: 1 }
    pose[name] = point
  }

  for (const [side, legPhase, depth] of [
    ['left', phase, 0],
    ['right', phase + Math.PI, -0.012],
  ] as const) {
    const thigh = 0.42 * Math.sin(legPhase)
    const swing = Math.max(0, Math.cos(legPhase))
    const flex = 0.2 + 1.2 * swing * swing + 0.3 * Math.max(0, -Math.cos(legPhase))
    const sideHip: Vec = [hip[0] + depth, hip[1]]
    const knee = along(sideHip, THIGH, thigh)
    const shin = thigh - flex
    const ankle = along(knee, SHIN, shin)
    const toe: Vec = [ankle[0] + 0.075 * Math.cos(shin), ankle[1] - 0.075 * Math.sin(shin) + 0.01]
    const heel: Vec = [ankle[0] - 0.03 * Math.cos(shin), ankle[1] + 0.03 * Math.sin(shin) + 0.015]

    const sideShoulder: Vec = [shoulder[0] + depth, shoulder[1]]
    const upperArm = -0.55 * Math.sin(legPhase)
    const elbow = along(sideShoulder, UPPER_ARM, upperArm)
    const wrist = along(elbow, FOREARM, upperArm + 1.45)

    put(`${side}_hip`, sideHip)
    put(`${side}_knee`, knee)
    put(`${side}_ankle`, ankle)
    put(`${side}_heel`, heel)
    put(`${side}_foot`, toe)
    put(`${side}_shoulder`, sideShoulder)
    put(`${side}_elbow`, elbow)
    put(`${side}_wrist`, wrist)
    put(`${side}_ear`, [shoulder[0] + 0.02 + depth, shoulder[1] - 0.115])
  }
  put('nose', [shoulder[0] + 0.045, shoulder[1] - 0.11])
  return pose
}
