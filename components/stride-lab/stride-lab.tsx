'use client'

import { useCallback, useEffect, useEffectEvent, useId, useMemo, useRef, useState, useTransition, type CSSProperties } from 'react'
import { Camera, Pause, Pin, PinOff, Play, RotateCcw, Square, Upload } from 'lucide-react'
import { savePersona } from '@/app/actions'
import { FormaConsole, FormaTuner } from '@/components/forma/forma-console'
import { Button, buttonVariants } from '@/components/ui/button'
import { EMPTY_NOTES, contextLines, type FittingNotesState } from '@/lib/agent/fitting-notes'
import { cueFor } from '@/lib/coach'
import { SPORTS, compareMetric, createTracker, readoutOf, type MovementSnapshot, type Readout, type Sport } from '@/lib/metrics/readout'
import { PHOSPHOR_COLOR, speechFor, type Mood, type Persona } from '@/lib/persona'
import { POSE_PROVIDERS, getPoseProvider } from '@/lib/pose/providers'
import type { PoseSession } from '@/lib/pose/types'
import { cn } from '@/lib/utils'
import { AgentPanel } from './agent/agent-panel'
import { useGearAgent } from './agent/use-gear-agent'
import { FittingNotes } from './fitting-notes'
import { GaitReadout } from './gait-readout'
import { LiveOverlay } from './live-overlay'
import { PoseStage, type Keyframe } from './pose-stage'
import { ProviderPicker } from './provider-picker'
import { useLiveCamera } from './use-live-camera'
import { useVoice } from './use-voice'

interface Clip {
  url: string
  name: string
}

interface Baseline {
  readout: Readout
  clipName: string
}

const SPEEDS = [1, 0.5, 0.25]
const DEFAULT_HEIGHT_CM = 175
const SPORT_LIST: Sport[] = ['running', 'climbing']
const CAPTURE_SECONDS: Record<Sport, number> = { running: 20, climbing: 45 }
const MAX_KEYFRAMES = 3
const CUE_GAP_MS = 6000
const REPEAT_CUE_GAP_MS = 14000
const ANNOUNCED_MOODS = new Set<Mood>(['ready', 'pleased', 'asking', 'working', 'sad'])

type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; session: PoseSession }
  | { status: 'error'; message: string }

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))

export function StrideLab({ initialPersona }: { initialPersona: Persona }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const tunerId = useId()
  const [clip, setClip] = useState<Clip | null>(null)
  const [sport, setSport] = useState<Sport>('running')
  const [providerId, setProviderId] = useState(POSE_PROVIDERS[0].id)
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'loading' })
  const [providerStatus, setProviderStatus] = useState<string | null>(null)
  const [heightCm, setHeightCm] = useState(DEFAULT_HEIGHT_CM)
  const [tracker, setTracker] = useState(() => createTracker('running', DEFAULT_HEIGHT_CM))
  const [snapshot, setSnapshot] = useState<MovementSnapshot | null>(null)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [baseline, setBaseline] = useState<Baseline | null>(null)
  const [persona, setPersona] = useState(initialPersona)
  const [tuning, setTuning] = useState(false)
  const [, startSaving] = useTransition()
  const [voiceOn, setVoiceOn] = useState(false)
  const [caption, setCaption] = useState<string | null>(null)
  const [keyframes, setKeyframes] = useState<Keyframe[]>([])
  const [notes, setNotes] = useState<FittingNotesState>(EMPTY_NOTES)
  const agent = useGearAgent()
  const speak = useVoice(voiceOn)

  useEffect(() => {
    let cancelled = false
    let session: PoseSession | null = null
    setSessionState({ status: 'loading' })
    setProviderStatus(null)
    getPoseProvider(providerId)
      .load()
      .then((loaded) => {
        if (cancelled) return loaded.dispose()
        session = loaded
        loaded.onStatus?.(setProviderStatus)
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

  const readout = useMemo(() => readoutOf(snapshot, sport), [snapshot, sport])
  const context = useMemo(() => contextLines(notes, sport), [notes, sport])

  const restartAnalysis = useCallback((nextSport: Sport, height: number) => {
    setTracker(createTracker(nextSport, height))
    setSnapshot(null)
    setKeyframes([])
    setCaption(null)
  }, [])

  const addKeyframe = useCallback((frame: Keyframe) => {
    setKeyframes((current) => (current.length >= MAX_KEYFRAMES ? current : [...current, frame]))
  }, [])

  const live = useLiveCamera(() => {
    restartAnalysis(sport, heightCm)
    void speak(sport === 'running' ? 'Go. Run naturally.' : 'Go. Climb naturally.')
  })
  const liveActive = live.phase === 'starting' || live.phase === 'countdown' || live.phase === 'recording'

  const goLive = () => {
    setClip((previous) => {
      if (previous?.url.startsWith('blob:')) URL.revokeObjectURL(previous.url)
      return null
    })
    restartAnalysis(sport, heightCm)
    live.start(CAPTURE_SECONDS[sport])
  }

  const lastCue = useRef<{ id: string; at: number } | null>(null)
  useEffect(() => {
    if (live.phase !== 'recording') return
    const cue = cueFor(readout, persona.voice)
    if (!cue) return
    const now = Date.now()
    const last = lastCue.current
    if (last && (now - last.at < CUE_GAP_MS || (last.id === cue.id && now - last.at < REPEAT_CUE_GAP_MS))) return
    lastCue.current = { id: cue.id, at: now }
    setCaption(cue.text)
    void speak(cue.text)
  }, [live.phase, readout, persona.voice, speak])

  const loadFile = useCallback(
    (file: File) => {
      live.clear()
      setClip((previous) => {
        if (previous?.url.startsWith('blob:')) URL.revokeObjectURL(previous.url)
        return { url: URL.createObjectURL(file), name: file.name }
      })
      setPlaying(true)
      restartAnalysis(sport, heightCm)
    },
    [sport, heightCm, restartAnalysis, live.clear],
  )

  const changeSport = (next: Sport) => {
    if (next === sport) return
    live.clear()
    setNotes(EMPTY_NOTES)
    setSport(next)
    setBaseline(null)
    agent.reset()
    restartAnalysis(next, heightCm)
  }

  const changePersona = (next: Persona) => {
    setPersona(next)
    startSaving(() => savePersona(next))
  }

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
    restartAnalysis(sport, heightCm)
    void video.play()
    setPlaying(true)
  }

  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || !clip) return
    if (e.key === ' ') {
      e.preventDefault()
      togglePlay()
    } else if (e.key === 'r' || e.key === 'R') {
      restart()
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])

  const changeSpeed = (value: number) => {
    setSpeed(value)
    if (videoRef.current) videoRef.current.playbackRate = value
  }

  const engine = sessionState.status
  const statusLabel =
    engine === 'loading'
      ? 'Loading pose model'
      : sessionState.status === 'error'
        ? `Provider unavailable: ${sessionState.message}`
        : null

  const mood: Mood =
    agent.mood ?? (readout.ready && !liveActive ? 'ready' : (clip && playing) || liveActive ? 'watching' : 'asleep')

  const announcedMood = useRef<Mood>(mood)
  useEffect(() => {
    if (announcedMood.current === mood) return
    announcedMood.current = mood
    if (ANNOUNCED_MOODS.has(mood)) void speak(speechFor(persona.voice, mood, sport))
  }, [mood, persona.voice, sport, speak])

  const proof = baseline && readout.ready
    ? readout.metrics.reduce(
        (tally, metric) => {
          const result = compareMetric(metric, baseline.readout.metrics.find((m) => m.id === metric.id))
          if (!result || metric.better === 'neutral') return tally
          return { improved: tally.improved + (result.verdict === 'better' ? 1 : 0), scored: tally.scored + 1 }
        },
        { improved: 0, scored: 0 },
      )
    : null

  return (
    <div
      className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 lg:py-10"
      style={{ '--stage-foreground': PHOSPHOR_COLOR[persona.phosphor] } as CSSProperties}
    >
      <header className="housing flex flex-col gap-5 rounded-2xl px-5 py-4 md:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <h1 className="font-mono text-5xl leading-none tracking-wider text-foreground engraved">
              vertiqal
              <span className="sr-only">: your body is the search query</span>
            </h1>
            <p className="hidden whitespace-nowrap border-l border-border pl-5 text-xs font-semibold uppercase leading-relaxed tracking-[0.2em] text-muted-foreground engraved sm:block lg:hidden xl:block">
              Your body is
              <br />
              the search query
            </p>
          </div>

          <FormaConsole
            persona={persona}
            mood={mood}
            sport={sport}
            tuning={tuning}
            tunerId={tunerId}
            onToggleTuning={() => setTuning((t) => !t)}
          />

          <div className="flex items-center gap-5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground engraved">
              <span className="led" data-state={engine === 'ready' ? 'on' : engine === 'loading' ? 'busy' : 'off'} aria-hidden />
              <span role="status">{engine === 'ready' ? 'Vision ready' : engine === 'loading' ? 'Warming up' : 'No vision'}</span>
            </p>
            <div role="group" aria-label="Sport" className="well flex gap-1 rounded-lg p-1">
              {SPORT_LIST.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={sport === value}
                  onClick={() => changeSport(value)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    sport === value ? 'housing text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {SPORTS[value].label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div id={tunerId} hidden={!tuning}>
          {tuning && <FormaTuner persona={persona} onChange={changePersona} sport={sport} />}
        </div>
      </header>

      <main className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label="Movement analysis" className="housing flex min-w-0 flex-col gap-5 rounded-2xl p-4 md:p-6">
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
              {`CH-1 · ${SPORTS[sport].label} monitor`}
            </p>
            {clip && (
              <p className="max-w-56 truncate font-mono text-lg leading-none text-muted-foreground" title={clip.name}>
                {clip.name}
              </p>
            )}
          </div>

          <PoseStage
            key={clip?.url ?? (live.stream ? 'live' : 'empty')}
            themeKey={persona.phosphor}
            videoRef={videoRef}
            src={clip?.url ?? null}
            stream={live.stream}
            onKeyframe={addKeyframe}
            overlay={
              live.phase === 'off' || live.phase === 'error' ? undefined : (
                <LiveOverlay
                  phase={live.phase}
                  secondsLeft={live.secondsLeft}
                  caption={caption}
                  events={readout.events}
                  sport={sport}
                />
              )
            }
            session={sessionState.status === 'ready' ? sessionState.session : null}
            tracker={tracker}
            sport={sport}
            engine={engine}
            statusLabel={statusLabel}
            onSnapshot={setSnapshot}
            onFile={loadFile}
          />

          <div className="flex flex-wrap items-center justify-between gap-4 px-1">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="icon-lg"
                onClick={togglePlay}
                disabled={!clip}
                aria-label={playing ? 'Pause (Space)' : 'Play (Space)'}
              >
                {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
              </Button>
              <Button variant="outline" size="icon-lg" onClick={restart} disabled={!clip} aria-label="Restart analysis (R)">
                <RotateCcw aria-hidden />
              </Button>
              <div role="group" aria-label="Playback speed" className="well flex gap-1 rounded-lg p-1">
                {SPEEDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => changeSpeed(value)}
                    aria-pressed={speed === value}
                    disabled={!clip}
                    className={cn(
                      'rounded-md px-2.5 py-0.5 font-mono text-lg leading-tight tabular-nums disabled:opacity-50',
                      speed === value ? 'housing text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {`${value}×`}
                  </button>
                ))}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={voiceOn}
                onClick={() => setVoiceOn((v) => !v)}
                className="well flex h-10 items-center gap-2 rounded-md px-3 text-xs font-semibold uppercase tracking-[0.18em] text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="led" data-state={voiceOn ? 'on' : 'off'} aria-hidden />
                Voice
                <span className="sr-only">{': Forma speaks coaching cues aloud'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {liveActive ? (
                <Button variant="outline" size="lg" className="px-4" onClick={live.stop}>
                  <Square aria-hidden />
                  Stop capture
                </Button>
              ) : (
                <Button variant="outline" size="lg" className="px-4" onClick={goLive} disabled={engine !== 'ready'}>
                  <Camera aria-hidden />
                  Go live
                </Button>
              )}
            <label className={cn(buttonVariants({ size: 'lg' }), 'cursor-pointer px-4 focus-within:ring-3 focus-within:ring-ring/50')}>
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
          </div>
          {live.error && (
            <p role="alert" className="px-1 text-sm leading-relaxed text-primary">
              {`Live capture unavailable: ${live.error}.`}
            </p>
          )}
          <p className="px-1 text-sm leading-relaxed text-muted-foreground">
            {SPORTS[sport].clipHint}
            {` Go live records ${CAPTURE_SECONDS[sport]} seconds from your camera; frames never leave the browser.`}
            <span className="hidden md:inline">{' Space plays or pauses, R restarts.'}</span>
          </p>
        </section>

        <aside className="housing flex flex-col gap-6 rounded-2xl p-5">
          <GaitReadout readout={readout} baseline={baseline?.readout ?? null} />

          <div className="flex flex-col gap-2 border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">Proof run</p>
            {baseline ? (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {proof
                    ? `${proof.improved} of ${proof.scored} scored metrics improved vs `
                    : 'Load a clip in your new shoes to compare against '}
                  <span className="font-semibold text-foreground">{baseline.clipName}</span>.
                </p>
                <Button variant="outline" size="lg" className="h-10 w-fit px-4" onClick={() => setBaseline(null)}>
                  <PinOff aria-hidden />
                  Clear baseline
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Pin this clip as a baseline, then film again in new shoes to see what actually changed.
                </p>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-10 w-fit px-4"
                  disabled={!readout.ready}
                  onClick={() => setBaseline({ readout, clipName: clip?.name ?? 'baseline' })}
                >
                  <Pin aria-hidden />
                  Pin as baseline
                </Button>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-5">
            <label htmlFor="mover-height" className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
              Your height
            </label>
            <div className="flex items-center gap-3">
              <input
                id="mover-height"
                type="number"
                min={120}
                max={220}
                value={heightCm}
                onChange={(e) => setHeightCm(Number(e.target.value))}
                onBlur={() => restartAnalysis(sport, heightCm)}
                className="well h-10 w-24 rounded-md px-3 font-mono text-2xl tabular-nums text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <span className="text-sm text-muted-foreground">cm · scales distances</span>
            </div>
          </div>

          <ProviderPicker
            providers={POSE_PROVIDERS}
            value={providerId}
            onChange={setProviderId}
            status={sessionState.status === 'error' ? sessionState.message : providerStatus}
          />
        </aside>

        <div className="lg:col-span-2">
          <FittingNotes sport={sport} readout={readout} keyframes={keyframes} value={notes} onChange={setNotes} />
        </div>

        <div className="lg:col-span-2">
          <AgentPanel
            agent={agent}
            readout={readout}
            sport={sport}
            heightCm={heightCm}
            voice={persona.voice}
            capturing={liveActive}
            context={context}
          />
        </div>
      </main>
    </div>
  )
}
