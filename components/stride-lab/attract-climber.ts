import type { Keypoint, KeypointName, Pose } from '@/lib/pose/types'

const THIGH = 0.245
const SHIN = 0.25
const TORSO = 0.3
const UPPER_ARM = 0.18
const FOREARM = 0.15
/** Horizontal distance from the hip line to the wall face, in body heights. */
const WALL = 0.24
/** How far each limb moves up per move, and the stagger between left and right. */
const RISE = 0.24
const STAGGER = 0.12
/** Order the limbs move in: right hand, left foot, left hand, right foot. */
const LIMBS = [
  { side: 'right', kind: 'hand', start: 0.8 },
  { side: 'left', kind: 'foot', start: 0.05 },
  { side: 'left', kind: 'hand', start: 0.8 + STAGGER },
  { side: 'right', kind: 'foot', start: 0.05 + STAGGER },
] as const
const START_HIP = 0.375
/** Keeps negative times (motion trails) in the same loop as positive ones. */
const TIME_OFFSET = 8

type Vec = [number, number]
type Side = 'left' | 'right'
export type ClimbPhase = 'Reaching' | 'Placing feet' | 'Settling'

interface ClimbOptions {
  /** Horizontal centre of the hips, 0..1 of the frame width. */
  centerX: number
  /** Body height as a fraction of the frame height. */
  height: number
  /** Where the hips sit vertically, 0..1 of the frame height. The camera follows the climber. */
  anchorY: number
  /** Frame height divided by width, so body proportions survive any screen shape. */
  aspect: number
}

export interface ClimbFrame {
  pose: Pose
  /** Normalized x of the wall face. */
  wallX: number
  holds: { x: number; y: number; kind: 'hand' | 'foot'; held: boolean }[]
  moving: { side: Side; kind: 'hand' | 'foot' }
  phase: ClimbPhase
  /** Hip-to-wall distance in body heights, for the overlay. */
  hipGap: number
}

const smooth = (t: number) => t * t * (3 - 2 * t)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Two-bone IK in local (x toward the wall, h up) space; `prefer` picks which bend is natural. */
function reach(root: Vec, target: Vec, a: number, b: number, prefer: (joint: Vec) => number): [Vec, Vec] {
  const dx = target[0] - root[0]
  const dh = target[1] - root[1]
  const full = Math.hypot(dx, dh) || 1e-6
  const dist = clamp(full, Math.abs(a - b) + 1e-3, a + b - 1e-3)
  const ux = dx / full
  const uh = dh / full
  const bend = Math.acos(clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1))
  const options = [bend, -bend].map((angle): Vec => {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    return [root[0] + a * (ux * c - uh * s), root[1] + a * (ux * s + uh * c)]
  })
  const joint = prefer(options[0]) >= prefer(options[1]) ? options[0] : options[1]
  const end: Vec = [root[0] + ux * dist, root[1] + uh * dist]
  return [joint, end]
}

/**
 * A synthetic side-on climber facing a vertical wall on the right, moving one limb at a time.
 * `moves` is continuous: each whole number is one limb moving to its next hold.
 */
export function attractClimb(moves: number, { centerX, height, anchorY, aspect }: ClimbOptions): ClimbFrame {
  const m = moves + TIME_OFFSET
  const n = Math.floor(m)
  const f = m - n
  const active = n % LIMBS.length

  const limbs = LIMBS.map((limb, i) => {
    const done = Math.floor((n + LIMBS.length - 1 - i) / LIMBS.length)
    const base = limb.start + done * RISE
    const isMoving = i === active
    return {
      ...limb,
      h: isMoving ? base + smooth(f) * RISE : base,
      away: isMoving ? Math.sin(Math.PI * f) * 0.07 : 0,
      isMoving,
    }
  })

  const feet = limbs.filter((l) => l.kind === 'foot')
  const hands = limbs.filter((l) => l.kind === 'hand')
  const lowestFoot = Math.min(...feet.map((l) => l.h))
  const highestHand = Math.max(...hands.map((l) => l.h))
  // Hang as low as the highest hand allows (straight arms), but never so low the feet come off.
  const lo = highestHand - 0.56
  const hi = lowestFoot + 0.46
  const hipH = lo <= hi ? lo + (hi - lo) * 0.1 : hi
  const movingKind = LIMBS[active].kind
  const hipX = movingKind === 'hand' ? 0.03 + 0.05 * Math.sin(Math.PI * f) : 0.03 - 0.03 * Math.sin(Math.PI * f)
  const hip: Vec = [hipX, hipH]
  const shoulder: Vec = [hipX - 0.01, hipH + Math.sqrt(TORSO * TORSO - 0.01 * 0.01)]

  const camH = START_HIP + (m / LIMBS.length) * RISE
  const toScreen = ([x, h]: Vec): Keypoint => ({
    x: centerX + x * height * aspect,
    y: anchorY - (h - camH) * height,
    score: 1,
  })

  const pose: Pose = {}
  const put = (name: KeypointName, v: Vec) => {
    pose[name] = toScreen(v)
  }

  for (const limb of limbs) {
    if (limb.kind === 'hand') {
      const target: Vec = [WALL - 0.02 - limb.away, limb.h]
      const [elbow, wrist] = reach(shoulder, target, UPPER_ARM, FOREARM, (j) => -j[1])
      put(`${limb.side}_shoulder`, shoulder)
      put(`${limb.side}_elbow`, elbow)
      put(`${limb.side}_wrist`, wrist)
    } else {
      const target: Vec = [WALL - 0.065 - limb.away, limb.h + 0.035]
      const [knee, ankle] = reach(hip, target, THIGH, SHIN, (j) => j[0])
      const kneeClamped: Vec = [Math.min(knee[0], WALL - 0.03), knee[1]]
      put(`${limb.side}_hip`, hip)
      put(`${limb.side}_knee`, kneeClamped)
      put(`${limb.side}_ankle`, ankle)
      put(`${limb.side}_heel`, [ankle[0] - 0.03, ankle[1] - 0.025])
      put(`${limb.side}_foot`, [ankle[0] + 0.06, ankle[1] - 0.045])
    }
  }
  const lookUp = movingKind === 'hand' ? 0.02 : -0.02
  put('left_ear', [shoulder[0] + 0.01, shoulder[1] + 0.115])
  put('right_ear', [shoulder[0] + 0.01, shoulder[1] + 0.115])
  put('nose', [shoulder[0] + 0.055, shoulder[1] + 0.11 + lookUp])

  const holds: ClimbFrame['holds'] = []
  for (const limb of LIMBS) {
    for (let k = -3; k <= 8; k++) {
      const h = limb.start + (Math.floor(m / LIMBS.length) + k) * RISE
      if (Math.abs(h - camH) > 1.3) continue
      const held = limbs.some((l) => l.side === limb.side && l.kind === limb.kind && !l.isMoving && Math.abs(l.h - h) < 1e-6)
      const point = toScreen([WALL, limb.kind === 'hand' ? h : h + 0.01])
      holds.push({ x: point.x, y: point.y, kind: limb.kind, held })
    }
  }

  const phase: ClimbPhase = f > 0.85 ? 'Settling' : movingKind === 'hand' ? 'Reaching' : 'Placing feet'
  return {
    pose,
    wallX: toScreen([WALL, 0]).x,
    holds,
    moving: { side: LIMBS[active].side, kind: movingKind },
    phase,
    hipGap: WALL - hipX,
  }
}
