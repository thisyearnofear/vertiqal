'use client'

import type { MotionValue } from 'motion/react'
import { useEffect, useRef, type RefObject } from 'react'
import { attractPose } from '@/components/stride-lab/attract-runner'
import type { KeypointName, Pose } from '@/lib/pose/types'
import { BEATS } from './story'

const STRIDE_HZ = 172 / 120
const STRIDES = 2
const TRAIL = 26
const TRAIL_STEP = 0.016
const RUNNER_HEIGHT_CM = 178

type Side = 'left' | 'right'
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

const point = (pose: Pose, side: Side, joint: string) => pose[`${side}_${joint}` as KeypointName]

/**
 * A motion-capture read of one runner, scrubbed by scroll: the stride only moves when the
 * reader does, and the overlays (plumb line, overstride, knee angle) explain what Forma measures.
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
    const styles = getComputedStyle(canvas)
    const color = styles.getPropertyValue('--stage-foreground').trim() || '#f2a54a'
    const ink = styles.getPropertyValue('--stage-ink').trim() || '#efe8dc'
    const stage = styles.getPropertyValue('--stage').trim() || '#1c1814'
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-vt323').trim() || 'monospace'
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
      ctx.strokeStyle = ink
      ctx.lineWidth = dpr
      ctx.setLineDash([4 * dpr, 7 * dpr])
      ctx.beginPath()
      ctx.moveTo(framing === 'box' ? 0 : Math.max(0, frame.centerX - 0.24) * w, ground)
      ctx.lineTo(w, ground)
      ctx.stroke()
      ctx.restore()

      ctx.save()
      ctx.fillStyle = color
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

      for (const side of ['right', 'left'] as const) {
        ctx.save()
        ctx.globalAlpha = side === 'right' ? 0.35 : 1
        ctx.strokeStyle = color
        ctx.lineWidth = 2.25 * dpr
        ctx.shadowColor = color
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
        ctx.fillStyle = stage
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
      if (nose && ear) {
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineWidth = 2.25 * dpr
        ctx.shadowColor = color
        ctx.shadowBlur = 14 * dpr
        ctx.beginPath()
        ctx.arc(((nose.x + ear.x) / 2) * w, ((nose.y + ear.y) / 2) * h, 0.055 * unit, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

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
      ctx.strokeStyle = ink
      ctx.lineWidth = dpr
      ctx.setLineDash([3 * dpr, 5 * dpr])
      ctx.beginPath()
      ctx.moveTo(hipX, hipY)
      ctx.lineTo(hipX, ground)
      ctx.stroke()
      ctx.restore()

      ctx.font = `${20 * dpr}px ${mono}`
      ctx.textBaseline = 'middle'
      if (phase === 'Landing') {
        const y = ground + 18 * dpr
        const ax = ankle.x * w
        ctx.save()
        ctx.strokeStyle = color
        ctx.fillStyle = color
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
      if (hip && knee) {
        const [kx, ky] = px(knee)
        const [hx, hy] = px(hip)
        const [ax, ay] = px(ankle)
        const a1 = Math.atan2(hy - ky, hx - kx)
        const a2 = Math.atan2(ay - ky, ax - kx)
        let diff = a2 - a1
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        const radius = 0.07 * unit
        ctx.save()
        ctx.strokeStyle = color
        ctx.fillStyle = color
        ctx.lineWidth = 1.5 * dpr
        ctx.beginPath()
        ctx.arc(kx, ky, radius, a1, a1 + diff, diff < 0)
        ctx.stroke()
        const outward = a1 + diff / 2 + Math.PI
        ctx.textAlign = 'center'
        ctx.fillText(`${Math.round((Math.abs(diff) * 180) / Math.PI)}°`, kx + Math.cos(outward) * radius * 1.9, ky + Math.sin(outward) * radius * 1.9)
        ctx.restore()
      }
    }

    const observer = new ResizeObserver(([entry]) => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      cssWidth = entry.contentRect.width
      canvas.width = Math.round(entry.contentRect.width * dpr)
      canvas.height = Math.round(entry.contentRect.height * dpr)
      draw()
    })
    observer.observe(canvas)
    const unsubscribe = progress.on('change', draw)
    void document.fonts?.ready.then(draw)
    return () => {
      observer.disconnect()
      unsubscribe()
    }
  }, [progress, phaseRef, framing])

  return <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />
}
