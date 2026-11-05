'use client'

import { useEffect, type RefObject } from 'react'
import { SPORTS, type MovementSnapshot, type MovementTracker } from '@/lib/metrics/readout'
import { captureHero, heroScore, type HeroFrame } from '@/lib/hero/frame'
import type { Pose, PoseSession } from '@/lib/pose/types'
import { drawOverlay, readOverlayTheme, videoContentRect, type OverlayTheme } from './draw-overlay'
import type { Keyframe } from './pose-stage'

const SNAPSHOT_INTERVAL_MS = 120
/** Grab a still (with skeleton) on these event counts, for Grok vision review. */
const KEYFRAME_EVENTS = new Set([3, 6, 9])
const KEYFRAME_WIDTH = 640
const TRAIL_LENGTH = 10
const HERO_INTERVAL_MS = 250
/** A new hero must beat the current one by this factor, so near-ties don't churn the card. */
const HERO_MARGIN = 1.04

const eventCount = (s: MovementSnapshot) => (s.sport === 'running' ? s.totalStrikes : s.totalPlacements)

function captureKeyframe(video: HTMLVideoElement, pose: Pose | null, snapshot: MovementSnapshot, theme: OverlayTheme) {
  const width = KEYFRAME_WIDTH
  const height = Math.round((video.videoHeight / video.videoWidth) * width)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, width, height)
  drawOverlay(ctx, videoContentRect(width, height, video.videoWidth, video.videoHeight), pose, snapshot, theme)
  return canvas.toDataURL('image/jpeg', 0.72)
}

interface PoseLoopOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  containerRef: RefObject<HTMLDivElement | null>
  session: PoseSession | null
  tracker: MovementTracker
  onSnapshot: (snapshot: MovementSnapshot) => void
  onKeyframe?: (frame: Keyframe) => void
  /** Called whenever a more expressive clean still (longest stride, highest reach) is found. */
  onHero?: (frame: HeroFrame) => void
  onValidationFrame?: (frame: { timeSec: number; pose: Pose | null; width: number; height: number; snapshot: MovementSnapshot }) => void
  /** Changes when the screen tint changes, so the canvas re-reads its colours. */
  themeKey: string
}

/**
 * The per-frame pipeline: pose detection -> tracker -> snapshot/keyframe/hero
 * emission -> skeleton overlay redraw. Runs one rAF loop while a clip or stream
 * is mounted; only redraws when the video time actually advances.
 */
export function usePoseLoop({ videoRef, canvasRef, containerRef, session, tracker, onSnapshot, onKeyframe, onHero, onValidationFrame, themeKey }: PoseLoopOptions) {
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!video || !canvas || !container) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let theme: OverlayTheme = readOverlayTheme(container)
    let frame = 0
    let lastVideoTime = -1
    let lastEmit = 0
    let pose: Pose | null = null
    let snapshot: MovementSnapshot | null = null
    let needsRedraw = true
    let lastEvents = 0
    const history: Pose[] = []
    let bestHero = 0
    let lastHeroAt = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(container.clientWidth * dpr)
      canvas.height = Math.round(container.clientHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      theme = readOverlayTheme(container)
      needsRedraw = true
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    const loop = () => {
      frame = requestAnimationFrame(loop)
      if (!session || video.readyState < 2) return

      const time = video.currentTime
      if (time !== lastVideoTime) {
        lastVideoTime = time
        pose = session.poseAt(video)
        snapshot = tracker.update(time, pose, video.videoWidth, video.videoHeight)
        onValidationFrame?.({ timeSec: time, pose, width: video.videoWidth, height: video.videoHeight, snapshot })
        needsRedraw = true
        const events = eventCount(snapshot)
        if (events !== lastEvents) {
          lastEvents = events
          if (onKeyframe && KEYFRAME_EVENTS.has(events)) {
            const dataUrl = captureKeyframe(video, pose, snapshot, theme)
            if (dataUrl) onKeyframe({ dataUrl, label: `${SPORTS[snapshot.sport].events} #${events}` })
          }
        }
        const now = performance.now()
        if (onHero && pose) {
          history.push(pose)
          if (history.length > TRAIL_LENGTH) history.shift()
          const score = heroScore(pose, snapshot.sport, video.videoWidth, video.videoHeight)
          if (score !== null && score > bestHero * HERO_MARGIN && now - lastHeroAt > HERO_INTERVAL_MS) {
            bestHero = score
            lastHeroAt = now
            const hero = captureHero(video, pose, history, snapshot.sport, score)
            if (hero) onHero(hero)
          }
        }
        if (now - lastEmit > SNAPSHOT_INTERVAL_MS) {
          lastEmit = now
          onSnapshot(snapshot)
        }
      }

      if (!needsRedraw) return
      needsRedraw = false
      ctx.clearRect(0, 0, container.clientWidth, container.clientHeight)
      const rect = videoContentRect(container.clientWidth, container.clientHeight, video.videoWidth, video.videoHeight)
      drawOverlay(ctx, rect, pose, snapshot, theme)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [session, tracker, videoRef, canvasRef, containerRef, onSnapshot, onKeyframe, onHero, onValidationFrame, themeKey])
}
