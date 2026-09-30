'use client'

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { SPORTS, type MovementSnapshot, type MovementTracker, type Sport } from '@/lib/metrics/readout'
import { captureHero, heroScore, type HeroFrame } from '@/lib/hero/frame'
import type { Pose, PoseSession } from '@/lib/pose/types'
import { cn } from '@/lib/utils'
import { attractClimb } from './attract-climber'
import { attractPose } from './attract-runner'

const CLIMB_MOVE_SEC = 0.9
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
  /** Measurement progress for a loaded clip: pips fill per event, then a lock banner plays once. */
  progress?: { events: number; target: number; ready: boolean }
}

const ENGINE_LINE: Record<EngineState, string> = {
  loading: 'WARMING UP',
  ready: '33 KEYPOINTS · OK',
  error: 'OFFLINE',
}

const PROMISE: Record<Sport, string> = {
  running: 'Record or upload 20 seconds of you running. Get shoes matched to how you actually move.',
  climbing: 'Record or upload up to 45 seconds of one climb. Get shoes matched to how you actually move.',
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
  progress,
}: PoseStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragging, setDragging] = useState(false)
  const idle = !src && !stream && !overlay

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

  // Attract mode: like an arcade cabinet, the idle monitor demonstrates what it watches for.
  useEffect(() => {
    if (!idle) return
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
      const groundY = 0.86
      ctx.clearRect(0, 0, w, h)
      if (sport === 'climbing') {
        const climb = attractClimb(t / CLIMB_MOVE_SEC, {
          centerX: w < 640 ? 0.74 : 0.7,
          height: w < 640 ? 0.5 : 0.62,
          anchorY: 0.52,
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
      ctx.moveTo(w * 0.56, groundY * h + 8)
      ctx.lineTo(w * 0.96, groundY * h + 8)
      ctx.stroke()
      ctx.restore()
      const pose = attractPose(t, { centerX: w < 640 ? 0.78 : 0.74, height: w < 640 ? 0.5 : 0.62, groundY, aspect: h / w })
      drawOverlay(ctx, { x: 0, y: 0, w, h }, pose, null, theme)
      if (!still) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      ctx.clearRect(0, 0, container.clientWidth, container.clientHeight)
    }
  }, [idle, sport, themeKey])

  const showPips = src && progress && !statusLabel

  return (
    <div
      ref={containerRef}
      className="screen aspect-[4/3] w-full sm:aspect-video lg:aspect-[21/10]"
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

      {idle && !dragging && (
        <div className="absolute inset-0 z-10 flex animate-boot flex-col justify-between p-5 font-mono text-stage-foreground md:p-10">
          <div className="flex flex-col gap-1 text-base leading-snug phosphor md:text-xl">
            <div className="hidden flex-col gap-1 sm:flex">
              <BootLine index={0}>{`POSE ENGINE ........ ${ENGINE_LINE[engine]}`}</BootLine>
              <BootLine index={1}>{`MODE .............. ${SPORTS[sport].label.toUpperCase()}`}</BootLine>
            </div>
          </div>
          <div className={'flex w-3/5 flex-col items-start gap-3 md:w-1/2'}>
            <p className="text-2xl leading-none phosphor md:text-4xl">READY FOR YOUR CLIP</p>
            <p className="text-pretty text-lg leading-snug phosphor md:text-2xl">{PROMISE[sport]}</p>
            <p className="hidden text-pretty text-base leading-snug opacity-70 sm:block">{'> OR DROP A CLIP ON THIS SCREEN'}</p>
          </div>
          <p className="absolute bottom-3 right-4 text-xs uppercase tracking-wider opacity-60 md:bottom-4 md:right-6">
            Illustration · not a video analysis
          </p>
        </div>
      )}

      {showPips && !progress.ready && (
        <div className="absolute left-4 top-4 z-10 flex items-center gap-3 rounded border border-stage-foreground/40 bg-stage/80 px-3 py-1.5 font-mono text-lg leading-none text-stage-foreground phosphor md:left-6 md:top-6">
          <span>{SPORTS[sport].events.toUpperCase()}</span>
          <span className="flex gap-1" aria-hidden>
            {Array.from({ length: progress.target }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'h-4 w-2 rounded-[1px] border border-stage-foreground/60',
                  i < progress.events && 'animate-pip bg-stage-foreground',
                )}
              />
            ))}
          </span>
          <span className="tabular-nums">{`${Math.min(progress.events, progress.target)}/${progress.target}`}</span>
        </div>
      )}

      {showPips && progress.ready && (
        <>
          <div className="pointer-events-none absolute inset-0 z-10 animate-lock-flash bg-stage-foreground opacity-0" aria-hidden />
          <div className="pointer-events-none absolute inset-0 z-20 flex animate-lock-banner items-center justify-center motion-reduce:hidden" aria-hidden>
            <p className="rounded border-2 border-stage-foreground bg-stage/85 px-5 py-2 font-mono text-3xl uppercase leading-none text-stage-foreground phosphor md:text-5xl">
              {'Measurements locked'}
            </p>
          </div>
        </>
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
