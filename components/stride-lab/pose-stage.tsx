'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { GaitSnapshot, GaitTracker } from '@/lib/metrics/gait'
import type { PoseSession } from '@/lib/pose/types'
import { drawOverlay, readOverlayTheme, videoContentRect, type OverlayTheme } from './draw-overlay'

interface PoseStageProps {
  videoRef: RefObject<HTMLVideoElement | null>
  src: string | null
  session: PoseSession | null
  tracker: GaitTracker
  statusLabel: string | null
  onSnapshot: (snapshot: GaitSnapshot) => void
  onFile: (file: File) => void
}

const SNAPSHOT_INTERVAL_MS = 120

export function PoseStage({
  videoRef,
  src,
  session,
  tracker,
  statusLabel,
  onSnapshot,
  onFile,
}: PoseStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragging, setDragging] = useState(false)

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
    let snapshot: GaitSnapshot | null = null
    let needsRedraw = true

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
        const now = performance.now()
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
  }, [session, tracker, videoRef, onSnapshot])

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

      {!src && !dragging && (
        <div className="absolute inset-0 flex animate-boot flex-col justify-between p-6 font-mono text-stage-foreground md:p-10">
          <div className="flex flex-col gap-1 text-lg leading-snug phosphor md:text-xl">
            <p>{'FORMA F-01 GAIT ANALYSER  ·  ROM v2.6'}</p>
            <p className="opacity-70">{'POSE ENGINE ........ 33 KEYPOINTS'}</p>
            <p className="opacity-70">{'SCALE ............. RUNNER HEIGHT'}</p>
            <p className="opacity-70">{'CHANNEL ........... SAGITTAL / SIDE-ON'}</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-4xl leading-none phosphor md:text-6xl">
              NO SIGNAL
              <span className="ml-2 inline-block animate-blink" aria-hidden>
                {'█'}
              </span>
            </p>
            <p className="max-w-md text-pretty text-lg leading-snug opacity-80 phosphor md:text-xl">
              {'> DROP A RUNNING CLIP ON THE SCREEN, OR PRESS LOAD CLIP.'}
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
