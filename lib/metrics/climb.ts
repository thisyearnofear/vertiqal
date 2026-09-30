import { frameQuality, usableKeypoint as usable } from '../pose/framing.ts'
import type { FrameQuality, Keypoint, Pose } from '../pose/types'
import type { Side } from './gait'

interface Point {
  x: number
  y: number
}

export interface Placement {
  timeSec: number
  side: Side
  /** Positive when the toe sits lower than the heel (edging), negative when flat or smearing. */
  toeDownDeg: number | null
  readjust: boolean
  /** Normalized foot position at the moment it settled. */
  foot: Point
}

export interface ClimbSnapshot {
  sport: 'climbing'
  timeSec: number
  elbowAngle: Partial<Record<Side, number>>
  movingFoot: Side | null
  lastPlacement: Placement | null
  totalPlacements: number
  framing: FrameQuality
  readjusts: number
  quietFeetPct: number | null
  avgToeDownDeg: number | null
  hipOffsetCm: number | null
  avgReachElbowDeg: number | null
  movesPerMin: number | null
}

interface LimbState {
  last: Point | null
  lastTime: number
  moving: boolean
  stillSince: number | null
  lastPlacement: { at: Point; timeSec: number } | null
}

const LEG_TO_HEIGHT = 0.49
/** Speeds are in leg-lengths per second so they hold for any camera distance. */
const MOVING_SPEED = 0.9
const STILL_SPEED = 0.25
const SETTLE_SEC = 0.12
const READJUST_DISTANCE = 0.2
const READJUST_WINDOW_SEC = 2.5
const MOVES_WINDOW_SEC = 20

function angleAt(a: Point, b: Point, c: Point) {
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const denom = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1
  const cos = (v1.x * v2.x + v1.y * v2.y) / denom
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI
}

const freshLimb = (): LimbState => ({ last: null, lastTime: -Infinity, moving: false, stillSince: null, lastPlacement: null })

class RunningMean {
  private sum = 0
  private count = 0
  add(value: number) {
    this.sum += value
    this.count += 1
  }
  get value() {
    return this.count ? this.sum / this.count : null
  }
}

export class ClimbTracker {
  private heightCm: number
  private lastTime = -Infinity
  private feet: Record<Side, LimbState> = { left: freshLimb(), right: freshLimb() }
  private hands: Record<Side, LimbState> = { left: freshLimb(), right: freshLimb() }
  private placements: Placement[] = []
  private handMoves: number[] = []
  private toeDown = new RunningMean()
  private hipOffset = new RunningMean()
  private reachElbow = new RunningMean()

  constructor(heightCm: number) {
    this.heightCm = heightCm
  }

  private reset() {
    this.lastTime = -Infinity
    this.feet = { left: freshLimb(), right: freshLimb() }
    this.hands = { left: freshLimb(), right: freshLimb() }
    this.placements = []
    this.handMoves = []
    this.toeDown = new RunningMean()
    this.hipOffset = new RunningMean()
    this.reachElbow = new RunningMean()
  }

  update(timeSec: number, pose: Pose | null, width: number, height: number): ClimbSnapshot {
    if (timeSec < this.lastTime - 0.1) this.reset()
    this.lastTime = timeSec

    const toPx = (k: Keypoint): Point => ({ x: k.x * width, y: k.y * height })
    const elbowAngle: Partial<Record<Side, number>> = {}
    let movingFoot: Side | null = null

    if (pose) {
      const legPx = this.legLength(pose, toPx)

      for (const side of ['left', 'right'] as const) {
        const shoulder = pose[`${side}_shoulder`]
        const elbow = pose[`${side}_elbow`]
        const wrist = pose[`${side}_wrist`]
        if (usable(shoulder) && usable(elbow) && usable(wrist)) {
          const angle = angleAt(toPx(shoulder), toPx(elbow), toPx(wrist))
          elbowAngle[side] = angle
          if (wrist.y < shoulder.y) this.reachElbow.add(angle)
        }

        if (!legPx) {
          this.feet[side] = freshLimb()
          this.hands[side] = freshLimb()
          continue
        }
        const ankle = pose[`${side}_ankle`]
        if (usable(ankle)) {
          const settled = this.track(this.feet[side], toPx(ankle), timeSec, legPx)
          if (this.feet[side].moving) movingFoot = side
          if (settled) this.recordPlacement(side, settled, pose, toPx, legPx, timeSec)
        } else {
          this.feet[side] = freshLimb()
        }
        if (usable(wrist) && usable(shoulder) && wrist.y < shoulder.y) {
          if (this.track(this.hands[side], toPx(wrist), timeSec, legPx)) this.handMoves.push(timeSec)
        } else {
          this.hands[side] = freshLimb()
        }
      }

      const { left_hip: lh, right_hip: rh, left_ankle: la, right_ankle: ra } = pose
      if (legPx && usable(lh) && usable(rh) && usable(la) && usable(ra)) {
        const hipX = ((lh.x + rh.x) / 2) * width
        const feetX = ((la.x + ra.x) / 2) * width
        this.hipOffset.add((Math.abs(hipX - feetX) / legPx) * this.heightCm * LEG_TO_HEIGHT)
      }
    } else {
      this.feet = { left: freshLimb(), right: freshLimb() }
      this.hands = { left: freshLimb(), right: freshLimb() }
    }

    this.handMoves = this.handMoves.filter((t) => timeSec - t <= MOVES_WINDOW_SEC)
    const readjusts = this.placements.filter((p) => p.readjust).length
    const total = this.placements.length

    return {
      sport: 'climbing',
      timeSec,
      elbowAngle,
      movingFoot,
      lastPlacement: this.placements.at(-1) ?? null,
      totalPlacements: total,
      framing: frameQuality(pose),
      readjusts,
      quietFeetPct: total ? ((total - readjusts) / total) * 100 : null,
      avgToeDownDeg: this.toeDown.value,
      hipOffsetCm: this.hipOffset.value,
      avgReachElbowDeg: this.reachElbow.value,
      movesPerMin: this.movesPerMin(),
    }
  }

  private legLength(pose: Pose, toPx: (k: Keypoint) => Point) {
    for (const side of ['left', 'right'] as const) {
      const hip = pose[`${side}_hip`]
      const knee = pose[`${side}_knee`]
      const ankle = pose[`${side}_ankle`]
      if (usable(hip) && usable(knee) && usable(ankle)) {
        const [h, k, a] = [toPx(hip), toPx(knee), toPx(ankle)]
        return Math.hypot(h.x - k.x, h.y - k.y) + Math.hypot(k.x - a.x, k.y - a.y)
      }
    }
    return null
  }

  /** Returns the settled position when a limb that was moving comes to rest. */
  private track(limb: LimbState, at: Point, timeSec: number, legPx: number): Point | null {
    const dt = timeSec - limb.lastTime
    const previous = limb.last
    // Light smoothing so keypoint jitter doesn't read as movement.
    limb.last = previous ? { x: previous.x * 0.5 + at.x * 0.5, y: previous.y * 0.5 + at.y * 0.5 } : at
    limb.lastTime = timeSec
    if (!previous || dt <= 0 || dt > 0.5) return null

    const speed = Math.hypot(limb.last.x - previous.x, limb.last.y - previous.y) / legPx / dt
    if (speed > MOVING_SPEED) {
      limb.moving = true
      limb.stillSince = null
      return null
    }
    if (!limb.moving || speed > STILL_SPEED) return null
    limb.stillSince ??= timeSec
    if (timeSec - limb.stillSince < SETTLE_SEC) return null
    limb.moving = false
    limb.stillSince = null
    return limb.last
  }

  private recordPlacement(
    side: Side,
    settled: Point,
    pose: Pose,
    toPx: (k: Keypoint) => Point,
    legPx: number,
    timeSec: number,
  ) {
    const limb = this.feet[side]
    const previous = limb.lastPlacement
    const readjust =
      !!previous &&
      timeSec - previous.timeSec < READJUST_WINDOW_SEC &&
      Math.hypot(settled.x - previous.at.x, settled.y - previous.at.y) / legPx < READJUST_DISTANCE
    limb.lastPlacement = { at: settled, timeSec }

    const heel = pose[`${side}_heel`]
    const foot = pose[`${side}_foot`]
    let toeDownDeg: number | null = null
    if (usable(heel) && usable(foot)) {
      const h = toPx(heel)
      const f = toPx(foot)
      toeDownDeg = (Math.atan2(f.y - h.y, Math.abs(f.x - h.x)) * 180) / Math.PI
      this.toeDown.add(toeDownDeg)
    }

    const ankle = pose[`${side}_ankle`]!
    this.placements.push({ timeSec, side, toeDownDeg, readjust, foot: { x: ankle.x, y: ankle.y } })
  }

  private movesPerMin() {
    const moves = this.handMoves
    if (moves.length < 3) return null
    const span = moves[moves.length - 1] - moves[0]
    return span > 0 ? ((moves.length - 1) / span) * 60 : null
  }
}
