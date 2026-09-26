'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Upload } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { GaitTracker, type GaitSnapshot } from '@/lib/metrics/gait'
import { POSE_PROVIDERS, getPoseProvider } from '@/lib/pose/providers'
import type { PoseSession } from '@/lib/pose/types'
import { cn } from '@/lib/utils'
import { AgentPanel } from './agent/agent-panel'
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

  const ledState = sessionState.status === 'ready' ? 'on' : sessionState.status === 'loading' ? 'busy' : 'off'
  const ledLabel =
    sessionState.status === 'ready' ? 'Vision ready' : sessionState.status === 'loading' ? 'Warming up' : 'No vision'

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 lg:py-10">
      <header className="housing flex flex-col gap-5 rounded-2xl px-5 py-4 md:flex-row md:items-center md:justify-between md:px-7">
        <div className="flex items-center gap-5">
          <p className="font-mono text-5xl leading-none tracking-wider text-foreground engraved" aria-label="Forma">
            FORMA
          </p>
          <div className="flex flex-col gap-0.5 border-l border-border pl-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
              Stride lab · Model F-01
            </p>
            <h1 className="text-balance text-lg font-semibold leading-snug text-foreground md:text-xl">
              Your body is the search query.
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground engraved">
            <span className="led" data-state={ledState} aria-hidden />
            <span role="status">{ledLabel}</span>
          </p>
          <nav aria-label="Sport" className="well flex gap-1 rounded-lg p-1">
            <span
              aria-current="page"
              className="housing rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground"
            >
              Running
            </span>
            <span
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              aria-disabled
            >
              Climbing <span className="font-mono text-base normal-case tracking-normal">soon</span>
            </span>
          </nav>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section
          aria-label="Movement analysis"
          className="housing flex min-w-0 flex-col gap-5 rounded-2xl p-4 md:p-6"
        >
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
              CH-1 · Sagittal monitor
            </p>
            {clip && (
              <p className="max-w-56 truncate font-mono text-lg leading-none text-muted-foreground" title={clip.name}>
                {clip.name}
              </p>
            )}
          </div>

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

          <div className="flex flex-wrap items-center justify-between gap-4 px-1">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon-lg" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
              </Button>
              <Button variant="outline" size="icon-lg" onClick={restart} aria-label="Restart analysis">
                <RotateCcw aria-hidden />
              </Button>
              <div role="group" aria-label="Playback speed" className="well flex gap-1 rounded-lg p-1">
                {SPEEDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => changeSpeed(value)}
                    aria-pressed={speed === value}
                    className={cn(
                      'rounded-md px-2.5 py-0.5 font-mono text-lg leading-tight tabular-nums',
                      speed === value ? 'housing text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {`${value}×`}
                  </button>
                ))}
              </div>
            </div>

            <label
              className={cn(
                buttonVariants({ size: 'lg' }),
                'cursor-pointer px-4 focus-within:ring-3 focus-within:ring-ring/50',
              )}
            >
              <Upload aria-hidden />
              Load clip
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
          <p className="px-1 text-sm leading-relaxed text-muted-foreground">
            Best results: side-on, whole body in frame, 10 seconds on a treadmill or flat path.
          </p>
        </section>

        <aside className="housing flex flex-col gap-6 rounded-2xl p-5">
          <GaitReadout snapshot={snapshot} />

          <div className="flex flex-col gap-2 border-t border-border pt-5">
            <label
              htmlFor="runner-height"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved"
            >
              Runner height
            </label>
            <div className="flex items-center gap-3">
              <input
                id="runner-height"
                type="number"
                min={120}
                max={220}
                value={heightCm}
                onChange={(e) => setHeightCm(Number(e.target.value))}
                onBlur={() => restartAnalysis(heightCm)}
                className="well h-10 w-24 rounded-md px-3 font-mono text-2xl tabular-nums text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <span className="text-sm text-muted-foreground">cm · scales distances</span>
            </div>
          </div>

          <ProviderPicker providers={POSE_PROVIDERS} value={providerId} onChange={setProviderId} />
        </aside>

        <div className="lg:col-span-2">
          <AgentPanel snapshot={snapshot} heightCm={heightCm} />
        </div>
      </main>
    </div>
  )
}
