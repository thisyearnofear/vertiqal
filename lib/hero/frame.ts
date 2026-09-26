import type { Sport } from '@/lib/metrics/readout'
import type { KeypointName, Pose } from '@/lib/pose/types'

export interface Point {
  x: number
  y: number
}

/** A clean (un-annotated) still of the most expressive moment, with normalized pose geometry. */
export interface HeroFrame {
  id: number
  sport: Sport
  dataUrl: string
  score: number
  box: { x: number; y: number; w: number; h: number }
  trails: Point[][]
}

const MIN_SCORE = 0.5
const HERO_MAX_WIDTH = 1280
const MIN_TORSO_PX = 24

/** Feet streak in a stride; hands streak in a reach. */
export const TRAIL_KEYPOINTS: Record<Sport, KeypointName[]> = {
  running: ['left_foot', 'right_foot'],
  climbing: ['left_wrist', 'right_wrist'],
}

function midpoint(a: Point | null, b: Point | null): Point | null {
  if (a && b) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  return a ?? b
}

/**
 * How photogenic this pose is, relative to torso length so distance from the camera doesn't matter.
 * Running: horizontal ankle separation (full stride). Climbing: highest hand above the hips (full reach).
 */
export function heroScore(pose: Pose, sport: Sport, width: number, height: number): number | null {
  const at = (name: KeypointName): Point | null => {
    const k = pose[name]
    return k && k.score >= MIN_SCORE ? { x: k.x * width, y: k.y * height } : null
  }
  const shoulders = midpoint(at('left_shoulder'), at('right_shoulder'))
  const hips = midpoint(at('left_hip'), at('right_hip'))
  const leftAnkle = at('left_ankle')
  const rightAnkle = at('right_ankle')
  const head = at('nose') ?? at('left_ear') ?? at('right_ear')
  if (!shoulders || !hips || !leftAnkle || !rightAnkle || !head) return null

  const torso = Math.hypot(shoulders.x - hips.x, shoulders.y - hips.y)
  if (torso < MIN_TORSO_PX) return null

  if (sport === 'running') return Math.abs(leftAnkle.x - rightAnkle.x) / torso

  const top = Math.min(at('left_wrist')?.y ?? Infinity, at('right_wrist')?.y ?? Infinity)
  return Number.isFinite(top) ? (hips.y - top) / torso : null
}

function poseBox(pose: Pose) {
  const points = Object.values(pose).filter((k) => k && k.score >= MIN_SCORE)
  const xs = points.map((k) => k!.x)
  const ys = points.map((k) => k!.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

let nextId = 1

export function captureHero(video: HTMLVideoElement, pose: Pose, history: Pose[], sport: Sport, score: number): HeroFrame | null {
  const width = Math.min(HERO_MAX_WIDTH, video.videoWidth)
  const height = Math.round((video.videoHeight / video.videoWidth) * width)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx || !width || !height) return null
  ctx.drawImage(video, 0, 0, width, height)

  const trails = TRAIL_KEYPOINTS[sport].map((name) =>
    history.flatMap((p) => {
      const k = p[name]
      return k && k.score >= MIN_SCORE ? [{ x: k.x, y: k.y }] : []
    }),
  )

  return { id: nextId++, sport, dataUrl: canvas.toDataURL('image/jpeg', 0.9), score, box: poseBox(pose), trails }
}
