'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useTransition, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { PinOff, Play } from 'lucide-react'
import { forgetBrief, saveBrief, savePersona } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EMPTY_NOTES, type FittingNotesState } from '@/lib/agent/fitting-notes'
import { briefFromReadout, type ShopperPrefs } from '@/lib/agent/brief'
import { nextDepth, type Depth } from '@/lib/agent/depth'
import { cueFor } from '@/lib/coach'
import { trackStep } from '@/lib/funnel'
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
import { clearPersistedBaseline, loadBaseline, saveBaseline } from '@/lib/fitting/baseline'
import { REQUIRED_QUESTIONS, answeredCount, previousQuestion, questionPrompt } from '@/lib/fitting/brief-flow'
import { draftFromRemembered, rememberBrief, type RememberedBrief } from '@/lib/fitting/remembered-brief'
import { EXAMPLE_FOOTAGE, EXAMPLE_MOODS, EXAMPLE_STEP_COUNT, exampleCompanion, stepTitle } from '@/lib/fitting/example'
import { canFindShoes, clearsBaseline, measurementInvalidated, nextStepFor, notesAfterReset, remeasurePlan, stageOf, visibilityFor, type ResetReason } from '@/lib/fitting/session'
import { narrate, type NarrationAction, type StockPhase } from '@/lib/fitting/narration'
import { MIN_EVENTS, SPORTS, compareMetric, createTracker, readoutOf, type MovementSnapshot, type Readout, type Sport } from '@/lib/metrics/readout'
import { PHOSPHOR_COLOR, lockedLine, speechFor, type Mood, type Persona } from '@/lib/persona'
import { POSE_PROVIDERS } from '@/lib/pose/providers'
import type { ExampleObservation } from '@/lib/pose/example-observation'
import type { FrameQuality } from '@/lib/pose/types'
import { FormaDock } from '@/components/forma/forma-dock'
import type { HeroFrame } from '@/lib/hero/frame'
import { AgentPanel } from './agent/agent-panel'
import { activityOf } from './agent/agent-steps'
import { outputsOf, type ShoePick } from './agent/outputs'
import { TakeAway, type Baseline } from './hero/take-away'
import { useGearAgent } from './agent/use-gear-agent'
import { ExampleObserver } from './example-observer'
import { ExampleWalkthrough, type ExampleState } from './example-walkthrough'
import { BriefQuestionPanel, BriefSentence } from './brief-strip'
import { FittingBrief } from './fitting-brief'
import { HeightDial } from './height-dial'
import { FittingHeader, SportToggle } from './fitting-header'
import { FittingNotes } from './fitting-notes'
import { GaitReadout } from './gait-readout'
import { LiveOverlay } from './live-overlay'
import { PoseStage, type Keyframe } from './pose-stage'
import { ProviderPicker } from './provider-picker'
import { StageControls } from './stage-controls'
import { ValidationControls } from './validation-controls'
import { useBriefFlow } from './use-brief-flow'
import { useInlineConfirm } from './use-inline-confirm'
import { useLiveCamera } from './use-live-camera'
import { usePoseProvider } from './use-pose-provider'
import { useValidationCapture } from './use-validation-capture'
import { useVoice } from './use-voice'

// three.js is heavy and only needed below the fold after measurements.
const MovementTwin = dynamic(() => import('./twin/movement-twin').then((m) => m.MovementTwin), {
  ssr: false,
  loading: () => (
    <div className="housing rounded-2xl p-4 md:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">Loading 3D twin…</p>
    </div>
  ),
})

interface Clip {
  url: string
  name: string
}

const CAPTURE_SECONDS: Record<Sport, number> = { running: 20, climbing: 45 }
const MAX_KEYFRAMES = 3
const CUE_GAP_MS = 6000
const REPEAT_CUE_GAP_MS = 14000
const ANNOUNCED_MOODS = new Set<Mood>(['pleased', 'asking', 'working', 'sad'])
const EMPTY_FRAME: FrameQuality = { person: false, hips: false, feet: false }
const LABEL = 'text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved'
const PRIVACY_LINE =
  'Default video analysis stays on-device. Optional hosted analysis, photo review and AI try-on send images only when you choose them. Your confirmed brief answers — never niggles, never video — are remembered in a cookie on this browser for next time. When you click through to a retailer, a random reference is attached so Forma can learn whether the size was right; it identifies no one. Typed sentences and the clip surface guess go to Grok only when you press those buttons.'

const scrollTo = (el: HTMLElement | null | undefined, block: ScrollLogicalPosition = 'start') => {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block })
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))

const prefersStill = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function StrideLab({
  initialPersona,
  initialBrief,
  initialSport,
  shareRef,
}: {
  initialPersona: Persona
  initialBrief: RememberedBrief | null
  initialSport: Sport
  shareRef: string | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const procurementRef = useRef<HTMLDivElement>(null)
  const questionPanelRef = useRef<HTMLDivElement>(null)
  const stageHeightInputRef = useRef<HTMLInputElement>(null)
  const exampleHeadingRef = useRef<HTMLParagraphElement>(null)
  /** Both copies of the dock's primary action render side by side (mobile + desktop). */
  const formaActionButtonsRef = useRef<Partial<Record<'desktop' | 'mobile', HTMLButtonElement | null>>>({})
  const buyLinkRef = useRef<HTMLAnchorElement | null>(null)
  const [clip, setClip] = useState<Clip | null>(null)
  const [remembered, setRemembered] = useState<RememberedBrief | null>(initialBrief)
  const [sport, setSport] = useState<Sport>(initialSport)
  const poseEngine = usePoseProvider()
  const providerId = poseEngine.providerId
  const sessionState = poseEngine.state
  const providerStatus = poseEngine.status
  const [initialDraft] = useState(() => draftFromRemembered(initialBrief, initialSport, null))
  const [prefDraft, setPrefDraft] = useState<PrefDraft>(initialDraft)
  const [calibrationCm, setCalibrationCm] = useState(() => parseHeightCm(initialDraft.heightCm) ?? FALLBACK_HEIGHT_CM)
  const [tracker, setTracker] = useState(() => createTracker(initialSport, parseHeightCm(initialDraft.heightCm) ?? FALLBACK_HEIGHT_CM))
  const [snapshot, setSnapshot] = useState<MovementSnapshot | null>(null)
  const [lockedReadout, setLockedReadout] = useState<Readout | null>(null)
  const [providerMismatch, setProviderMismatch] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [baseline, setBaseline] = useState<Baseline | null>(null)
  const [persona, setPersona] = useState(initialPersona)
  // Settings belong to the phase they were opened in (setting up, or one results stage), so they close
  // by themselves once the fitting moves into results instead of riding along under the shortlist.
  const [tuningAt, setTuningAt] = useState<string | null>(null)
  const [stock, setStock] = useState<{ phase: StockPhase; price: string | null }>({ phase: 'idle', price: null })
  const [fallbackFrom, setFallbackFrom] = useState<string | null>(null)
  const [bought, setBought] = useState(false)
  const [, startSaving] = useTransition()
  const [voiceOn, setVoiceOn] = useState(false)
  const [twinOpen, setTwinOpen] = useState(false)
  const [caption, setCaption] = useState<string | null>(null)
  const [keyframes, setKeyframes] = useState<Keyframe[]>([])
  const [hero, setHero] = useState<HeroFrame | null>(null)
  const still = useReducedMotion() ?? false
  const [notes, setNotes] = useState<FittingNotesState>(() => ({ ...EMPTY_NOTES, width: initialBrief?.width ?? '' }))
  const [lockLine, setLockLine] = useState<string | null>(null)
  const [choice, setChoice] = useState<ShoePick | null>(null)
  const [example, setExample] = useState<ExampleState | null>(null)
  const [exampleObservation, setExampleObservation] = useState<ExampleObservation | null>(null)
  const [depth, setDepth] = useState<Depth>('considered')
  const [confirmedPrefs, setConfirmedPrefs] = useState<ShopperPrefs | null>(null)
  const [attempted, setAttempted] = useState(false)
  const agent = useGearAgent()
  const speak = useVoice(voiceOn)
  const sampleConfirm = useInlineConfirm()

  const readout = useMemo(() => readoutOf(snapshot, sport), [snapshot, sport])
  const agentOutputs = useMemo(() => outputsOf(agent.messages), [agent.messages])
  const picks = useMemo(() => agentOutputs?.picks ?? [], [agentOutputs])

  // A shared card brought someone in — attribute the landing.
  useEffect(() => {
    if (shareRef) trackStep('share_landing', { ref: shareRef })
  }, [shareRef])

  // Restore a metrics-only baseline from a previous session so the film-again
  // loop survives a reload; hero photos stay session-only by design.
  // Deferred to a frame callback — reading localStorage is a client-side sync.
  useEffect(() => {
    if (baseline) return
    const id = requestAnimationFrame(() => {
      const persisted = loadBaseline(sport)
      if (!persisted) return
      setBaseline({
        readout: { ...readoutOf(null, sport), metrics: persisted.metrics },
        clipName: persisted.clipName,
        heroPhotoUrl: '',
        heroFrame: null,
        capturedAt: persisted.capturedAt,
      })
    })
    return () => cancelAnimationFrame(id)
  }, [sport, baseline])

  const restartAnalysis = useCallback((nextSport: Sport, height: number) => {
    setTracker(createTracker(nextSport, height))
    setCalibrationCm(height)
    setSnapshot(null)
    setLockedReadout(null)
    setLockLine(null)
    setKeyframes([])
    setHero(null)
    setCaption(null)
    setProviderMismatch(false)
  }, [])

  const addKeyframe = useCallback((frame: Keyframe) => {
    setKeyframes((current) => (current.length >= MAX_KEYFRAMES ? current : [...current, frame]))
  }, [])

  const live = useLiveCamera(() => {
    restartAnalysis(sport, calibrationCm)
    void speak(sport === 'running' ? 'Go. Run naturally.' : 'Go. Climb naturally.')
  })
  const liveActive = live.phase === 'starting' || live.phase === 'countdown' || live.phase === 'recording'
  const enteredHeight = parseHeightCm(prefDraft.heightCm)

  const resumePlayback = useCallback(() => {
    const video = videoRef.current
    if (video && video.paused) {
      void video.play()
      setPlaying(true)
    }
  }, [])

  const validationCanStart =
    !example &&
    sport === 'running' &&
    sessionState.status === 'ready' &&
    Boolean(clip || live.phase === 'recording') &&
    !providerMismatch &&
    (enteredHeight === null || enteredHeight === calibrationCm)

  const validation = useValidationCapture({
    videoRef,
    canStart: validationCanStart,
    providerId,
    enteredHeight,
    sport,
    hasClip: Boolean(clip),
    livePhase: live.phase,
    resumePlayback,
  })
  const clearValidation = validation.clear

  // The snapshot callback is the lock boundary: when a clip or live capture yields a
  // ready readout, measurements lock here — not in a post-render effect.
  const handleSnapshot = useCallback(
    (next: MovementSnapshot) => {
      setSnapshot(next)
      if (liveActive || lockedReadout) return
      const nextReadout = readoutOf(next, sport)
      if (!nextReadout.ready) return
      const line = lockedLine(persona.voice, nextReadout.metrics)
      setLockLine(line)
      trackStep('measurements_locked', { sport, source: clip ? 'clip' : 'camera' })
      if (line) void speak(line)
      setLockedReadout(nextReadout)
      // Pausing the clip would starve an active validation capture of frames.
      if (!clip || validation.status === 'recording') return
      const video = videoRef.current
      if (video && !video.paused) {
        video.pause()
        setPlaying(false)
      }
    },
    [liveActive, lockedReadout, sport, persona.voice, clip, speak, validation.status],
  )

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
      if (!heightChanged) return
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
      resumePlayback()
      const video = videoRef.current
      if (video && clip) video.currentTime = 0
    },
    [prefDraft.heightCm, calibrationCm, live.phase, liveActive, clip, sport, agent, restartAnalysis, resumePlayback],
  )

  const updateNotes = useCallback((next: FittingNotesState) => {
    setNotes(next)
  }, [])

  const sentBrief = agent.sentBrief
  const shopping = Boolean(sentBrief)
  const measuredReady = Boolean(lockedReadout?.ready) || (readout.ready && !liveActive)
  const stage = stageOf({
    example: Boolean(example),
    capturing: Boolean(clip) || liveActive || readout.events > 0,
    measuredReady,
    sent: shopping,
    hasOutputs: picks.length > 0,
    hasChoice: Boolean(choice),
  })
  const stageIdle = !example && !clip && !live.stream
  const askingBrief = !example && !liveActive && (stage === 'capture' || stage === 'confirm')

  const briefFlow = useBriefFlow({
    sport,
    draft: prefDraft,
    notes,
    onDraft: updateDraft,
    onNotes: updateNotes,
    askingBrief,
    heightOnScreen: stageIdle,
    surfaceFrame: keyframes[0] ?? null,
    example: Boolean(example),
    panelRef: questionPanelRef,
  })
  const question = briefFlow.question
  const focusBriefField = briefFlow.focusField
  const resetBriefFlow = briefFlow.reset

  const resetSession = useCallback(
    (reason: ResetReason, targetSport: Sport = sport) => {
      agent.reset()
      live.clear()
      setChoice(null)
      setConfirmedPrefs(null)
      setAttempted(false)
      if (clearsBaseline(reason)) {
        setBaseline(null)
        clearPersistedBaseline()
      }
      const saved = reason === 'sport' || reason === 'start-fresh' ? remembered?.bySport[targetSport] : undefined
      if (reason === 'sport' || reason === 'start-fresh') {
        setPrefDraft((d) => ({ ...d, goal: saved?.goal ?? '', surface: saved?.surface ?? '' }))
      }
      setNotes((current) => notesAfterReset(reason, current))
      setLockedReadout(null)
      setCaption(null)
      clearValidation()
      resetBriefFlow(reason === 'sport' || reason === 'start-fresh')
    },
    [agent, live, remembered, sport, clearValidation, resetBriefFlow],
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
    requestAnimationFrame(() => exampleHeadingRef.current?.focus())
  }

  const exitExample = () => {
    setExample(null)
    setExampleObservation(null)
    requestAnimationFrame(() => {
      const button = Object.values(formaActionButtonsRef.current).find((b) => b && b.getClientRects().length > 0)
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

  const trackShopping = useEffectEvent(() => trackStep('shopping_started', { sport }))
  useEffect(() => {
    if (!shopping) return
    trackShopping()
    requestAnimationFrame(() => scrollTo(procurementRef.current))
  }, [shopping])

  const choose = (pick: ShoePick | null) => {
    if (pick) {
      trackStep('pick_chosen', { sport, retailer: pick.retailer })
      requestAnimationFrame(() => scrollTo(procurementRef.current))
    }
    setStock({ phase: 'idle', price: null })
    setFallbackFrom(null)
    setBought(false)
    setChoice(pick)
  }

  // Sold out in the confirmed size: Forma moves to the next pick once and checks that instead.
  const autoAdvance = useCallback(
    (next: ShoePick) => {
      setFallbackFrom(choice?.name ?? null)
      setStock({ phase: 'idle', price: null })
      setBought(false)
      setChoice(next)
    },
    [choice],
  )

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
    poseEngine.beginLoad()
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
    poseEngine.setProviderId(next)
  }

  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || !clip || example) return
    if (e.key === ' ') {
      e.preventDefault()
      togglePlay()
    } else if (e.key === 'r' || e.key === 'R') {
      // Restarting wipes measurements and search results, so R only works while there's nothing to lose.
      if (!lockedReadout && readout.events === 0 && !shopping) restart()
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
    buildConfirmedPrefs({ draft: prefDraft, notes, sport, voice: persona.voice, depth: runDepth })

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
    stockChecked: stock.phase !== 'idle' && stock.phase !== 'checking',
  })
  const visible = visibilityFor(stage, { stockChecked: stock.phase !== 'idle' && stock.phase !== 'checking' })
  const choiceIndex = choice ? picks.findIndex((p) => p.url === choice.url) : -1
  const narration = example
    ? null
    : narrate({
        stage,
        sport,
        activity: activityOf(agent.messages).label,
        topPick: picks[0]?.name ?? null,
        choice: choice ? { name: choice.name, retailer: choice.retailer } : null,
        size: prefDraft.size,
        stock,
        fallbackFrom,
        nextPick: !fallbackFrom && choice ? (picks.find((_, i) => i > choiceIndex) ?? picks.find((p) => p.url !== choice.url))?.name ?? null : null,
        bought,
      })
  const settingsScope = visible.denseStage ? stage : 'setup'
  const tuning = tuningAt === settingsScope

  const afterPaint = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn))

  const personalFilm = () => {
    if (example) setExample(null)
    if (enteredHeight === null) {
      if (!clip && !live.stream) {
        afterPaint(() => {
          const input = stageHeightInputRef.current
          input?.scrollIntoView({ block: 'center', behavior: prefersStill() ? 'auto' : 'smooth' })
          input?.focus({ preventScroll: true })
        })
      } else {
        briefFlow.ask('height')
      }
      return
    }
    if (engine === 'ready') goLive()
  }

  const runNextAction = () => {
    const action = nextStep.action?.kind
    if (action === 'example') showExample()
    else if (action === 'upload-example' || action === 'upload') fileInputRef.current?.click()
    else if (action === 'brief') focusBriefField(missingFields[0] ?? 'size')
    else if (action === 'results') scrollTo(procurementRef.current)
    else if (action === 'recapture') goLive()
  }

  const findShoesAction =
    !example && submitReady && (stage === 'confirm' || (shopping && !question))
      ? { label: sentBrief ? 'Update search' : 'Find my shoes', onClick: submitSearch }
      : null
  const narrationAct = (kind: NarrationAction) => {
    if (kind === 'buy' || kind === 'open') buyLinkRef.current?.click()
    else if (kind === 'shortlist') choose(null)
  }

  const askPanel = question
    ? {
        eyebrow: stage === 'capture' ? 'Forma · while I watch' : 'Forma · your brief',
        prompt: questionPrompt(question, sport),
        controls: (
          <BriefQuestionPanel
            key={question}
            panelRef={questionPanelRef}
            question={question}
            sport={sport}
            draft={prefDraft}
            notes={notes}
            likelySize={null}
            onDraft={briefFlow.answerDraft}
            onNotes={briefFlow.answerNotes}
            onSkip={() => briefFlow.skip(question)}
            onBack={previousQuestion(question) ? () => briefFlow.ask(previousQuestion(question)!) : null}
            onClose={briefFlow.close}
            onAsk={briefFlow.ask}
            describe={briefFlow.describe}
            surfaceGuess={briefFlow.surfaceGuess}
          />
        ),
      }
    : null
  // Confirm phase: dock the question inside the stage (overlay slot is free — no live capture).
  // During capture the pose overlay owns the frame, so questions stay in the strip below.
  const askDocked = !example && stage === 'confirm' ? askPanel : null

  const stripAction = example
    ? { label: 'Upload my clip', onClick: () => fileInputRef.current?.click() }
    : narration
      ? narration.action
        ? { label: narration.action.label, onClick: () => narrationAct(narration.action!.kind) }
        : null
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
        ref={fileInputRef}
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

      <section aria-label="Movement analysis" className="housing flex flex-col gap-3 rounded-2xl p-3 md:gap-4 md:p-5">
        {example ? (
          <ExampleObserver
            sport={sport}
            themeKey={persona.phosphor}
            localSession={providerId === 'mediapipe' && sessionState.status === 'ready' ? sessionState.session : null}
            loadLocalSession={providerId !== 'mediapipe'}
            localSessionFailed={providerId === 'mediapipe' && sessionState.status === 'error'}
            onObservation={setExampleObservation}
            exampleStep={example.step}
            headingRef={exampleHeadingRef}
            overlay={<ExampleWalkthrough sport={sport} state={example} onState={setExample} onExit={exitExample} docked />}
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
                live.phase === 'off' || live.phase === 'error' ? (
                  askDocked ? (
                    <motion.div
                      key={`${question}-${stage}`}
                      initial={still ? false : { opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="absolute inset-0 z-10 flex flex-col overflow-y-auto bg-stage/70 font-mono text-stage-foreground backdrop-blur-md"
                      style={
                        {
                          '--foreground': 'var(--stage-foreground)',
                          '--muted-foreground': 'var(--stage-muted)',
                          '--border': 'color-mix(in oklch, var(--stage-foreground) 30%, transparent)',
                          '--primary': 'var(--stage-foreground)',
                          '--primary-foreground': 'var(--stage)',
                          '--background': 'var(--stage)',
                          '--card': 'var(--stage)',
                          '--ring': 'var(--stage-foreground)',
                        } as CSSProperties
                      }
                    >
                      <div className="m-auto flex w-full max-w-2xl flex-col gap-3 p-5 md:gap-5 md:p-8">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70 engraved">{askDocked.eyebrow}</p>
                        <p className="text-pretty text-xl font-semibold leading-snug phosphor md:text-2xl">{askDocked.prompt}</p>
                        <div className="mt-1 md:mt-2">{askDocked.controls}</div>
                      </div>
                    </motion.div>
                  ) : undefined
                ) : (
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
              onSnapshot={handleSnapshot}
              onFile={loadFile}
              onValidationFrame={validation.onFrame}
              progress={{ events: readout.events, target: MIN_EVENTS, ready: readout.ready }}
              lockedMetrics={lockedMetrics}
              provisional={provisional}
              dense={visible.denseStage}
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
                  inputRef={stageHeightInputRef}
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
            <StageControls
              invite={stage === 'invite'}
              onUpload={() => fileInputRef.current?.click()}
              liveActive={liveActive}
              onStopLive={live.stop}
              filmLabel={enteredHeight === null ? 'Set up my camera' : stage === 'invite' ? 'Film me' : 'Film again'}
              filmDisabled={enteredHeight !== null && engine !== 'ready'}
              filmTitle={
                enteredHeight === null
                  ? 'Set your height first — recordings cannot be re-analysed later'
                  : engine === 'loading'
                    ? 'Pose engine is warming up'
                    : engine === 'error'
                      ? 'Live analysis is unavailable right now — upload a clip instead'
                      : undefined
              }
              onFilm={personalFilm}
              hasClip={Boolean(clip)}
              playing={playing}
              onTogglePlay={togglePlay}
              onRestart={restart}
              showVoice={Boolean(clip || live.stream)}
              voiceOn={voiceOn}
              onToggleVoice={() => setVoiceOn((v) => !v)}
              twinOn={twinOpen || measuredReady}
              onToggleTwin={() => setTwinOpen((v) => !v)}
              showSample={!stageIdle && !liveActive && !shopping}
              sampleArmed={sampleConfirm.armed}
              onSample={() => {
                if (measuredReady && !sampleConfirm.confirm()) return
                showExample()
              }}
            />
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
          mood={narration?.mood ?? mood}
          sport={sport}
          line={example ? exampleCompanion(sport, example.step) : narration ? narration.line : mood === 'ready' && lockLine ? lockLine : nextStep.detail}
          stageLabel={example ? `Example ${example.step + 1} of ${EXAMPLE_STEP_COUNT}` : (narration?.title ?? nextStep.title)}
          step={example ? { ...nextStep, title: stepTitle(sport, example.step) } : narration ? { ...nextStep, title: narration.title } : nextStep}
          floating={visible.denseStage}
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
          onToggleTuning={() => setTuningAt((at) => (at === settingsScope ? null : settingsScope))}
          onPersona={changePersona}
          action={stripAction}
          pips={example ? undefined : { done: answeredCount(prefDraft, notes), total: REQUIRED_QUESTIONS.length }}
          ask={askDocked ? null : askPanel}
          actionButtonsRef={formaActionButtonsRef}
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
                  onPick={briefFlow.ask}
                  compact={!visible.briefExtras}
                  remembered={remembered && visible.briefExtras ? { onForget: forgetRemembered } : undefined}
                  trailing={
                    shopping && findShoesAction ? (
                      <Button size="sm" onClick={findShoesAction.onClick}>
                        {findShoesAction.label}
                      </Button>
                    ) : undefined
                  }
                />
                {briefFlow.filledNote && (
                  <p role="status" className="text-xs leading-relaxed text-muted-foreground">
                    {briefFlow.filledNote}
                  </p>
                )}
                {visible.briefExtras && (
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
                )}
              </div>
            )
          }
        />
      </section>

      <main className={cn('flex min-w-0 flex-col gap-4 pb-52', visible.denseStage ? 'lg:pb-40' : 'lg:pb-0')}>
        {!example && shopping && (
          <div ref={procurementRef} className="scroll-mt-6">
            <AgentPanel
              agent={agent}
              sport={sport}
              choice={choice}
              onChoose={choose}
              onPinBaseline={measuredReady ? () => {
                if (!hero) return
                const capturedAt = new Date().toISOString()
                setBaseline({ readout: panelReadout, clipName: clip?.name ?? 'today', heroPhotoUrl: hero.dataUrl, heroFrame: hero, capturedAt })
                saveBaseline({ sport, clipName: clip?.name ?? 'today', capturedAt, metrics: panelReadout.metrics })
              } : undefined}
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
              takeAway={visible.takeAway}
              onStock={setStock}
              canFallBack={!fallbackFrom}
              onAutoAdvance={autoAdvance}
              onBought={() => setBought(true)}
              buyLinkRef={buyLinkRef}
            />
          </div>
        )}

        {!example && (
          <>
            {visible.readout && readout.events > 0 && (
              <div className="housing rounded-2xl p-4 md:p-5">
                <GaitReadout readout={readout} baseline={baseline?.readout ?? null} provisionalHeight={provisional} />
              </div>
            )}

            {(twinOpen || measuredReady) && (
              <div id="movement-twin" className="scroll-mt-6">
                <MovementTwin
                  sport={sport}
                  pose={hero?.pose ?? null}
                  snapshot={snapshot}
                  readout={panelReadout}
                  requirements={agentOutputs?.profile.requirements ?? []}
                  themeKey={persona.phosphor}
                  onCaptureHero={setHero}
                />
              </div>
            )}

            {visible.validation && sport === 'running' && (clip || liveActive || validation.status === 'ready') && (
              <details name="forma-panels" className="group housing rounded-2xl p-4 md:p-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                  <span className={LABEL}>Local validation</span>
                  <span className="font-mono text-lg leading-none text-muted-foreground" aria-hidden>
                    +
                  </span>
                </summary>
                <div className="mt-3">
                  <ValidationControls
                    status={validation.status}
                    source={validation.source}
                    traceSource={validation.trace?.sourceKind ?? null}
                    onSource={validation.setSource}
                    canStart={validationCanStart}
                    onStart={validation.start}
                    onStop={validation.stop}
                    onExport={validation.exportTrace}
                    stopReason={validation.trace?.stopReason ?? null}
                    frameCount={validation.trace?.frames.length ?? 0}
                    contactCount={validation.trace?.contacts.length ?? 0}
                  />
                </div>
              </details>
            )}

            {baseline && (
              <div className="housing flex flex-col gap-2 rounded-2xl p-4 md:p-5">
                <p className={LABEL}>Baseline · saved on this browser</p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {'Compare your movement across sessions. '}
                  {proof
                    ? `${proof.improved} of ${proof.scored} scored metrics improved vs `
                    : 'Load a clip to compare against '}
                  <span className="font-semibold text-foreground">{baseline.clipName}</span>.
                </p>
                <Button variant="outline" size="lg" className="h-10 w-fit px-4" onClick={() => { setBaseline(null); clearPersistedBaseline() }}>
                  <PinOff aria-hidden />
                  Clear baseline
                </Button>
              </div>
            )}
          </>
        )}

        <TakeAway
          showHero={Boolean(choice && visible.takeAway)}
          hero={hero}
          baseline={baseline}
          panelReadout={panelReadout}
          sport={sport}
          heroPicks={heroPicks}
          themeKey={persona.phosphor}
          onFilmAgain={() => setHero(null)}
        />

        {shopping && picks.length > 0 && !choice && !example && (
          <div id="fitting-notes" className="scroll-mt-6">
            <FittingNotes
              sport={sport}
              readout={panelReadout}
              keyframes={keyframes}
              draft={prefDraft}
              onDraft={(patch) => updateDraft({ ...prefDraft, ...patch })}
              value={notes}
              onChange={updateNotes}
            />
          </div>
        )}
      </main>
    </div>
  )
}
