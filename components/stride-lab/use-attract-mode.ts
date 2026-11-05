'use client'

import { useEffect, type RefObject } from 'react'
import type { Sport } from '@/lib/metrics/readout'
import { attractClimb } from './attract-climber'
import { attractPose } from './attract-runner'
import { drawOverlay, readOverlayTheme } from './draw-overlay'

const CLIMB_MOVE_SEC = 0.9

interface AttractModeOptions {
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  /** Only draws while the stage is idle — no clip, stream or overlay. */
  active: boolean
  sport: Sport
  /** Re-reads the phosphor palette when the persona changes. */
  themeKey: string
}

/**
 * Attract mode: like an arcade cabinet, the idle monitor demonstrates what it
 * watches for — a synthetic climber or runner looping on the CRT. Frozen to a
 * single frame under prefers-reduced-motion.
 */
export function useAttractMode({ containerRef, canvasRef, active, sport, themeKey }: AttractModeOptions) {
  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    const container = containerRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !container || !ctx) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const theme = readOverlayTheme(container)
    const start = performance.now()
    let frame = 0

    const draw = (now: number) => {
      const w = container.clientWidth
      const h = container.clientHeight
      const t = still ? 0.2 : (now - start) / 1000
      // Narrow screens stack the copy below the figure, so the figure moves up and shrinks.
      const narrow = w < 640
      const groundY = narrow ? 0.54 : 0.86
      ctx.clearRect(0, 0, w, h)
      if (sport === 'climbing') {
        const climb = attractClimb(t / CLIMB_MOVE_SEC, {
          centerX: narrow ? 0.6 : 0.62,
          height: narrow ? 0.34 : 0.62,
          anchorY: narrow ? 0.32 : 0.52,
          aspect: h / w,
        })
        ctx.save()
        ctx.strokeStyle = theme.bone
        ctx.globalAlpha = 0.35
        ctx.lineWidth = 2
        ctx.setLineDash([10, 14])
        ctx.beginPath()
        ctx.moveTo(climb.wallX * w, 0)
        ctx.lineTo(climb.wallX * w, h)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = theme.bone
        for (const hold of climb.holds) {
          if (hold.x > 0.98) continue
          ctx.globalAlpha = hold.held ? 0.8 : 0.3
          ctx.beginPath()
          ctx.arc(hold.x * w - 4, hold.y * h, hold.kind === 'hand' ? 6 : 5, Math.PI / 2, (Math.PI * 3) / 2)
          ctx.fill()
        }
        ctx.restore()
        drawOverlay(ctx, { x: 0, y: 0, w, h }, climb.pose, null, theme)
        if (!still) frame = requestAnimationFrame(draw)
        return
      }
      ctx.save()
      ctx.strokeStyle = theme.bone
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 2
      ctx.setLineDash([10, 14])
      ctx.lineDashOffset = t * 190
      ctx.beginPath()
      ctx.moveTo(w * (narrow ? 0.4 : 0.56), groundY * h + 8)
      ctx.lineTo(w * 0.96, groundY * h + 8)
      ctx.stroke()
      ctx.restore()
      const pose = attractPose(t, { centerX: narrow ? 0.68 : 0.74, height: narrow ? 0.26 : 0.62, groundY, aspect: h / w })
      drawOverlay(ctx, { x: 0, y: 0, w, h }, pose, null, theme)
      if (!still) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      ctx.clearRect(0, 0, container.clientWidth, container.clientHeight)
    }
  }, [active, sport, themeKey, canvasRef, containerRef])
}
