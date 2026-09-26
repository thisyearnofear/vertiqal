'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Upload } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { GaitTracker, type GaitSnapshot } from '@/lib/metrics/gait'
import { POSE_PROVIDERS, getPoseProvider } from '@/lib/pose/providers'
import type { PoseSession } from '@/lib/pose/types'
import { cn } from '@/lib/utils'
import { GaitReadout } from './gait-readout'
import { PoseStage } from './pose-stage'
import { ProviderPicker } from './provider-picker'

interface Clip {
  url: string
  name: string
}

const DEFAULT_CLIP: Clip | null = null
const SPEEDS = [1, 0.5, 0.25]
const DEFAULT_HEIGHT_CM = 175

type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; session: PoseSession }
  | { status: 'error'; message: string }

export function StrideLab() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [clip, setClip] = useState<Clip | null>(DEFAULT_CLIP)
  const [providerId, setProviderId] = useState(POSE_PROVIDERS[0].id)
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'loading' })
  const [heightCm, setHeightCm] = useState(DEFAULT_HEIGHT_CM)
  const [tracker, setTracker] = useState(() => new GaitTracker(DEFAULT_HEIGHT_CM))
  const [snapshot, setSnapshot] = useState<GaitSnapshot | null>(null)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    let cancelled = false
    let session: PoseSession | null = null
    setSessionState({ status: 'loading' })
    getPoseProvider(providerId)
      .load()
      .then((loaded) => {
        if (cancelled) return loaded.dispose()
        session = loaded
        setSessionState({ status: 'ready', session: loaded })
      })
      .catch((error: Error) => {
        if (!cancelled) setSessionState({ status: 'error', message: error.message })
      })
    return () => {
      cancelled = true
      session?.dispose()
    }
  }, [providerId])

  const restartAnalysis = useCallback((height: number) => {
    setTracker(new GaitTracker(height))
    setSnapshot(null)
  }, [])

  const loadFile = useCallback(
    (file: File) => {
      setClip((previous) => {
        if (previous?.url.startsWith('blob:')) URL.revokeObjectURL(previous.url)
        return { url: URL.createObjectURL(file), name: file.name }
      })
      setPlaying(true)
      restartAnalysis(heightCm)
    },
    [heightCm, restartAnalysis],
  )

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play()
      setPlaying(true)
    } else {
      video.pause()
      setPlaying(false)
    }
  }

  const restart = () => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    restartAnalysis(heightCm)
    void video.play()
    setPlaying(true)
  }

  const changeSpeed = (value: number) => {
    setSpeed(value)
    if (videoRef.current) videoRef.current.playbackRate = value
  }

  const statusLabel =
    sessionState.status === 'loading'
      ? 'Loading pose model'
      : sessionState.status === 'error'
        ? `Provider unavailable: ${sessionState.message}`
        : null

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 lg:py-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Forma · Stride lab</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Your body is the search query.
          </h1>
        </div>
        <nav aria-label="Sport" className="flex gap-1 rounded-md bg-muted p-1">
          <span
            aria-current="page"
            className="rounded bg-card px-3 py-1.5 text-sm font-medium text-foreground"
          >
            Running
          </span>
          <span className="px-3 py-1.5 text-sm text-muted-foreground" aria-disabled>
            Climbing <span className="font-mono text-xs">soon</span>
          </span>
        </nav>
      </header>

      <main className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Movement analysis" className="flex min-w-0 flex-col gap-3">
          <PoseStage
            key={clip?.url ?? 'empty'}
            videoRef={videoRef}
            src={clip?.url ?? null}
            session={sessionState.status === 'ready' ? sessionState.session : null}
            tracker={tracker}
            statusLabel={statusLabel}
            onSnapshot={setSnapshot}
            onFile={loadFile}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
              </Button>
              <Button variant="outline" size="icon" onClick={restart} aria-label="Restart analysis">
                <RotateCcw aria-hidden />
              </Button>
              <div role="group" aria-label="Playback speed" className="flex gap-1 rounded-md bg-muted p-1">
                {SPEEDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => changeSpeed(value)}
                    aria-pressed={speed === value}
                    className={cn(
                      'rounded px-2.5 py-1 font-mono text-xs tabular-nums',
                      speed === value ? 'bg-card text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {`${value}×`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {clip && (
                <p className="max-w-48 truncate font-mono text-xs text-muted-foreground" title={clip.name}>
                  {clip.name}
                </p>
              )}
              <label className={cn(buttonVariants(), 'cursor-pointer focus-within:ring-3 focus-within:ring-ring/50')}>
                <Upload aria-hidden />
                Upload clip
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) loadFile(file)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Best results: side-on, whole body in frame, 10 seconds on a treadmill or flat path.
          </p>
        </section>

        <aside className="flex flex-col gap-6 rounded-lg border border-border bg-card p-5">
          <GaitReadout snapshot={snapshot} />

          <div className="flex flex-col gap-2">
            <label htmlFor="runner-height" className="text-sm font-semibold text-foreground">
              Runner height
            </label>
            <div className="flex items-center gap-2">
              <input
                id="runner-height"
                type="number"
                min={120}
                max={220}
                value={heightCm}
                onChange={(e) => setHeightCm(Number(e.target.value))}
                onBlur={() => restartAnalysis(heightCm)}
                className="h-9 w-24 rounded-md border border-input bg-background px-3 font-mono text-sm tabular-nums text-foreground"
              />
              <span className="font-mono text-xs text-muted-foreground">cm · scales distances</span>
            </div>
          </div>

          <ProviderPicker providers={POSE_PROVIDERS} value={providerId} onChange={setProviderId} />
        </aside>
      </main>
    </div>
  )
}
