import type { KeypointName, Pose } from '@/lib/pose/types'

export type Side = 'left' | 'right'
export type Px = (k: { x: number; y: number }) => readonly [number, number]

export interface ScanPalette {
  color: string
  ink: string
  stage: string
  mono: string
}

const BONES: [string, string][] = [
  ['shoulder', 'elbow'],
  ['elbow', 'wrist'],
  ['shoulder', 'hip'],
  ['hip', 'knee'],
  ['knee', 'ankle'],
  ['ankle', 'heel'],
  ['heel', 'foot'],
  ['ankle', 'foot'],
]
const JOINTS = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle']

export const point = (pose: Pose, side: Side, joint: string) => pose[`${side}_${joint}` as KeypointName]

export function readScanPalette(canvas: HTMLCanvasElement): ScanPalette {
  const styles = getComputedStyle(canvas)
  return {
    color: styles.getPropertyValue('--stage-foreground').trim() || '#f2a54a',
    ink: styles.getPropertyValue('--stage-ink').trim() || '#efe8dc',
    stage: styles.getPropertyValue('--stage').trim() || '#1c1814',
    mono: getComputedStyle(document.documentElement).getPropertyValue('--font-vt323').trim() || 'monospace',
  }
}

/** Glowing skeleton with the far side dimmed, plus the head. */
export function drawSkeleton(ctx: CanvasRenderingContext2D, pose: Pose, px: Px, unit: number, dpr: number, palette: ScanPalette) {
  for (const side of ['right', 'left'] as const) {
    ctx.save()
    ctx.globalAlpha = side === 'right' ? 0.35 : 1
    ctx.strokeStyle = palette.color
    ctx.lineWidth = 2.25 * dpr
    ctx.shadowColor = palette.color
    ctx.shadowBlur = 14 * dpr
    ctx.beginPath()
    for (const [a, b] of BONES) {
      const p = point(pose, side, a)
      const q = point(pose, side, b)
      if (!p || !q) continue
      ctx.moveTo(...px(p))
      ctx.lineTo(...px(q))
    }
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.fillStyle = palette.stage
    ctx.lineWidth = 1.5 * dpr
    for (const joint of JOINTS) {
      const p = point(pose, side, joint)
      if (!p) continue
      ctx.beginPath()
      ctx.arc(...px(p), 3.2 * dpr, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }

  const nose = pose.nose
  const ear = pose.left_ear
  if (!nose || !ear) return
  const [nx, ny] = px(nose)
  const [ex, ey] = px(ear)
  ctx.save()
  ctx.strokeStyle = palette.color
  ctx.lineWidth = 2.25 * dpr
  ctx.shadowColor = palette.color
  ctx.shadowBlur = 14 * dpr
  ctx.beginPath()
  ctx.arc((nx + ex) / 2, (ny + ey) / 2, 0.055 * unit, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** Angle arc at `at` between the rays to `from` and `to`, labelled in degrees on the outside. */
export function drawAngle(
  ctx: CanvasRenderingContext2D,
  at: readonly [number, number],
  from: readonly [number, number],
  to: readonly [number, number],
  radius: number,
  dpr: number,
  palette: ScanPalette,
) {
  const a1 = Math.atan2(from[1] - at[1], from[0] - at[0])
  const a2 = Math.atan2(to[1] - at[1], to[0] - at[0])
  let diff = a2 - a1
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  ctx.save()
  ctx.strokeStyle = palette.color
  ctx.fillStyle = palette.color
  ctx.lineWidth = 1.5 * dpr
  ctx.font = `${20 * dpr}px ${palette.mono}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.beginPath()
  ctx.arc(at[0], at[1], radius, a1, a1 + diff, diff < 0)
  ctx.stroke()
  const outward = a1 + diff / 2 + Math.PI
  ctx.fillText(`${Math.round((Math.abs(diff) * 180) / Math.PI)}°`, at[0] + Math.cos(outward) * radius * 1.9, at[1] + Math.sin(outward) * radius * 1.9)
  ctx.restore()
}

/** Keeps the canvas backing store matched to its CSS size, and redraws on resize. */
export function watchCanvasSize(canvas: HTMLCanvasElement, onResize: (dpr: number, cssWidth: number) => void) {
  const observer = new ResizeObserver(([entry]) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(entry.contentRect.width * dpr)
    canvas.height = Math.round(entry.contentRect.height * dpr)
    onResize(dpr, entry.contentRect.width)
  })
  observer.observe(canvas)
  return () => observer.disconnect()
}
