'use client'

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { SPORTS, type MovementSnapshot, type MovementTracker, type Sport } from '@/lib/metrics/readout'
import { captureHero, heroScore, type HeroFrame } from '@/lib/hero/frame'
import type { Pose, PoseSession } from '@/lib/pose/types'
import { drawOverlay, readOverlayTheme, videoContentRect, type OverlayTheme } from './draw-overlay'

export type EngineState = 'loading' | 'ready' | 'error'

export interface Keyframe {
  dataUrl: string
  label: string
}

interface PoseStageProps {
  videoRef: RefObject<HTMLVideoElement | null>
  src: string | null
  stream?: MediaStream | null
  /** Replaces the idle boot screen, e.g. a live-capture countdown. */
  overlay?: ReactNode
  onKeyframe?: (frame: Keyframe) => void
  /** Called whenever a more expressive clean still (longest stride, highest reach) is found. */
  onHero?: (frame: HeroFrame) => void
  session: PoseSession | null
  tracker: MovementTracker
  sport: Sport
  engine: EngineState
  /** Changes when the screen tint changes, so the canvas re-reads its colours. */
  themeKey: string
  statusLabel: string | null
  onSnapshot: (snapshot: MovementSnapshot) => void
  onFile: (file: File) => void
}

const ENGINE_LINE: Record<EngineState, string> = {
  loading: 'WARMING UP',
  ready: '33 KEYPOINTS · OK',
  error: 'OFFLINE',
}

function BootLine({ index, children }: { index: number; children: string }) {
  return (
    <p className="animate-type-in opacity-70" style={{ animationDelay: `${0.35 + index * 0.22}s` }}>
      {children}
    </p>
  )
}

const SNAPSHOT_INTERVAL_MS = 120
/** Grab a still (with skeleton) on these event counts, for Grok vision review. */
const KEYFRAME_EVENTS = new Set([3, 6, 9])
const KEYFRAME_WIDTH = 640
const TRAIL_LENGTH = 10
const HERO_INTERVAL_MS = 250
/** A new hero must beat the current one by this factor, so near-ties don't churn the card. */
const HERO_MARGIN = 1.04

const eventCount = (s: MovementSnapshot) => (s.sport === 'running' ? s.totalStrikes : s.totalPlacements)

function captureKeyframe(video: HTMLVideoElement, pose: ReturnType<PoseSession['poseAt']>, snapshot: MovementSnapshot, theme: OverlayTheme) {
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

export function PoseStage({
  videoRef,
  src,
  stream = null,
  overlay,
  onKeyframe,
  onHero,
  session,
  tracker,
  sport,
  engine,
  themeKey,
  statusLabel,
  onSnapshot,
  onFile,
}: PoseStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    if (stream) void video.play().catch(() => {})
  }, [stream, videoRef])

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
    let pose: ReturnType<PoseSession['poseAt']> = null
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
      const rect = videoContentRect(
        container.clientWidth,
        container.clientHeight,
        video.videoWidth,
        video.videoHeight,
      )
      drawOverlay(ctx, rect, pose, snapshot, theme)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [session, tracker, videoRef, onSnapshot, onKeyframe, onHero, themeKey])

  return (
    <div
      ref={containerRef}
      className="screen aspect-video w-full"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file?.type.startsWith('video/')) onFile(file)
      }}
    >
      <video
        ref={videoRef}
        src={src ?? undefined}
        className="absolute inset-0 h-full w-full object-contain opacity-80 contrast-110 grayscale sepia-[.35]"
        muted
        loop
        playsInline
        autoPlay
        crossOrigin="anonymous"
        aria-label="Movement clip being analysed"
      />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />

      {overlay && !dragging && <div className="absolute inset-0 z-10">{overlay}</div>}

      {!src && !stream && !overlay && !dragging && (
        <div className="absolute inset-0 flex animate-boot flex-col justify-between p-6 font-mono text-stage-foreground md:p-10">
          <div className="flex flex-col gap-1 text-lg leading-snug phosphor md:text-xl">
            <p>{'VERTIQAL V-01 MOVEMENT ANALYSER  ·  ROM v3.0'}</p>
            <BootLine index={0}>{`POSE ENGINE ........ ${ENGINE_LINE[engine]}`}</BootLine>
            <BootLine index={1}>{`MODE .............. ${SPORTS[sport].label.toUpperCase()}`}</BootLine>
            <BootLine index={2}>{`CHANNEL ........... ${SPORTS[sport].channel}`}</BootLine>
            <BootLine index={3}>{'FORMA UNIT ........ ONLINE'}</BootLine>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-4xl leading-none phosphor md:text-6xl">
              NO SIGNAL
              <span className="ml-2 inline-block animate-blink" aria-hidden>
                {'█'}
              </span>
            </p>
            <p className="max-w-md text-pretty text-lg leading-snug opacity-80 phosphor md:text-xl">
              {`> ${SPORTS[sport].dropHint}`}
            </p>
          </div>
        </div>
      )}

      {src && statusLabel && (
        <div className="absolute inset-x-0 top-5 z-10 flex justify-center">
          <p
            role="status"
            className="rounded border border-stage-foreground/50 bg-stage/80 px-3 py-0.5 font-mono text-lg uppercase text-stage-foreground phosphor"
          >
            {`${statusLabel}…`}
          </p>
        </div>
      )}

      {dragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-stage/85">
          <p className="font-mono text-3xl uppercase text-stage-foreground phosphor">{'[ RELEASE TO ANALYSE ]'}</p>
        </div>
      )}
    </div>
  )
}
