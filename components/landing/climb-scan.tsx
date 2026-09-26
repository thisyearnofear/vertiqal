'use client'

import type { MotionValue } from 'motion/react'
import { useEffect, useRef, type RefObject } from 'react'
import { attractClimb } from '@/components/stride-lab/attract-climber'
import { BEATS } from './story'
import { drawAngle, drawSkeleton, point, readScanPalette, watchCanvasSize } from './scan-draw'

/** Moves shown across the beat: two full cycles of right hand, left foot, left hand, right foot. */
const MOVES = 8
const TRAIL = 22
const TRAIL_STEP = 0.02
const CLIMBER_HEIGHT_CM = 172

interface Framing {
  centerX: number
  height: number
  anchorY: number
  /** Vertical band (0..1) the wall is drawn in, so it clears the top bar and chapter rail. */
  wallBand: readonly [number, number]
}
const framingFor = (mode: 'stage' | 'box', cssWidth: number): Framing =>
  mode === 'box'
    ? { centerX: 0.42, height: 0.62, anchorY: 0.54, wallBand: [0, 1] }
    : cssWidth < 768
      ? { centerX: 0.42, height: 0.28, anchorY: 0.25, wallBand: [0.08, 0.44] }
      : { centerX: 0.78, height: 0.58, anchorY: 0.48, wallBand: [0.12, 0.86] }

const FADE = 0.06
const bandAlpha = (y: number, [top, bottom]: readonly [number, number]) =>
  Math.min(1, Math.max(0, Math.min((y - top) / FADE, (bottom - y) / FADE)))

/**
 * The climbing counterpart to StrideScan: a side-on climber moving hold by hold, scrubbed by
 * scroll, with the overlays Forma reads on the wall (hips to wall, straight arms, edging).
 */
export function ClimbScan({
  progress,
  phaseRef,
  framing = 'stage',
}: {
  progress: MotionValue<number>
  phaseRef: RefObject<HTMLSpanElement | null>
  framing?: 'stage' | 'box'
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const palette = readScanPalette(canvas)
    let dpr = 1
    let cssWidth = 0

    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      if (!w || !h) return
      const [start, end] = BEATS.climb
      const local = Math.min(1, Math.max(0, (progress.get() - start) / (end - start)))
      const frame = framingFor(framing, cssWidth)
      const options = { ...frame, aspect: h / w }
      const moves = local * MOVES
      const climb = attractClimb(moves, options)
      const { pose } = climb
      const unit = frame.height * h
      const px = (k: { x: number; y: number }) => [k.x * w, k.y * h] as const
      if (phaseRef.current) phaseRef.current.textContent = climb.phase

      ctx.clearRect(0, 0, w, h)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      const wallX = climb.wallX * w
      const [bandTop, bandBottom] = frame.wallBand
      const wallFade = ctx.createLinearGradient(0, bandTop * h, 0, bandBottom * h)
      const fadeStop = FADE / (bandBottom - bandTop)
      wallFade.addColorStop(0, 'transparent')
      wallFade.addColorStop(fadeStop, palette.ink)
      wallFade.addColorStop(1 - fadeStop, palette.ink)
      wallFade.addColorStop(1, 'transparent')
      ctx.save()
      ctx.globalAlpha = 0.28
      ctx.strokeStyle = wallFade
      ctx.lineWidth = dpr
      ctx.setLineDash([4 * dpr, 7 * dpr])
      ctx.beginPath()
      ctx.moveTo(wallX, bandTop * h)
      ctx.lineTo(wallX, bandBottom * h)
      ctx.stroke()
      ctx.restore()

      for (const hold of climb.holds) {
        const fade = bandAlpha(hold.y, frame.wallBand)
        if (!fade) continue
        const [x, y] = px(hold)
        const r = (hold.kind === 'hand' ? 0.026 : 0.02) * unit
        ctx.save()
        ctx.fillStyle = hold.held ? palette.color : palette.ink
        ctx.globalAlpha = (hold.held ? 0.9 : 0.22) * fade
        ctx.beginPath()
        ctx.ellipse(x - r * 0.35, y, r * 0.75, r, 0, Math.PI / 2, (Math.PI * 3) / 2)
        ctx.fill()
        ctx.restore()
      }

      ctx.save()
      ctx.fillStyle = palette.color
      const joint = climb.moving.kind === 'hand' ? 'wrist' : 'foot'
      for (let k = 1; k <= TRAIL; k++) {
        const past = point(attractClimb(moves - k * TRAIL_STEP, options).pose, climb.moving.side, joint)
        if (!past) continue
        const [x, y] = px(past)
        ctx.globalAlpha = (1 - k / TRAIL) * 0.55
        ctx.beginPath()
        ctx.arc(x, y, 1.6 * dpr, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      drawSkeleton(ctx, pose, px, unit, dpr, palette)

      ctx.font = `${20 * dpr}px ${palette.mono}`
      ctx.textBaseline = 'middle'

      const hip = pose.left_hip
      if (hip) {
        const [hx, hy] = px(hip)
        ctx.save()
        ctx.strokeStyle = palette.color
        ctx.fillStyle = palette.color
        ctx.lineWidth = 1.5 * dpr
        ctx.beginPath()
        ctx.moveTo(hx, hy)
        ctx.lineTo(wallX, hy)
        ctx.moveTo(hx, hy - 5 * dpr)
        ctx.lineTo(hx, hy + 5 * dpr)
        ctx.stroke()
        ctx.textAlign = 'right'
        ctx.fillText(`HIPS ${Math.round(climb.hipGap * CLIMBER_HEIGHT_CM)} CM`, hx - 12 * dpr, hy)
        ctx.restore()
      }

      const hanging = climb.moving.kind === 'hand' ? (climb.moving.side === 'left' ? 'right' : 'left') : 'left'
      const shoulder = point(pose, hanging, 'shoulder')
      const elbow = point(pose, hanging, 'elbow')
      const wrist = point(pose, hanging, 'wrist')
      if (shoulder && elbow && wrist) drawAngle(ctx, px(elbow), px(shoulder), px(wrist), 0.04 * unit, dpr, palette)

      const standing = climb.moving.kind === 'foot' ? (climb.moving.side === 'left' ? 'right' : 'left') : 'left'
      const heel = point(pose, standing, 'heel')
      const toe = point(pose, standing, 'foot')
      if (heel && toe) {
        const [tx, ty] = px(toe)
        const [ex, ey] = px(heel)
        const edge = Math.round((Math.atan2(ty - ey, Math.abs(tx - ex)) * 180) / Math.PI)
        ctx.save()
        ctx.fillStyle = palette.color
        ctx.textAlign = 'left'
        ctx.fillText(`EDGE ${edge}°`, wallX + 12 * dpr, ty)
        ctx.restore()
      }
    }

    const stopWatching = watchCanvasSize(canvas, (nextDpr, width) => {
      dpr = nextDpr
      cssWidth = width
      draw()
    })
    const unsubscribe = progress.on('change', draw)
    void document.fonts?.ready.then(draw)
    return () => {
      stopWatching()
      unsubscribe()
    }
  }, [progress, phaseRef, framing])

  return <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />
}
