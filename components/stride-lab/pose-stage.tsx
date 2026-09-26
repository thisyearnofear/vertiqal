'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { Upload } from 'lucide-react'
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
      className="relative aspect-video w-full overflow-hidden rounded-lg bg-stage"
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
        className="absolute inset-0 h-full w-full object-contain"
        muted
        loop
        playsInline
        autoPlay
        crossOrigin="anonymous"
        aria-label="Movement clip being analysed"
      />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />

      {!src && !dragging && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-stage-foreground">
          <Upload className="size-6" aria-hidden />
          <p className="text-balance text-lg font-medium">Drop a running clip here</p>
          <p className="max-w-sm text-pretty text-sm leading-relaxed opacity-70">
            Filmed side-on with the whole body in frame. The skeleton and measurements appear as it plays.
          </p>
        </div>
      )}

      {src && statusLabel && (
        <div className="absolute inset-x-0 top-4 flex justify-center">
          <p
            role="status"
            className="rounded-md bg-card px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-foreground"
          >
            {statusLabel}
          </p>
        </div>
      )}

      {dragging && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-stage/80 text-stage-foreground">
          <Upload className="size-6" aria-hidden />
          <p className="font-mono text-sm uppercase tracking-wider">Drop clip to analyse</p>
        </div>
      )}
    </div>
  )
}
