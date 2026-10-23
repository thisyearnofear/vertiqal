import { usableKeypoint } from './framing.ts'
import type { Keypoint, KeypointName, Pose } from './types.ts'
import type { MovementSnapshot, Readout, Sport } from '../metrics/readout.ts'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type TwinJointName =
  | KeypointName
  | 'pelvis'
  | 'thorax'
  | 'neck'
  | 'head_center'

export interface TwinBone {
  id: string
  from: TwinJointName
  to: TwinJointName
  side: 'left' | 'right' | 'center'
}

export interface TwinVector {
  id: string
  label: string
  valueLabel: string
  origin: Vec3
  target: Vec3
  flagged: boolean
  joint: TwinJointName
}

export interface TwinPin {
  id: string
  title: string
  detail: string
  joint: TwinJointName
  position: Vec3
  flagged: boolean
}

export interface TwinFrame3D {
  sport: Sport
  joints: Partial<Record<TwinJointName, Vec3>>
  bones: TwinBone[]
  vectors: TwinVector[]
  pins: TwinPin[]
  groundY: number
}

export const TWIN_BONES: TwinBone[] = [
  { id: 'spine-lower', from: 'pelvis', to: 'thorax', side: 'center' },
  { id: 'spine-upper', from: 'thorax', to: 'neck', side: 'center' },
  { id: 'neck-head', from: 'neck', to: 'head_center', side: 'center' },
  { id: 'pelvis-l', from: 'pelvis', to: 'left_hip', side: 'left' },
  { id: 'pelvis-r', from: 'pelvis', to: 'right_hip', side: 'right' },
  { id: 'shoulder-l', from: 'neck', to: 'left_shoulder', side: 'left' },
  { id: 'shoulder-r', from: 'neck', to: 'right_shoulder', side: 'right' },
  { id: 'upper-arm-l', from: 'left_shoulder', to: 'left_elbow', side: 'left' },
  { id: 'forearm-l', from: 'left_elbow', to: 'left_wrist', side: 'left' },
  { id: 'upper-arm-r', from: 'right_shoulder', to: 'right_elbow', side: 'right' },
  { id: 'forearm-r', from: 'right_elbow', to: 'right_wrist', side: 'right' },
  { id: 'thigh-l', from: 'left_hip', to: 'left_knee', side: 'left' },
  { id: 'shank-l', from: 'left_knee', to: 'left_ankle', side: 'left' },
  { id: 'heel-l', from: 'left_ankle', to: 'left_heel', side: 'left' },
  { id: 'foot-l', from: 'left_heel', to: 'left_foot', side: 'left' },
  { id: 'instep-l', from: 'left_ankle', to: 'left_foot', side: 'left' },
  { id: 'thigh-r', from: 'right_hip', to: 'right_knee', side: 'right' },
  { id: 'shank-r', from: 'right_knee', to: 'right_ankle', side: 'right' },
  { id: 'heel-r', from: 'right_ankle', to: 'right_heel', side: 'right' },
  { id: 'foot-r', from: 'right_heel', to: 'right_foot', side: 'right' },
  { id: 'instep-r', from: 'right_ankle', to: 'right_foot', side: 'right' },
]

/** Anatomical lateral Z offsets in metres-like normalized scene units so left/right limbs separate in 3D. */
const LATERAL_Z: Record<KeypointName, number> = {
  nose: 0,
  left_ear: 0.07,
  right_ear: -0.07,
  left_shoulder: 0.19,
  right_shoulder: -0.19,
  left_elbow: 0.23,
  right_elbow: -0.23,
  left_wrist: 0.25,
  right_wrist: -0.25,
  left_hip: 0.13,
  right_hip: -0.13,
  left_knee: 0.14,
  right_knee: -0.14,
  left_ankle: 0.14,
  right_ankle: -0.14,
  left_heel: 0.14,
  right_heel: -0.14,
  left_foot: 0.15,
  right_foot: -0.15,
}

const midpoint = (a?: Vec3, b?: Vec3): Vec3 | undefined =>
  a && b
    ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }
    : a ?? b

const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
})

function validPoint(kp: Keypoint | undefined): Keypoint | null {
  return usableKeypoint(kp) ? kp : null
}

/**
 * Retargets a normalized 2D Pose (0..1 image space) into a centered 3D rig space
 * where Y is up, X is sagittal/horizontal, and Z is lateral depth.
 */
export function retargetPoseTo3D(
  pose: Pose | null,
  options: {
    sport: Sport
    snapshot?: MovementSnapshot | null
    readout?: Readout | null
    requirements?: { attribute: string; target: string; evidence?: string }[]
  },
): TwinFrame3D {
  const { sport, snapshot = null, readout = null, requirements = [] } = options
  const joints: Partial<Record<TwinJointName, Vec3>> = {}

  if (!pose) {
    return { sport, joints, bones: [], vectors: [], pins: [], groundY: -0.85 }
  }

  // Compute bounding center from hips/shoulders so the 3D avatar stays centered in the viewport
  const lHip = validPoint(pose.left_hip)
  const rHip = validPoint(pose.right_hip)
  const lSho = validPoint(pose.left_shoulder)
  const rSho = validPoint(pose.right_shoulder)

  const anchorX =
    lHip && rHip
      ? (lHip.x + rHip.x) / 2
      : lSho && rSho
        ? (lSho.x + rSho.x) / 2
        : 0.5
  const anchorY =
    lHip && rHip
      ? (lHip.y + rHip.y) / 2
      : lSho && rSho
        ? (lSho.y + rSho.y) / 2 + 0.18
        : 0.52

  // Scale normalized image coordinates into a ~1.8m scene height
  const scale = 2.2

  for (const name of Object.keys(LATERAL_Z) as KeypointName[]) {
    const kp = validPoint(pose[name])
    if (!kp) continue
    const x = (kp.x - anchorX) * scale
    const y = (anchorY - kp.y) * scale + 0.1
    // Add subtle stride/climb depth modulation from limb swing
    const swingZ =
      sport === 'climbing'
        ? (name.includes('wrist') || name.includes('foot') ? -0.06 : 0.04)
        : 0
    joints[name] = {
      x: Number(x.toFixed(4)),
      y: Number(y.toFixed(4)),
      z: Number((LATERAL_Z[name] + swingZ).toFixed(4)),
    }
  }

  const pelvis = midpoint(joints.left_hip, joints.right_hip)
  const neck = midpoint(joints.left_shoulder, joints.right_shoulder)
  if (pelvis) joints.pelvis = { ...pelvis, z: 0 }
  if (neck) joints.neck = { ...neck, z: 0 }
  if (pelvis && neck) joints.thorax = lerpVec(pelvis, neck, 0.55)
  const ears = midpoint(joints.left_ear, joints.right_ear)
  if (joints.nose && ears) {
    joints.head_center = lerpVec(ears, joints.nose, 0.45)
  } else if (joints.nose) {
    joints.head_center = { ...joints.nose, z: 0 }
  } else if (neck) {
    joints.head_center = { x: neck.x, y: neck.y + 0.22, z: 0 }
  }

  // Synthesize missing heel/foot joints from ankle when partial keypoints are supplied
  for (const side of ['left', 'right'] as const) {
    const ankle = joints[`${side}_ankle`]
    if (!ankle) continue
    const dir = sport === 'running' && snapshot?.sport === 'running' ? snapshot.direction : 1
    if (!joints[`${side}_heel`]) {
      joints[`${side}_heel`] = {
        x: Number((ankle.x - dir * 0.06).toFixed(4)),
        y: Number((ankle.y - 0.05).toFixed(4)),
        z: ankle.z,
      }
    }
    if (!joints[`${side}_foot`]) {
      joints[`${side}_foot`] = {
        x: Number((ankle.x + dir * 0.11).toFixed(4)),
        y: Number((ankle.y - 0.05).toFixed(4)),
        z: ankle.z,
      }
    }
  }

  const lowestFootY = Math.min(
    joints.left_heel?.y ?? Infinity,
    joints.right_heel?.y ?? Infinity,
    joints.left_foot?.y ?? Infinity,
    joints.right_foot?.y ?? Infinity,
    joints.left_ankle?.y ?? Infinity,
    joints.right_ankle?.y ?? Infinity,
  )
  const groundY = Number.isFinite(lowestFootY) ? Number((lowestFootY - 0.03).toFixed(4)) : -0.85

  const availableBones = TWIN_BONES.filter((b) => Boolean(joints[b.from] && joints[b.to]))
  const vectors = buildMetricVectors(sport, joints, groundY, snapshot, readout)
  const pins = buildTwinPins(sport, joints, readout, requirements)

  return {
    sport,
    joints,
    bones: availableBones,
    vectors,
    pins,
    groundY,
  }
}

function buildMetricVectors(
  sport: Sport,
  joints: Partial<Record<TwinJointName, Vec3>>,
  groundY: number,
  snapshot: MovementSnapshot | null,
  readout: Readout | null,
): TwinVector[] {
  const vectors: TwinVector[] = []
  const pelvis = joints.pelvis ?? joints.left_hip ?? joints.right_hip
  const neck = joints.neck ?? joints.left_shoulder ?? joints.right_shoulder

  if (sport === 'running') {
    // Lead foot is the one further from pelvis in X or lowest near ground
    const lFoot = joints.left_ankle ?? joints.left_foot
    const rFoot = joints.right_ankle ?? joints.right_foot
    const leadSide =
      lFoot && rFoot
        ? Math.abs(lFoot.x - (pelvis?.x ?? 0)) >= Math.abs(rFoot.x - (pelvis?.x ?? 0))
          ? 'left'
          : 'right'
        : lFoot
          ? 'left'
          : 'right'
    const leadAnkle = joints[`${leadSide}_ankle`]
    const leadFoot = joints[`${leadSide}_foot`]
    const overstrideMetric = readout?.metrics.find((m) => m.id === 'overstride')
    const overstrideVal =
      overstrideMetric?.value ?? (snapshot?.sport === 'running' ? snapshot.avgOverstrideCm : null)

    if (pelvis && leadAnkle) {
      const origin: Vec3 = { x: pelvis.x, y: groundY + 0.02, z: leadAnkle.z }
      const target: Vec3 = { x: leadAnkle.x, y: groundY + 0.02, z: leadAnkle.z }
      vectors.push({
        id: 'overstride',
        label: 'Overstride vector',
        valueLabel: overstrideVal !== null && overstrideVal !== undefined ? `${Math.round(overstrideVal)} cm` : ' Measuring',
        origin,
        target,
        flagged: (overstrideVal ?? 0) > 12,
        joint: `${leadSide}_ankle`,
      })
    }

    if (leadAnkle && leadFoot) {
      const kneeMetric = readout?.metrics.find((m) => m.id === 'knee')
      const kneeVal = kneeMetric?.value ?? (snapshot?.sport === 'running' ? snapshot.avgKneeAtStrike : null)
      vectors.push({
        id: 'strike',
        label: 'Strike & knee vector',
        valueLabel: kneeVal !== null && kneeVal !== undefined ? `${Math.round(kneeVal)}° knee` : 'Strike vector',
        origin: leadAnkle,
        target: { x: leadFoot.x + (leadFoot.x - leadAnkle.x) * 1.4, y: leadFoot.y + 0.08, z: leadFoot.z },
        flagged: (kneeVal ?? 160) > 168,
        joint: `${leadSide}_foot`,
      })
    }

    if (pelvis && neck) {
      const leanMetric = readout?.metrics.find((m) => m.id === 'lean')
      const leanVal = leanMetric?.value ?? (snapshot?.sport === 'running' ? snapshot.trunkLeanDeg : null)
      vectors.push({
        id: 'lean',
        label: 'Trunk lean axis',
        valueLabel: leanVal !== null && leanVal !== undefined ? `${Math.round(leanVal)}° lean` : 'Trunk axis',
        origin: pelvis,
        target: { x: neck.x, y: neck.y + 0.15, z: neck.z },
        flagged: leanVal !== null && leanVal !== undefined && (leanVal < 3 || leanVal > 14),
        joint: 'thorax',
      })
    }
    return vectors
  }

  // Climbing vectors: hip-to-wall offset, reach envelope, and toe-down angle
  const lWrist = joints.left_wrist ?? joints.left_elbow
  const rWrist = joints.right_wrist ?? joints.right_elbow
  const highHandSide =
    lWrist && rWrist ? (lWrist.y >= rWrist.y ? 'left' : 'right') : lWrist ? 'left' : 'right'
  const highShoulder = joints[`${highHandSide}_shoulder`] ?? neck
  const highHand = joints[`${highHandSide}_wrist`] ?? joints[`${highHandSide}_elbow`]

  if (highShoulder && highHand) {
    const reachMetric = readout?.metrics.find((m) => m.id === 'reach')
    const reachVal =
      reachMetric?.value ?? (snapshot?.sport === 'climbing' ? snapshot.avgReachElbowDeg : null)
    vectors.push({
      id: 'reach',
      label: 'Reach envelope',
      valueLabel: reachVal !== null && reachVal !== undefined ? `${Math.round(reachVal)}° elbow` : 'Reach vector',
      origin: highShoulder,
      target: highHand,
      flagged: reachVal !== null && reachVal !== undefined && reachVal < 140,
      joint: `${highHandSide}_wrist`,
    })
  }

  if (pelvis) {
    const hipsMetric = readout?.metrics.find((m) => m.id === 'hips')
    const hipsVal = hipsMetric?.value ?? (snapshot?.sport === 'climbing' ? snapshot.hipOffsetCm : null)
    vectors.push({
      id: 'hips',
      label: 'Hip-to-wall offset',
      valueLabel: hipsVal !== null && hipsVal !== undefined ? `${Math.round(hipsVal)} cm` : 'Wall offset',
      origin: pelvis,
      target: { x: pelvis.x, y: pelvis.y, z: -0.22 },
      flagged: (hipsVal ?? 0) > 25,
      joint: 'pelvis',
    })
  }

  const lFoot = joints.left_foot ?? joints.left_ankle
  const leadFootSide = lFoot ? 'left' : 'right'
  const ankle = joints[`${leadFootSide}_ankle`]
  const foot = joints[`${leadFootSide}_foot`]
  if (ankle && foot) {
    const toeMetric = readout?.metrics.find((m) => m.id === 'toe')
    const toeVal = toeMetric?.value ?? (snapshot?.sport === 'climbing' ? snapshot.avgToeDownDeg : null)
    vectors.push({
      id: 'toe',
      label: 'Toe-down edging angle',
      valueLabel: toeVal !== null && toeVal !== undefined ? `${Math.round(toeVal)}° toe` : 'Edging angle',
      origin: ankle,
      target: { x: foot.x + 0.12, y: foot.y - 0.06, z: foot.z },
      flagged: (toeVal ?? 0) > 20,
      joint: `${leadFootSide}_foot`,
    })
  }

  return vectors
}

export function jointForAttribute(attribute: string, sport: Sport): TwinJointName {
  const lower = attribute.toLowerCase()
  if (lower.includes('heel') || lower.includes('drop') || lower.includes('crash') || lower.includes('rearfoot')) {
    return 'left_heel'
  }
  if (lower.includes('toe') || lower.includes('downturn') || lower.includes('asymmetry') || lower.includes('forefoot') || lower.includes('edging') || lower.includes('rubber')) {
    return 'left_foot'
  }
  if (lower.includes('knee') || lower.includes('stability') || lower.includes('guide') || lower.includes('support')) {
    return 'left_knee'
  }
  if (lower.includes('hip') || lower.includes('lean') || lower.includes('core') || lower.includes('posture')) {
    return 'pelvis'
  }
  if (lower.includes('reach') || lower.includes('arm') || lower.includes('upper')) {
    return 'left_wrist'
  }
  return sport === 'running' ? 'left_ankle' : 'left_foot'
}

function buildTwinPins(
  sport: Sport,
  joints: Partial<Record<TwinJointName, Vec3>>,
  readout: Readout | null,
  requirements: { attribute: string; target: string; evidence?: string }[],
): TwinPin[] {
  const pins: TwinPin[] = []
  const fallbackPos: Vec3 = { x: 0, y: 0, z: 0 }

  if (requirements.length > 0) {
    for (let i = 0; i < requirements.length; i++) {
      const req = requirements[i]
      const joint = jointForAttribute(req.attribute, sport)
      const position = joints[joint] ?? joints.pelvis ?? fallbackPos
      pins.push({
        id: `req-${i}`,
        title: req.attribute,
        detail: `${req.target}${req.evidence ? ` — ${req.evidence}` : ''}`,
        joint,
        position,
        flagged: true,
      })
    }
    return pins
  }

  for (const signal of readout?.signals ?? []) {
    const joint = jointForAttribute(signal.label, sport)
    const position = joints[joint] ?? joints.pelvis ?? fallbackPos
    pins.push({
      id: `sig-${signal.id}`,
      title: signal.label,
      detail: signal.detail,
      joint,
      position,
      flagged: signal.flagged,
    })
  }
  return pins
}
