'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play, ScanEye } from 'lucide-react'
import { EXAMPLE_FOOTAGE } from '@/lib/fitting/example'
import {
  EXAMPLE_OBSERVATION_INTERVAL_MS,
  exampleTrackingStatus,
  shouldRunExampleTracking,
  type ExampleObservation,
  type ExampleTrackingStatus,
} from '@/lib/pose/example-observation'
import { createTrackerLoop } from '@/lib/pose/example-scheduler'
import { createOwnedSessionLoader } from '@/lib/pose/example-session'
import { frameQuality, usableKeypoint } from '@/lib/pose/framing'
import { mediapipeProvider } from '@/lib/pose/providers/mediapipe'
import type { FrameQuality, KeypointName, Pose, PoseSession } from '@/lib/pose/types'
import type { Sport } from '@/lib/metrics/readout'
import { cn } from '@/lib/utils'
import { drawOverlay, readOverlayTheme, videoContentRect, type OverlayTheme } from './draw-overlay'

interface ExampleObserverProps {
  sport: Sport
  themeKey: string
  localSession: PoseSession | null
  loadLocalSession: boolean
  localSessionFailed?: boolean
  onObservation?: (observation: ExampleObservation) => void
}

const EMPTY_FRAME: FrameQuality = { person: false, hips: false, feet: false }
const LABEL = 'text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved'
const SHORT_STATUS: Record<ExampleTrackingStatus, string> = {
  loading: 'Loading',
  tracking: 'Tracking',
  paused: 'Paused',
  hidden: 'Paused',
  disabled: 'Overlay off',
  unavailable: 'Unavailable',
}

function ClimberSketch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Synthetic climber illustration — not measured footage">
      <rect x="18" y="14" width="10" height="10" rx="2" fill="currentColor" fillOpacity={0.25} />
      <rect x="66" y="30" width="10" height="10" rx="2" fill="currentColor" fillOpacity={0.25} />
      <rect x="30" y="62" width="10" height="10" rx="2" fill="currentColor" fillOpacity={0.25} />
      <rect x="72" y="76" width="10" height="10" rx="2" fill="currentColor" fillOpacity={0.25} />
      <circle cx="48" cy="34" r="7" fill="currentColor" fillOpacity={0.2} stroke="currentColor" strokeWidth={2} />
      <path
        d="M48 42 L46 58 M48 46 L28 20 M48 46 L66 36 M46 58 L34 68 M46 58 L70 82"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ExampleObserver({ sport, themeKey, localSession, loadLocalSession, localSessionFailed = false, onObservation }: ExampleObserverProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ownSession, setOwnSession] = useState<PoseSession | null>(null)
  const [sessionFailed, setSessionFailed] = useState(false)
  const [overlayEnabled, setOverlayEnabled] = useState(true)
  const [mediaPlaying, setMediaPlaying] = useState(false)
  const [status, setStatus] = useState<ExampleTrackingStatus>('loading')
  const liveRef = useRef({ playing: false, enabled: true, docVisible: true, viewVisible: true, unavailable: false })
  const reportRef = useRef<ExampleObservation | null>(null)
  const syncRef = useRef<(() => void) | null>(null)

  const running = sport === 'running'
  const session = running ? (localSession ?? (loadLocalSession ? ownSession : null)) : null

  useEffect(() => {
    if (!running || !loadLocalSession) return
    setSessionFailed(false)
    const loader = createOwnedSessionLoader(mediapipeProvider.load, setOwnSession, () => setSessionFailed(true))
    return () => {
      loader.dispose()
      setOwnSession(null)
    }
  }, [running, loadLocalSession])

  useEffect(() => {
    if (!running) return
    const video = videoRef.current
    if (!video) return
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) void video.play().catch(() => {})
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => {
      if (mq.matches) video.pause()
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [running])

  useEffect(() => {
    if (!running) return
    const video = videoRef.current
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!video || !canvas || !container) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    liveRef.current.unavailable = false
    let theme: OverlayTheme = readOverlayTheme(container)
    let pose: Pose | null = null
    let needsRedraw = true

    const draw = () => {
      if (!needsRedraw) return
      needsRedraw = false
      ctx.clearRect(0, 0, container.clientWidth, container.clientHeight)
      if (!pose || !liveRef.current.enabled) return
      drawOverlay(ctx, videoContentRect(container.clientWidth, container.clientHeight, video.videoWidth, video.videoHeight), pose, null, theme)
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(container.clientWidth * dpr)
      canvas.height = Math.round(container.clientHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      theme = readOverlayTheme(container)
      needsRedraw = true
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    const report = (next: ExampleObservation) => {
      const last = reportRef.current
      if (
        last &&
        last.status === next.status &&
        last.framing.person === next.framing.person &&
        last.framing.hips === next.framing.hips &&
        last.framing.feet === next.framing.feet
      ) {
        return
      }
      reportRef.current = next
      setStatus(next.status)
      onObservation?.(next)
    }

    const failed = () => liveRef.current.unavailable || sessionFailed || localSessionFailed
    const visible = () => liveRef.current.docVisible && liveRef.current.viewVisible
    const currentStatus = (): ExampleTrackingStatus =>
      exampleTrackingStatus({
        playing: liveRef.current.playing,
        visible: visible(),
        enabled: liveRef.current.enabled,
        sessionReady: Boolean(session),
        unavailable: failed(),
      })

    const infer = () => {
      if (!session || video.readyState < 2) return
      const raw = session.poseAt(video)
      pose = null
      if (raw) {
        const filtered: Pose = {}
        for (const [name, keypoint] of Object.entries(raw) as [KeypointName, Pose[KeypointName]][]) {
          if (usableKeypoint(keypoint)) filtered[name] = keypoint
        }
        pose = filtered
      }
      needsRedraw = true
      report({ status: 'tracking', framing: frameQuality(pose) })
      draw()
    }

    const rafOnly = typeof (video as HTMLVideoElement).requestVideoFrameCallback !== 'function'
    const videoWithFrames = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number
      cancelVideoFrameCallback?: (handle: number) => void
    }
    const loop = createTrackerLoop({
      requestFrame: (cb) => (rafOnly ? requestAnimationFrame(cb) : videoWithFrames.requestVideoFrameCallback!(cb)),
      cancelFrame: (h) => (rafOnly ? cancelAnimationFrame(h) : videoWithFrames.cancelVideoFrameCallback?.(h)),
      canRun: () =>
        shouldRunExampleTracking({
          playing: liveRef.current.playing,
          visible: visible() && !document.hidden,
          enabled: liveRef.current.enabled,
          sessionReady: Boolean(session) && !failed(),
        }),
      minIntervalMs: EXAMPLE_OBSERVATION_INTERVAL_MS,
      onInfer: infer,
      onError: () => {
        liveRef.current.unavailable = true
        report({ status: 'unavailable', framing: reportRef.current?.framing ?? EMPTY_FRAME })
      },
    })
    const sync = () => {
      report({ status: currentStatus(), framing: reportRef.current?.framing ?? EMPTY_FRAME })
      loop.sync()
    }
    syncRef.current = sync
    const onPlay = () => {
      liveRef.current.playing = true
      liveRef.current.docVisible = !document.hidden
      setMediaPlaying(true)
      sync()
    }
    const onPause = () => {
      liveRef.current.playing = false
      setMediaPlaying(false)
      sync()
    }
    const onSeeked = () => {
      pose = null
      needsRedraw = true
      draw()
      loop.sync()
    }
    const onVisibility = () => {
      liveRef.current.docVisible = !document.hidden
      if (document.hidden) video.pause()
      sync()
    }
    const onIntersect = (entries: IntersectionObserverEntry[]) => {
      const entry = entries[entries.length - 1]
      if (!entry) return
      liveRef.current.viewVisible = entry.isIntersecting
      if (!entry.isIntersecting) video.pause()
      sync()
    }
    const intersectionObserver =
      'IntersectionObserver' in window ? new IntersectionObserver(onIntersect) : null
    intersectionObserver?.observe(container)

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('seeked', onSeeked)
    document.addEventListener('visibilitychange', onVisibility)

    liveRef.current.docVisible = !document.hidden
    liveRef.current.playing = !video.paused && !video.ended
    sync()

    return () => {
      syncRef.current = null
      loop.dispose()
      observer.disconnect()
      intersectionObserver?.disconnect()
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('seeked', onSeeked)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [running, session, sessionFailed, localSessionFailed, themeKey, onObservation])

  useEffect(() => {
    liveRef.current.enabled = overlayEnabled
    if (!overlayEnabled) {
      const ctx = canvasRef.current?.getContext('2d')
      const container = containerRef.current
      if (ctx && container) ctx.clearRect(0, 0, container.clientWidth, container.clientHeight)
    }
    syncRef.current?.()
  }, [overlayEnabled])

  if (!running) {
    return (
      <div className="flex flex-col gap-3">
        <p id="example-media-heading" tabIndex={-1} className={cn(LABEL, 'focus-visible:outline-none')}>
          Synthetic example
        </p>
        <div className="screen flex aspect-[4/5] items-center justify-center sm:aspect-video lg:aspect-auto lg:h-[clamp(500px,66svh,620px)]">
          <ClimberSketch className="max-h-48 w-full max-w-xs text-stage-foreground" />
        </div>
        <p className="font-mono text-xs uppercase leading-snug text-muted-foreground">
          Loaded locally · synthetic illustration · no footage
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p id="example-media-heading" tabIndex={-1} className={cn(LABEL, 'focus-visible:outline-none')}>
        AI-generated example
      </p>
      <div ref={containerRef} className="screen relative aspect-[4/3] w-full sm:aspect-video lg:aspect-auto lg:h-[clamp(500px,66svh,620px)]">
        <video
          ref={videoRef}
          src={EXAMPLE_FOOTAGE.src}
          poster={EXAMPLE_FOOTAGE.poster}
          aria-label="AI-generated runner illustration; not real-person movement analysis"
          muted
          playsInline
          controls
          loop
          className="absolute inset-0 h-full w-full object-contain opacity-80 contrast-110 grayscale sepia-[.35]"
        />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const video = videoRef.current
            if (!video) return
            if (video.paused) void video.play().catch(() => {})
            else video.pause()
          }}
          aria-label={mediaPlaying ? 'Pause example clip' : 'Play example clip'}
          className="well flex min-h-11 min-w-11 items-center justify-center rounded-md text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {mediaPlaying ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        </button>
        <button
          type="button"
          aria-pressed={overlayEnabled}
          onClick={() => setOverlayEnabled((v) => !v)}
          className={cn(
            'well flex min-h-11 items-center gap-2 rounded-md px-3 text-xs font-semibold uppercase tracking-[0.18em] text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            !overlayEnabled && 'opacity-70',
          )}
        >
          <ScanEye className="size-4" aria-hidden />
          Pose overlay
          <span className="led" data-state={overlayEnabled ? 'on' : 'off'} aria-hidden />
        </button>
        <p role="status" className="font-mono text-xs leading-snug text-muted-foreground">
          {SHORT_STATUS[status]}
        </p>
      </div>
      <p className="font-mono text-xs uppercase leading-snug text-muted-foreground">
        {`Served locally · ${EXAMPLE_FOOTAGE.credit} · ${EXAMPLE_FOOTAGE.range}`}
      </p>
    </div>
  )
}
