'use client'

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useTransition, type CSSProperties } from 'react'
import { Camera, Pause, PinOff, Play, RotateCcw, Square, Upload } from 'lucide-react'
import { forgetBrief, saveBrief, savePersona } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { EMPTY_NOTES, type FittingNotesState } from '@/lib/agent/fitting-notes'
import { briefFromReadout, type ShopperPrefs } from '@/lib/agent/brief'
import { nextDepth, type Depth } from '@/lib/agent/depth'
import { cueFor } from '@/lib/coach'
import { trackStep } from '@/lib/funnel'
import { memberContext, type MemberView } from '@/lib/member/schema'
import {
  FALLBACK_HEIGHT_CM,
  analysisHeight,
  buildConfirmedPrefs,
  parseHeightCm,
  prefsValid,
  validatePrefs,
  type PrefDraft,
  type PrefField,
} from '@/lib/fitting/prefs'
import { REQUIRED_QUESTIONS, answeredCount, nextQuestion, previousQuestion, questionPrompt, type BriefQuestion } from '@/lib/fitting/brief-flow'
import { draftFromRemembered, rememberBrief, type RememberedBrief } from '@/lib/fitting/remembered-brief'
import { applyParsedBrief } from '@/lib/fitting/brief-parse'
import { EXAMPLE_FOOTAGE, EXAMPLE_MOODS, EXAMPLE_STEP_COUNT, exampleCompanion, stepTitle } from '@/lib/fitting/example'
import { canFindShoes, clearsBaseline, measurementInvalidated, nextStepFor, notesAfterReset, remeasurePlan, stageOf, type ResetReason } from '@/lib/fitting/session'
import { MIN_EVENTS, SPORTS, compareMetric, createTracker, readoutOf, type MovementSnapshot, type Readout, type Sport } from '@/lib/metrics/readout'
import { PHOSPHOR_COLOR, lockedLine, speechFor, type Mood, type Persona } from '@/lib/persona'
import { POSE_PROVIDERS, getPoseProvider } from '@/lib/pose/providers'
import type { ExampleObservation } from '@/lib/pose/example-observation'
import type { FrameQuality, Pose, PoseSession } from '@/lib/pose/types'
import { createValidationRecorder, type ValidationCapture, type ValidationSource } from '@/lib/pose/validation'
import { FormaDock } from '@/components/forma/forma-dock'
import type { HeroFrame } from '@/lib/hero/frame'
import { AgentPanel } from './agent/agent-panel'
import { outputsOf, type ShoePick } from './agent/outputs'
import { HeroCard } from './hero/hero-card'
import { useGearAgent } from './agent/use-gear-agent'
import { ExampleObserver } from './example-observer'
import { ExampleWalkthrough, type ExampleState } from './example-walkthrough'
import { BriefQuestionPanel, BriefSentence, QUESTION_ID } from './brief-strip'
import { FittingBrief, type BriefField } from './fitting-brief'
import { HeightDial } from './height-dial'
import { FittingHeader, SportToggle } from './fitting-header'
import { FittingNotes } from './fitting-notes'
import { GaitReadout } from './gait-readout'
import { LiveOverlay } from './live-overlay'
import { PoseStage, type Keyframe } from './pose-stage'
import { ProviderPicker } from './provider-picker'
import { ValidationControls } from './validation-controls'
import { useLiveCamera } from './use-live-camera'
import { useMember } from './use-member'
import { useVoice } from './use-voice'

interface Clip {
  url: string
  name: string
}

interface Baseline {
  readout: Readout
  clipName: string
}

const CAPTURE_SECONDS: Record<Sport, number> = { running: 20, climbing: 45 }
const MAX_KEYFRAMES = 3
const CUE_GAP_MS = 6000
const REPEAT_CUE_GAP_MS = 14000
const ANNOUNCED_MOODS = new Set<Mood>(['pleased', 'asking', 'working', 'sad'])
const EMPTY_FRAME: FrameQuality = { person: false, hips: false, feet: false }
const LABEL = 'text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved'
const PRIVACY_LINE =
  'Default video analysis stays on-device. Optional hosted analysis, photo review and AI try-on send images only when you choose them. Your confirmed brief answers — never niggles, never video — are remembered in a cookie on this browser for next time. Typed sentences and the clip surface guess go to Grok only when you press those buttons.'

const scrollToSection = (id: string) => {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
}

type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; session: PoseSession }
  | { status: 'error'; message: string }

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))

const prefersStill = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function StrideLab({
  initialPersona,
  initialMember,
  initialBrief,
}: {
  initialPersona: Persona
  initialMember: MemberView
  initialBrief: RememberedBrief | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [clip, setClip] = useState<Clip | null>(null)
  const [remembered, setRemembered] = useState<RememberedBrief | null>(initialBrief)
  const initialSport = initialMember.last?.sport ?? 'running'
  const [sport, setSport] = useState<Sport>(initialSport)
  const [providerId, setProviderId] = useState(POSE_PROVIDERS[0].id)
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'loading' })
  const [providerStatus, setProviderStatus] = useState<string | null>(null)
  const [initialDraft] = useState(() => draftFromRemembered(initialBrief, initialSport, initialMember.last?.size ?? null))
  const [prefDraft, setPrefDraft] = useState<PrefDraft>(initialDraft)
  const [calibrationCm, setCalibrationCm] = useState(() => parseHeightCm(initialDraft.heightCm) ?? FALLBACK_HEIGHT_CM)
  const [tracker, setTracker] = useState(() => createTracker(initialSport, parseHeightCm(initialDraft.heightCm) ?? FALLBACK_HEIGHT_CM))
  const [snapshot, setSnapshot] = useState<MovementSnapshot | null>(null)
  const recorderRef = useRef<ReturnType<typeof createValidationRecorder> | null>(null)
  const [captureStatus, setCaptureStatus] = useState<'idle' | 'recording' | 'ready'>('idle')
  const [capturedTrace, setCapturedTrace] = useState<ValidationCapture | null>(null)
  const [captureSource, setCaptureSource] = useState<ValidationSource>('unclassified')
  const [lockedReadout, setLockedReadout] = useState<Readout | null>(null)
  const [playing, setPlaying] = useState(true)
  const [baseline, setBaseline] = useState<Baseline | null>(null)
  const [persona, setPersona] = useState(initialPersona)
  const [tuning, setTuning] = useState(false)
  const [, startSaving] = useTransition()
  const [voiceOn, setVoiceOn] = useState(false)
  const [caption, setCaption] = useState<string | null>(null)
  const [keyframes, setKeyframes] = useState<Keyframe[]>([])
  const [hero, setHero] = useState<HeroFrame | null>(null)
  const [notes, setNotes] = useState<FittingNotesState>(() => ({
    ...EMPTY_NOTES,
    goal: initialDraft.goal,
    surface: initialDraft.surface,
    width: initialBrief?.width ?? '',
  }))
  const [lockLine, setLockLine] = useState<string | null>(null)
  const [choice, setChoice] = useState<ShoePick | null>(null)
  const [example, setExample] = useState<ExampleState | null>(null)
  const [exampleObservation, setExampleObservation] = useState<ExampleObservation | null>(null)
  const [depth, setDepth] = useState<Depth>('considered')
  const [confirmedPrefs, setConfirmedPrefs] = useState<ShopperPrefs | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [activeQuestion, setActiveQuestion] = useState<BriefQuestion | null>(null)
  const [skipped, setSkipped] = useState<ReadonlySet<BriefQuestion>>(new Set())
  const [describeState, setDescribeState] = useState<{ pending: boolean; error: string | null }>({ pending: false, error: null })
  const [filledNote, setFilledNote] = useState<string | null>(null)
  const [surfaceGuess, setSurfaceGuess] = useState<{ pending: boolean; suggestion: string | null; message: string | null }>({
    pending: false,
    suggestion: null,
    message: null,
  })
  const agent = useGearAgent()
  const speak = useVoice(voiceOn)
  const { member, forget } = useMember(initialMember)

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
  const memberLines = useMemo(() => memberContext(member), [member])
  const picks = useMemo(() => outputsOf(agent.messages)?.picks ?? [], [agent.messages])
  const [providerMismatch, setProviderMismatch] = useState(false)

  const clearValidationCapture = useCallback(() => {
    recorderRef.current = null
    setCapturedTrace(null)
    setCaptureStatus('idle')
  }, [])

  const restartAnalysis = useCallback((nextSport: Sport, height: number) => {
    setTracker(createTracker(nextSport, height))
    setCalibrationCm(height)
    setSnapshot(null)
    setLockedReadout(null)
    setKeyframes([])
    setHero(null)
    setCaption(null)
    setProviderMismatch(false)
    clearValidationCapture()
  }, [clearValidationCapture])

  const addKeyframe = useCallback((frame: Keyframe) => {
    setKeyframes((current) => (current.length >= MAX_KEYFRAMES ? current : [...current, frame]))
  }, [])

  const live = useLiveCamera(() => {
    restartAnalysis(sport, calibrationCm)
    void speak(sport === 'running' ? 'Go. Run naturally.' : 'Go. Climb naturally.')
  })
  const liveActive = live.phase === 'starting' || live.phase === 'countdown' || live.phase === 'recording'

  const releaseClip = () => {
    setClip((previous) => {
      if (previous?.url.startsWith('blob:')) URL.revokeObjectURL(previous.url)
      return null
    })
  }

  const updateDraft = useCallback(
    (next: PrefDraft) => {
      const heightChanged = parseHeightCm(next.heightCm) !== parseHeightCm(prefDraft.heightCm)
      setPrefDraft(next)
      setNotes((current) => ({ ...current, goal: next.goal, surface: next.surface }))
      if (!heightChanged) return
      clearValidationCapture()
      const plan = remeasurePlan({
        enteredCm: parseHeightCm(next.heightCm),
        calibratedCm: calibrationCm,
        providerChanged: false,
        liveDone: live.phase === 'done',
      })
      agent.reset()
      setChoice(null)
      setConfirmedPrefs(null)
      if (plan === 'none') return
      if (plan === 'recapture' || liveActive) return
      setLockedReadout(null)
      setLockLine(null)
      restartAnalysis(sport, parseHeightCm(next.heightCm)!)
      const video = videoRef.current
      if (video && clip) {
        video.currentTime = 0
        void video.play()
        setPlaying(true)
      }
    },
    [prefDraft.heightCm, calibrationCm, live.phase, liveActive, clip, sport, agent, restartAnalysis, clearValidationCapture],
  )

  const updateNotes = useCallback((next: FittingNotesState) => {
    setNotes(next)
    setPrefDraft((d) => ({ ...d, goal: next.goal, surface: next.surface }))
  }, [])

  const resetSession = useCallback(
    (reason: ResetReason, targetSport: Sport = sport) => {
      agent.reset()
      live.clear()
      setChoice(null)
      setConfirmedPrefs(null)
      setAttempted(false)
      if (clearsBaseline(reason)) setBaseline(null)
      const saved = reason === 'sport' || reason === 'start-fresh' ? remembered?.bySport[targetSport] : undefined
      if (reason === 'sport' || reason === 'start-fresh') {
        setPrefDraft((d) => ({ ...d, goal: saved?.goal ?? '', surface: saved?.surface ?? '' }))
        setSkipped(new Set())
      }
      setActiveQuestion(null)
      setNotes((current) => {
        const next = notesAfterReset(reason, current)
        return saved ? { ...next, goal: saved.goal, surface: saved.surface } : next
      })
      setLockedReadout(null)
      setCaption(null)
      clearValidationCapture()
      setCaptureSource('unclassified')
      setDescribeState({ pending: false, error: null })
      setFilledNote(null)
      setSurfaceGuess({ pending: false, suggestion: null, message: null })
    },
    [agent, live, clearValidationCapture, remembered, sport],
  )

  const currentAnalysisHeight = analysisHeight(prefDraft).heightCm

  const goLive = () => {
    const entered = parseHeightCm(prefDraft.heightCm)
    if (entered === null) {
      setAttempted(true)
      return
    }
    resetSession('record')
    setExample(null)
    releaseClip()
    restartAnalysis(sport, entered)
    live.start(CAPTURE_SECONDS[sport])
    trackStep('film_started', { sport })
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
      resetSession('new-clip')
      setExample(null)
      setClip((previous) => {
        if (previous?.url.startsWith('blob:')) URL.revokeObjectURL(previous.url)
        return { url: URL.createObjectURL(file), name: file.name }
      })
      setPlaying(true)
      restartAnalysis(sport, currentAnalysisHeight)
      trackStep('clip_uploaded', { sport })
    },
    [sport, currentAnalysisHeight, restartAnalysis, resetSession],
  )

  const showExample = () => {
    trackStep('sample_started', { sport })
    resetSession('example')
    releaseClip()
    restartAnalysis(sport, currentAnalysisHeight)
    setExampleObservation(null)
    setExample({ step: 0, playing: !prefersStill(), concept: 0 })
    requestAnimationFrame(() => document.getElementById('example-media-heading')?.focus())
  }

  const exitExample = () => {
    setExample(null)
    setExampleObservation(null)
    requestAnimationFrame(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('[data-forma-action]')].find((b) => b.getClientRects().length > 0)
      button?.scrollIntoView({ block: 'center' })
      button?.focus()
    })
  }

  const startFresh = () => {
    resetSession('start-fresh')
    setExample(null)
    releaseClip()
    restartAnalysis(sport, currentAnalysisHeight)
  }

  const shopping = Boolean(agent.sentBrief)
  const trackShopping = useEffectEvent(() => trackStep('shopping_started', { sport }))
  useEffect(() => {
    if (!shopping) return
    trackShopping()
    requestAnimationFrame(() => scrollToSection('forma-procurement'))
  }, [shopping])

  const choose = (pick: ShoePick | null) => {
    if (pick) trackStep('pick_chosen', { sport, retailer: pick.retailer })
    setChoice(pick)
  }

  const changeSport = (next: Sport) => {
    if (next === sport) return
    resetSession('sport', next)
    setExample(null)
    setExampleObservation(null)
    releaseClip()
    setSport(next)
    restartAnalysis(next, currentAnalysisHeight)
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
    agent.reset()
    setChoice(null)
    setConfirmedPrefs(null)
    video.currentTime = 0
    restartAnalysis(sport, calibrationCm)
    void video.play()
    setPlaying(true)
  }

  const changeProvider = (next: string) => {
    if (next === providerId) return
    clearValidationCapture()
    agent.reset()
    setChoice(null)
    setConfirmedPrefs(null)
    const hasMeasurement = Boolean(lockedReadout) || readout.events > 0
    if (hasMeasurement && live.phase === 'done') {
      setProviderMismatch(true)
    } else if (hasMeasurement) {
      setLockedReadout(null)
      setLockLine(null)
      restartAnalysis(sport, calibrationCm)
      const video = videoRef.current
      if (video && clip) {
        video.currentTime = 0
        void video.play()
        setPlaying(true)
      }
    }
    setProviderId(next)
  }

  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || !clip || example) return
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

  const engine = sessionState.status
  const statusLabel =
    engine === 'loading'
      ? 'Loading pose model'
      : sessionState.status === 'error'
        ? `Provider unavailable: ${sessionState.message}`
        : null

  const mood: Mood =
    agent.mood ??
    (example
      ? (EXAMPLE_MOODS[example.step] ?? 'watching')
      : readout.ready && !liveActive
        ? 'ready'
        : (clip && playing) || liveActive
          ? 'watching'
          : 'asleep')

  const announcedMood = useRef<Mood>(mood)
  useEffect(() => {
    if (announcedMood.current === mood) return
    announcedMood.current = mood
    if (example) return
    if (ANNOUNCED_MOODS.has(mood)) void speak(speechFor(persona.voice, mood, sport))
  }, [mood, persona.voice, sport, speak, example])

  const lockMeasurement = useEffectEvent((final: Readout) => {
    const line = lockedLine(persona.voice, final.metrics)
    setLockLine(line)
    trackStep('measurements_locked', { sport, source: clip ? 'clip' : 'camera' })
    if (line) void speak(line)
    setLockedReadout(final)
    if (!clip || recorderRef.current) return
    const video = videoRef.current
    if (video && !video.paused) {
      video.pause()
      setPlaying(false)
    }
  })
  useEffect(() => {
    if (liveActive) return
    if (readout.ready && !lockedReadout) {
      lockMeasurement(readout)
    } else if (!readout.ready && !lockedReadout) {
      setLockLine(null)
    }
  }, [readout, liveActive, lockedReadout])

  const enteredHeight = parseHeightCm(prefDraft.heightCm)

  const validationCanStart =
    !example &&
    sport === 'running' &&
    engine === 'ready' &&
    Boolean(clip || live.phase === 'recording') &&
    !providerMismatch &&
    (enteredHeight === null || enteredHeight === calibrationCm)

  const onValidationFrame = useCallback(
    (frame: { timeSec: number; pose: Pose | null; width: number; height: number; snapshot: MovementSnapshot }) => {
      const recorder = recorderRef.current
      if (!recorder || frame.snapshot.sport !== 'running') return
      recorder.record(frame.timeSec, frame.pose, frame.width, frame.height, frame.snapshot)
      if (recorder.stopReason) {
        const trace = recorder.finish()
        recorderRef.current = null
        setCapturedTrace(trace)
        setCaptureStatus(trace ? 'ready' : 'idle')
      }
    },
    [],
  )

  const stopCapture = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder) return
    const trace = recorder.finish()
    recorderRef.current = null
    setCapturedTrace(trace)
    setCaptureStatus(trace ? 'ready' : 'idle')
  }, [])

  const startCapture = () => {
    if (!validationCanStart || captureStatus === 'recording') return
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    recorderRef.current = createValidationRecorder({
      captureId: crypto.randomUUID(),
      sourceKind: captureSource,
      providerId,
      heightCm: enteredHeight,
    })
    setCapturedTrace(null)
    setCaptureStatus('recording')
    if (clip && video.paused) {
      void video.play()
      setPlaying(true)
    }
  }

  const exportCapture = () => {
    if (!capturedTrace) return
    const blob = new Blob([JSON.stringify(capturedTrace, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `forma-running-validation-${capturedTrace.captureId.slice(0, 8)}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  useEffect(() => {
    if (!clip && captureStatus === 'recording' && ['done', 'error', 'off'].includes(live.phase)) stopCapture()
  }, [live.phase, captureStatus, clip, stopCapture])

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

  const sentBrief = agent.sentBrief
  const measuredReady = Boolean(lockedReadout?.ready) || (readout.ready && !liveActive)
  const recorded = live.phase === 'done'
  const provisional = enteredHeight === null && (readout.events > 0 || Boolean(lockedReadout))
  const staleMeasurement = measurementInvalidated({ enteredCm: enteredHeight, calibratedCm: calibrationCm, providerMismatch })
  const needsRecapture = recorded && staleMeasurement

  const submitReady = canFindShoes({
    example: Boolean(example),
    liveActive,
    busy: agent.busy,
    measuredReady,
    prefsValid: prefsValid(prefDraft),
    heightCalibrated: enteredHeight !== null && !staleMeasurement,
  })

  const submitHint = liveActive
    ? 'Wait for the capture to finish.'
    : provisional || enteredHeight === null
      ? 'Distance estimates need your height — enter it above.'
      : needsRecapture
        ? 'The height or engine changed after recording. The camera never saved the clip, so film again to recalibrate.'
        : !measuredReady
          ? 'Upload a clip or film yourself first — Forma needs real measurements.'
          : !submitReady
            ? 'Complete the required fields above.'
            : null

  const buildPrefs = (runDepth: Depth): ShopperPrefs | null =>
    buildConfirmedPrefs({ draft: prefDraft, notes, sport, voice: persona.voice, depth: runDepth, memberLines })

  const submitSearch = () => {
    setAttempted(true)
    if (!submitReady || !lockedReadout) return
    const prefs = buildPrefs(depth)
    if (!prefs) return
    const next = rememberBrief(remembered, prefDraft, notes, sport)
    setRemembered(next)
    startSaving(() => saveBrief(next))
    setConfirmedPrefs(prefs)
    setChoice(null)
    agent.send(briefFromReadout(lockedReadout), prefs)
  }

  const deeper = nextDepth(agent.prefs?.depth ?? depth)
  const lookHarder = () => {
    const previous = confirmedPrefs ?? agent.prefs
    if (!sentBrief || !deeper || !previous || agent.busy) return
    const prefs = { ...previous, depth: deeper }
    setDepth(deeper)
    setConfirmedPrefs(prefs)
    setChoice(null)
    agent.send(sentBrief, prefs)
  }

  const retrySearch = () => {
    const prefs = confirmedPrefs ?? agent.prefs
    if (!sentBrief || !prefs || agent.busy) return
    setChoice(null)
    agent.send(sentBrief, prefs)
  }

  const stage = stageOf({
    example: Boolean(example),
    capturing: Boolean(clip) || liveActive || readout.events > 0,
    measuredReady,
    sent: shopping,
    hasOutputs: picks.length > 0,
    hasChoice: Boolean(choice),
  })
  const missingFields = Object.keys(validatePrefs(prefDraft)) as PrefField[]
  const nextStep = nextStepFor({
    stage,
    example: Boolean(example),
    capture: live.phase,
    events: readout.events,
    target: MIN_EVENTS,
    eventLabel: SPORTS[sport].events,
    missingPrefs: missingFields.length,
    needsRecapture,
  })

  const stageIdle = !example && !clip && !live.stream
  const askingBrief = !example && !liveActive && (stage === 'capture' || stage === 'confirm')
  const question =
    activeQuestion ?? (askingBrief ? nextQuestion({ draft: prefDraft, notes, skipped, heightOnScreen: stageIdle }) : null)

  const afterPaint = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn))

  const askQuestion = (next: BriefQuestion) => {
    setActiveQuestion(next)
    afterPaint(() => {
      const target = document.getElementById(QUESTION_ID)
      target?.scrollIntoView({ block: 'nearest', behavior: prefersStill() ? 'auto' : 'smooth' })
      target?.focus({ preventScroll: true })
    })
  }

  const focusBriefField = (field: BriefField) => askQuestion(field)

  const answerDraft = (patch: Partial<PrefDraft>) => {
    updateDraft({ ...prefDraft, ...patch })
    setActiveQuestion(null)
  }

  const answerNotes = (patch: Partial<FittingNotesState>) => {
    updateNotes({ ...notes, ...patch })
    setActiveQuestion(null)
  }

  const skipQuestion = (current: BriefQuestion) => {
    setSkipped((s) => new Set(s).add(current))
    setActiveQuestion(null)
  }

  const submitDescribe = async (text: string) => {
    setDescribeState({ pending: true, error: null })
    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'text', sport, text }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) throw new Error(data?.error ?? 'Forma could not read that')
      const applied = applyParsedBrief(prefDraft, notes, data)
      if (applied.filled.length > 0 || applied.notes.current !== notes.current) {
        updateDraft(applied.draft)
        updateNotes(applied.notes)
        setActiveQuestion(null)
        const note =
          applied.filled.length > 0
            ? `Filled ${applied.filled.join(', ')} from what you wrote — tap any to change.`
            : 'Noted your current shoe — tap any field to change.'
        setFilledNote(note)
        window.setTimeout(() => setFilledNote((n) => (n === note ? null : n)), 9000)
      } else {
        setActiveQuestion(null)
        setFilledNote("Couldn't find anything to fill — try naming your size or budget.")
        window.setTimeout(() => setFilledNote(null), 9000)
      }
      setDescribeState({ pending: false, error: null })
    } catch (error) {
      setDescribeState({ pending: false, error: error instanceof Error ? error.message : 'Forma could not read that' })
    }
  }

  const guessSurface = async () => {
    const frame = keyframes[0]
    if (!frame || surfaceGuess.pending || example) return
    setSurfaceGuess({ pending: true, suggestion: null, message: null })
    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'surface', sport, image: frame.dataUrl }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) throw new Error(data?.error ?? 'Could not read the still')
      setSurfaceGuess({
        pending: false,
        suggestion: data.surface ?? null,
        message: data.surface ? null : "Couldn't tell from the clip.",
      })
    } catch (error) {
      setSurfaceGuess({ pending: false, suggestion: null, message: error instanceof Error ? error.message : 'Could not read the still' })
    }
  }

  const personalFilm = () => {
    if (example) setExample(null)
    if (enteredHeight === null) {
      if (!clip && !live.stream) {
        afterPaint(() => {
          const input = document.getElementById('stage-height')
          input?.scrollIntoView({ block: 'center', behavior: prefersStill() ? 'auto' : 'smooth' })
          input?.focus({ preventScroll: true })
        })
      } else {
        askQuestion('height')
      }
      return
    }
    if (engine === 'ready') goLive()
  }

  const runNextAction = () => {
    const action = nextStep.action?.kind
    if (action === 'example') showExample()
    else if (action === 'upload-example') document.getElementById('clip-upload')?.click()
    else if (action === 'upload') document.getElementById('clip-upload')?.click()
    else if (action === 'brief') focusBriefField(missingFields[0] ?? 'size')
    else if (action === 'results') scrollToSection('forma-procurement')
    else if (action === 'recapture') goLive()
  }

  const findShoesAction =
    !example && submitReady && (stage === 'confirm' || (shopping && !question))
      ? { label: sentBrief ? 'Update search' : 'Find my shoes', onClick: submitSearch }
      : null
  const stripAction = example
    ? { label: 'Upload my clip', onClick: () => document.getElementById('clip-upload')?.click() }
    : stage === 'confirm' && findShoesAction
      ? findShoesAction
      : nextStep.action
        ? { label: nextStep.action.label, onClick: runNextAction }
        : null

  const heroPicks = choice ? [choice, ...picks.filter((p) => p.url !== choice.url)] : picks
  const panelReadout = lockedReadout ?? readout
  const lockedMetrics = measuredReady
    ? panelReadout.metrics.map((m) => ({ label: m.label, value: m.value === null || m.value === undefined ? '--' : m.value.toFixed(0), unit: m.unit }))
    : undefined
  const forgetRemembered = () => {
    setRemembered(null)
    startSaving(() => forgetBrief())
  }

  return (
    <div
      className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 md:px-8 lg:gap-5 lg:py-6"
      style={{ '--stage-foreground': PHOSPHOR_COLOR[persona.phosphor] } as CSSProperties}
    >
      <FittingHeader />

      <input
        id="clip-upload"
        type="file"
        accept="video/*"
        tabIndex={-1}
        className="sr-only"
        aria-label="Upload a clip for your own fitting"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) loadFile(file)
          e.target.value = ''
        }}
      />

      {member.linked && (
        <aside aria-label="Welcome back" className="housing flex flex-col gap-3 rounded-2xl px-5 py-4 md:flex-row md:items-center md:justify-between md:px-7">
          <div className="flex min-w-0 flex-col gap-1">
            <p className={LABEL}>{`Welcome back · ${member.phone}`}</p>
            <p className="text-pretty text-sm leading-relaxed text-foreground">
              {member.last
                ? `Last time you chose the ${member.last.name} in ${member.last.size}.`
                : 'Forma has your WhatsApp chat on file.'}
              {member.said.length > 0 && (
                <span className="text-muted-foreground">{` You told Forma: “${member.said.at(-1)}”`}</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <button
              type="button"
              onClick={startFresh}
              className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Start another fitting
            </button>
            <button
              type="button"
              onClick={() => void forget()}
              className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Forget me
            </button>
          </div>
        </aside>
      )}

      <section aria-label="Movement analysis" className="housing flex flex-col gap-3 rounded-2xl p-3 md:gap-4 md:p-5">
        {example ? (
          <ExampleObserver
            sport={sport}
            themeKey={persona.phosphor}
            localSession={providerId === 'mediapipe' && sessionState.status === 'ready' ? sessionState.session : null}
            loadLocalSession={providerId !== 'mediapipe'}
            localSessionFailed={providerId === 'mediapipe' && sessionState.status === 'error'}
            onObservation={setExampleObservation}
          />
        ) : (
          <>
            {clip && (
              <p className="truncate px-1 font-mono text-xs leading-none text-muted-foreground" title={clip.name}>
                {clip.name}
              </p>
            )}
            <PoseStage
              key={clip?.url ?? (live.stream ? 'live' : 'empty')}
              themeKey={persona.phosphor}
              videoRef={videoRef}
              src={clip?.url ?? null}
              stream={live.stream}
              onKeyframe={addKeyframe}
              onHero={setHero}
              overlay={
                live.phase === 'off' || live.phase === 'error' ? undefined : (
                  <LiveOverlay
                    phase={live.phase}
                    secondsLeft={live.secondsLeft}
                    totalSeconds={CAPTURE_SECONDS[sport]}
                    caption={caption}
                    events={readout.events}
                    framing={snapshot?.framing ?? EMPTY_FRAME}
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
              onValidationFrame={onValidationFrame}
              progress={{ events: readout.events, target: MIN_EVENTS, ready: readout.ready }}
              lockedMetrics={lockedMetrics}
              provisional={provisional}
              dense={shopping}
              idleAction={
                <button
                  type="button"
                  onClick={showExample}
                  className="flex items-center gap-2 whitespace-nowrap rounded-sm border-2 border-stage-foreground bg-stage-foreground px-3 py-2 text-lg uppercase leading-none text-stage transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring motion-reduce:transition-none md:text-2xl"
                >
                  <Play className="size-4 fill-current" aria-hidden />
                  Show me a sample fitting
                </button>
              }
              heightControl={
                <HeightDial
                  key={enteredHeight ?? 'none'}
                  id="stage-height"
                  variant="screen"
                  value={enteredHeight}
                  onCommit={(cm) => updateDraft({ ...prefDraft, heightCm: String(cm) })}
                />
              }
            />
          </>
        )}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <SportToggle sport={sport} onSport={changeSport} />
          {!example && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="lg"
                className="h-10 whitespace-nowrap px-3"
                onClick={() => document.getElementById('clip-upload')?.click()}
              >
                <Upload aria-hidden />
                {stage === 'invite' ? 'Upload a clip' : 'Another clip'}
              </Button>
              {liveActive ? (
                <Button variant="outline" size="lg" className="h-10 whitespace-nowrap px-3" onClick={live.stop}>
                  <Square aria-hidden />
                  Stop capture
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  className="h-10 whitespace-nowrap px-3"
                  onClick={personalFilm}
                  disabled={enteredHeight !== null && engine !== 'ready'}
                  title={
                    enteredHeight === null
                      ? 'Set your height first — recordings cannot be re-analysed later'
                      : engine === 'loading'
                        ? 'Pose engine is warming up'
                        : engine === 'error'
                          ? 'Live analysis is unavailable right now — upload a clip instead'
                          : undefined
                  }
                >
                  <Camera aria-hidden />
                  {enteredHeight === null ? 'Set up my camera' : stage === 'invite' ? 'Film me' : 'Film again'}
                </Button>
              )}
              {clip && (
                <>
                  <Button variant="outline" size="icon-lg" onClick={togglePlay} aria-label={playing ? 'Pause (Space)' : 'Play (Space)'}>
                    {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
                  </Button>
                  <Button variant="outline" size="icon-lg" onClick={restart} aria-label="Restart analysis (R)">
                    <RotateCcw aria-hidden />
                  </Button>
                </>
              )}
              {(clip || live.stream) && (
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
              )}
              {!stageIdle && !liveActive && !shopping && (
                <Button
                  variant="ghost"
                  size="lg"
                  className="h-10 whitespace-nowrap px-3 font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  title="Watch the illustrated sample fitting. This clears the current clip."
                  onClick={() => {
                    if (measuredReady && !window.confirm('Watching the sample clears this clip and its measurements. Continue?')) return
                    showExample()
                  }}
                >
                  <Play aria-hidden />
                  Sample fitting
                </Button>
              )}
            </div>
          )}
        </div>

        {!example && (
          <p className="px-1 text-pretty text-xs leading-relaxed text-muted-foreground">
            {enteredHeight === null
              ? `${SPORTS[sport].clipHint} Set your height on the screen before filming — recordings can't be re-analysed afterwards.`
              : `${SPORTS[sport].clipHint} Recording captures ${CAPTURE_SECONDS[sport]} seconds, live only — the video is never saved.`}
          </p>
        )}
        {!example && live.error && (
          <p role="alert" className="px-1 text-sm leading-relaxed text-primary">
            {`Live capture unavailable: ${live.error}.`}
          </p>
        )}

        <FormaDock
          persona={persona}
          mood={mood}
          sport={sport}
          line={example ? exampleCompanion(sport, example.step) : mood === 'ready' && lockLine ? lockLine : nextStep.detail}
          stageLabel={example ? `Example ${example.step + 1} of ${EXAMPLE_STEP_COUNT}` : nextStep.title}
          step={example ? { ...nextStep, title: stepTitle(sport, example.step) } : nextStep}
          isExample={Boolean(example)}
          observation={example && sport === 'running' ? exampleObservation : null}
          actionInStage={!example && stage === 'invite' && !clip && !live.stream}
          secondaryAction={
            example
              ? {
                  label: enteredHeight === null ? 'Set up my camera' : 'Film me',
                  onClick: personalFilm,
                  disabled: enteredHeight !== null && engine !== 'ready',
                  hint:
                    enteredHeight === null
                      ? 'Needs your height first — exits the example and asks for it on the screen.'
                      : engine === 'loading'
                        ? 'Pose engine is warming up. You can upload a clip now.'
                        : engine === 'error'
                          ? 'Live analysis is unavailable right now — upload a clip instead.'
                          : undefined,
                }
              : undefined
          }
          privacyLine={PRIVACY_LINE}
          analysisSettings={
            !example ? (
              <ProviderPicker
                providers={POSE_PROVIDERS}
                value={providerId}
                onChange={changeProvider}
                status={sessionState.status === 'error' ? sessionState.message : providerStatus}
              />
            ) : undefined
          }
          tuning={tuning}
          onToggleTuning={() => setTuning((t) => !t)}
          onPersona={changePersona}
          action={stripAction}
          pips={example ? undefined : { done: answeredCount(prefDraft, notes), total: REQUIRED_QUESTIONS.length }}
          ask={
            question
              ? {
                  eyebrow: stage === 'capture' ? 'Forma · while I watch' : 'Forma · your brief',
                  prompt: questionPrompt(question, sport),
                  controls: (
                    <BriefQuestionPanel
                      key={question}
                      question={question}
                      sport={sport}
                      draft={prefDraft}
                      notes={notes}
                      likelySize={member.last?.size ?? null}
                      onDraft={answerDraft}
                      onNotes={answerNotes}
                      onSkip={() => skipQuestion(question)}
                      onBack={previousQuestion(question) ? () => setActiveQuestion(previousQuestion(question)) : null}
                      onClose={() => setActiveQuestion(null)}
                      onAsk={askQuestion}
                      describe={{ pending: describeState.pending, error: describeState.error, onSubmit: submitDescribe }}
                      surfaceGuess={
                        keyframes.length > 0
                          ? { pending: surfaceGuess.pending, suggestion: surfaceGuess.suggestion, message: surfaceGuess.message, onGuess: guessSurface }
                          : undefined
                      }
                    />
                  ),
                }
              : null
          }
          footer={
            example ? (
              sport === 'running' ? (
                <div className="flex flex-col gap-1 px-1 font-sans text-xs leading-relaxed text-muted-foreground">
                  <p>{`${EXAMPLE_FOOTAGE.credit} · ${EXAMPLE_FOOTAGE.range}`}</p>
                  <p>
                    <a className="underline" href={EXAMPLE_FOOTAGE.sourceUrl} target="_blank" rel="noreferrer">
                      Seedance 1.5 Pro on fal.ai
                    </a>
                    {' · '}
                    <a className="underline" href={EXAMPLE_FOOTAGE.provenanceUrl} target="_blank" rel="noreferrer">
                      generation details
                    </a>
                    {`. ${EXAMPLE_FOOTAGE.rights} Not proof of real-person gait or shoe fit.`}
                  </p>
                </div>
              ) : undefined
            ) : (
              <div className="flex flex-col gap-1 px-1">
                <BriefSentence
                  sport={sport}
                  draft={prefDraft}
                  notes={notes}
                  active={question}
                  onPick={askQuestion}
                  remembered={remembered ? { onForget: forgetRemembered } : undefined}
                  trailing={
                    shopping && findShoesAction ? (
                      <Button size="sm" onClick={findShoesAction.onClick}>
                        {findShoesAction.label}
                      </Button>
                    ) : undefined
                  }
                />
                {filledNote && (
                  <p role="status" className="text-xs leading-relaxed text-muted-foreground">
                    {filledNote}
                  </p>
                )}
                <details className="group">
                  <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-sm text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                    Show all fields
                    <span aria-hidden className="transition-transform group-open:rotate-90">
                      ›
                    </span>
                  </summary>
                  <div className="mt-2 max-w-2xl">
                    <FittingBrief
                      sport={sport}
                      draft={prefDraft}
                      notes={notes}
                      onDraft={updateDraft}
                      onNotes={updateNotes}
                      onSubmit={submitSearch}
                      attempted={attempted}
                      submitLabel={sentBrief ? 'Update search' : 'Find my shoes'}
                      submitEnabled={submitReady}
                      submitHint={submitHint}
                      provisionalHeight={provisional}
                    />
                  </div>
                </details>
              </div>
            )
          }
        />
      </section>

      <main className="flex min-w-0 flex-col gap-4 pb-52 lg:pb-0">
        {!example && shopping && (
          <div id="forma-procurement" className="scroll-mt-6">
            <AgentPanel
              agent={agent}
              sport={sport}
              member={member}
              choice={choice}
              onChoose={choose}
              onPinBaseline={measuredReady ? () => setBaseline({ readout: panelReadout, clipName: clip?.name ?? 'today' }) : undefined}
              baselinePinned={Boolean(baseline)}
              deeper={deeper}
              onLookHarder={lookHarder}
              onRetry={retrySearch}
              onStartFresh={startFresh}
              confirmedSize={prefDraft.size}
              onSizeCommit={(size) => {
                setPrefDraft((d) => ({ ...d, size }))
                setConfirmedPrefs((p) => (p ? { ...p, size } : p))
              }}
              onBriefField={focusBriefField}
            />
          </div>
        )}

        {example ? (
          <ExampleWalkthrough sport={sport} state={example} onState={setExample} onExit={exitExample} />
        ) : (
          <>
            {!shopping && readout.events > 0 && (
              <div className="housing rounded-2xl p-4 md:p-5">
                <GaitReadout readout={readout} baseline={baseline?.readout ?? null} provisionalHeight={provisional} />
              </div>
            )}

            {sport === 'running' && (clip || liveActive || captureStatus === 'ready') && (
              <details className="group housing rounded-2xl p-4 md:p-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                  <span className={LABEL}>Local validation</span>
                  <span className="font-mono text-lg leading-none text-muted-foreground" aria-hidden>
                    +
                  </span>
                </summary>
                <div className="mt-3">
                  <ValidationControls
                    status={captureStatus}
                    source={captureSource}
                    traceSource={capturedTrace?.sourceKind ?? null}
                    onSource={setCaptureSource}
                    canStart={validationCanStart}
                    onStart={startCapture}
                    onStop={stopCapture}
                    onExport={exportCapture}
                    stopReason={capturedTrace?.stopReason ?? null}
                    frameCount={capturedTrace?.frames.length ?? 0}
                    contactCount={capturedTrace?.contacts.length ?? 0}
                  />
                </div>
              </details>
            )}

            {baseline && (
              <div className="housing flex flex-col gap-2 rounded-2xl p-4 md:p-5">
                <p className={LABEL}>Baseline · this session only</p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {'Compare your movement across sessions. '}
                  {proof
                    ? `${proof.improved} of ${proof.scored} scored metrics improved vs `
                    : 'Load a clip to compare against '}
                  <span className="font-semibold text-foreground">{baseline.clipName}</span>.
                </p>
                <Button variant="outline" size="lg" className="h-10 w-fit px-4" onClick={() => setBaseline(null)}>
                  <PinOff aria-hidden />
                  Clear baseline
                </Button>
              </div>
            )}
          </>
        )}

        {choice && hero && (
          <div id="hero-frame" className="scroll-mt-6">
            <HeroCard frame={hero} readout={panelReadout} sport={sport} picks={heroPicks} themeKey={persona.phosphor} />
          </div>
        )}

        {shopping && picks.length > 0 && !choice && !example && (
          <div id="fitting-notes" className="scroll-mt-6">
            <FittingNotes sport={sport} readout={panelReadout} keyframes={keyframes} value={notes} onChange={updateNotes} />
          </div>
        )}
      </main>
    </div>
  )
}
