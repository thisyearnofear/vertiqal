'use client'

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { MovementSnapshot, MovementTracker, Sport } from '@/lib/metrics/readout'
import type { HeroFrame } from '@/lib/hero/frame'
import type { Pose, PoseSession } from '@/lib/pose/types'
import { cn } from '@/lib/utils'
import { BootScreen } from './boot-screen'
import { ProgressHud } from './progress-hud'
import { useAttractMode } from './use-attract-mode'
import { usePoseLoop } from './use-pose-loop'

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
  onValidationFrame?: (frame: { timeSec: number; pose: Pose | null; width: number; height: number; snapshot: MovementSnapshot }) => void
  /** Measurement progress for a loaded clip: pips fill per event, then a lock banner plays once. */
  progress?: { events: number; target: number; ready: boolean }
  /** Locked measurements pinned along the bottom of the screen once the clip is measured. */
  lockedMetrics?: { label: string; value: string; unit: string }[]
  /** Height was never entered, so distance figures in the HUD are estimates. */
  provisional?: boolean
  /** Shrink the screen on large displays while shopping results sit below it. */
  dense?: boolean
  /** Primary call to action shown on the idle screen. */
  idleAction?: ReactNode
  /** Height setter shown as a boot line on the idle screen. */
  heightControl?: ReactNode
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
  onValidationFrame,
  progress,
  lockedMetrics,
  provisional = false,
  dense = false,
  idleAction,
  heightControl,
}: PoseStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragging, setDragging] = useState(false)
  const idle = !src && !stream && !overlay

  // The video element doubles as clip player and camera preview.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    if (stream) void video.play().catch(() => {})
  }, [stream, videoRef])

  usePoseLoop({ videoRef, canvasRef, containerRef, session, tracker, onSnapshot, onKeyframe, onHero, onValidationFrame, themeKey })
  useAttractMode({ containerRef, canvasRef, active: idle, sport, themeKey })

  const showPips = src && progress && !statusLabel

  return (
    <div
      ref={containerRef}
      className={cn(
        'screen aspect-[4/5] w-full sm:aspect-video lg:aspect-auto',
        dense ? 'lg:h-[clamp(320px,42svh,420px)]' : 'lg:h-[clamp(500px,66svh,620px)]',
      )}
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

      {idle && !dragging && <BootScreen engine={engine} sport={sport} action={idleAction} heightControl={heightControl} />}

      {showPips && progress && <ProgressHud sport={sport} progress={progress} lockedMetrics={lockedMetrics} provisional={provisional} />}

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
