'use client'

import type { MotionValue } from 'motion/react'
import { useEffect, useRef, type RefObject } from 'react'
import { attractPose } from '@/components/stride-lab/attract-runner'
import { BEATS } from './story'
import { drawAngle, drawSkeleton, point, readScanPalette, watchCanvasSize, type Side } from './scan-draw'

const STRIDE_HZ = 172 / 120
const STRIDES = 2
const TRAIL = 26
const TRAIL_STEP = 0.016
const RUNNER_HEIGHT_CM = 178

interface Framing {
  centerX: number
  height: number
  groundY: number
}
const framingFor = (mode: 'stage' | 'box', cssWidth: number): Framing =>
  mode === 'box'
    ? { centerX: 0.5, height: 0.72, groundY: 0.88 }
    : cssWidth < 768
      ? { centerX: 0.5, height: 0.3, groundY: 0.42 }
      : { centerX: 0.74, height: 0.58, groundY: 0.8 }

/**
 * A motion-capture read of one runner, scrubbed by scroll: the stride only moves when the
 * reader does, and the overlays (plumb line, reach, knee angle) explain what Forma measures.
 */
export function StrideScan({
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
      const [start, end] = BEATS.scan
      const local = Math.min(1, Math.max(0, (progress.get() - start) / (end - start)))
      const frame = framingFor(framing, cssWidth)
      const options = { ...frame, aspect: h / w }
      const time = (local * STRIDES) / STRIDE_HZ
      const pose = attractPose(time, options)
      const unit = frame.height * h
      const ground = frame.groundY * h
      const px = (k: { x: number; y: number }) => [k.x * w, k.y * h] as const

      ctx.clearRect(0, 0, w, h)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      ctx.save()
      ctx.globalAlpha = 0.28
      ctx.strokeStyle = palette.ink
      ctx.lineWidth = dpr
      ctx.setLineDash([4 * dpr, 7 * dpr])
      ctx.beginPath()
      ctx.moveTo(framing === 'box' ? 0 : Math.max(0, frame.centerX - 0.24) * w, ground)
      ctx.lineTo(w, ground)
      ctx.stroke()
      ctx.restore()

      ctx.save()
      ctx.fillStyle = palette.color
      for (const side of ['left', 'right'] as const) {
        for (let k = 1; k <= TRAIL; k++) {
          const past = point(attractPose(time - k * TRAIL_STEP, options), side, 'foot')
          if (!past) continue
          const [x, y] = px(past)
          ctx.globalAlpha = (1 - k / TRAIL) * (side === 'left' ? 0.55 : 0.25)
          ctx.beginPath()
          ctx.arc(x, y, 1.6 * dpr, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.restore()

      drawSkeleton(ctx, pose, px, unit, dpr, palette)

      const leftAnkle = pose.left_ankle
      const rightAnkle = pose.right_ankle
      const leftHip = pose.left_hip
      const rightHip = pose.right_hip
      if (!leftAnkle || !rightAnkle || !leftHip || !rightHip) return
      const stance: Side = leftAnkle.y >= rightAnkle.y ? 'left' : 'right'
      const ankle = stance === 'left' ? leftAnkle : rightAnkle
      const hipX = ((leftHip.x + rightHip.x) / 2) * w
      const hipY = ((leftHip.y + rightHip.y) / 2) * h
      const reach = (ankle.x * w - hipX) / unit
      const phase = reach > 0.05 ? 'Landing' : reach > -0.07 ? 'Midstance' : 'Push-off'
      if (phaseRef.current) phaseRef.current.textContent = phase

      ctx.save()
      ctx.globalAlpha = 0.55
      ctx.strokeStyle = palette.ink
      ctx.lineWidth = dpr
      ctx.setLineDash([3 * dpr, 5 * dpr])
      ctx.beginPath()
      ctx.moveTo(hipX, hipY)
      ctx.lineTo(hipX, ground)
      ctx.stroke()
      ctx.restore()

      if (phase === 'Landing') {
        const y = ground + 18 * dpr
        const ax = ankle.x * w
        ctx.save()
        ctx.font = `${20 * dpr}px ${palette.mono}`
        ctx.textBaseline = 'middle'
        ctx.strokeStyle = palette.color
        ctx.fillStyle = palette.color
        ctx.lineWidth = 1.5 * dpr
        ctx.beginPath()
        ctx.moveTo(hipX, y)
        ctx.lineTo(ax, y)
        ctx.moveTo(hipX, y - 5 * dpr)
        ctx.lineTo(hipX, y + 5 * dpr)
        ctx.moveTo(ax, y - 5 * dpr)
        ctx.lineTo(ax, y + 5 * dpr)
        ctx.stroke()
        ctx.textAlign = 'left'
        ctx.fillText(`REACH ${Math.round(reach * RUNNER_HEIGHT_CM)} CM`, ax + 10 * dpr, y)
        ctx.restore()
      }

      const hip = point(pose, stance, 'hip')
      const knee = point(pose, stance, 'knee')
      if (hip && knee) drawAngle(ctx, px(knee), px(hip), px(ankle), 0.07 * unit, dpr, palette)
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
