'use client'

import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { Camera, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Upload, X } from 'lucide-react'
import {
  EXAMPLE_FOOTAGE,
  EXAMPLE_SCRIPTS,
  EXAMPLE_STEP_COUNT,
  EXAMPLE_STEP_MS,
  exampleMetrics,
  nextStep,
} from '@/lib/fitting/example'
import { SPORTS, type Sport } from '@/lib/metrics/readout'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FittingRationale } from './fitting-rationale'

export interface ExampleState {
  step: number
  playing: boolean
  concept: number
}

interface ExampleWalkthroughProps {
  sport: Sport
  state: ExampleState
  onState: (state: ExampleState) => void
  onExit: () => void
  onFilm: () => void
  onUpload: () => void
  canFilm: boolean
  filmLabel: string
  filmHint?: string
}

function ShoeSketch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 60" className={className} role="img" aria-label="Shoe silhouette illustration — not an actual product">
      <path
        d="M8 44 C8 38 12 36 18 34 L34 28 C42 25 48 24 56 26 C66 28 74 33 84 36 C96 39 110 40 112 44 L112 48 C112 50 110 52 107 52 L14 52 C10 52 8 49 8 44 Z"
        fill="currentColor"
        fillOpacity={0.15}
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path d="M34 28 L40 36 M46 25 L52 33 M58 26 L63 33" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
      <path d="M8 47 H112" stroke="currentColor" strokeWidth={2} strokeDasharray="4 4" opacity={0.4} />
    </svg>
  )
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

export function ExampleWalkthrough({ sport, state, onState, onExit, onFilm, onUpload, canFilm, filmLabel, filmHint }: ExampleWalkthroughProps) {
  const script = EXAMPLE_SCRIPTS[sport]
  const { step, playing, concept } = state
  const still = useReducedMotion() ?? false
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastStep = step >= EXAMPLE_STEP_COUNT - 1

  useEffect(() => {
    if (!playing || still || lastStep) return
    const timer = window.setInterval(() => {
      onState({ ...state, step: nextStep(step, 1), playing: step + 1 < EXAMPLE_STEP_COUNT - 1 })
    }, EXAMPLE_STEP_MS)
    return () => window.clearInterval(timer)
  }, [playing, still, lastStep, step, state, onState])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (playing && !still) void video.play().catch(() => {})
    else video.pause()
  }, [playing, still, step])

  const metrics = exampleMetrics(sport)
  const selected = script.concepts[concept] ?? script.concepts[0]
  const field = 'bg-stage p-3 text-lg uppercase leading-none'

  return (
    <section id="example-walkthrough" aria-labelledby="example-heading" className="housing scroll-mt-6 flex flex-col gap-5 rounded-2xl p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 px-1">
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
            <span className="led" data-state="off" aria-hidden />
            Illustrative fitting · These are not your measurements
          </p>
          <h2 id="example-heading" tabIndex={-1} className="text-balance text-xl font-semibold text-foreground focus-visible:outline-none">
            {`Example ${SPORTS[sport].label.toLowerCase()} walkthrough`}
          </h2>
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            {sport === 'running'
              ? 'Archival footage plus a synthetic fitting. No live products or stock checked.'
              : 'Synthetic movement example. Not analysed from a real clip; no live products or stock checked.'}
          </p>
        </div>
        <Button variant="outline" size="lg" className="h-10 px-4" onClick={onExit}>
          <X aria-hidden />
          Close example
        </Button>
      </div>

      <div className="screen screen-readable flex flex-col gap-6 p-5 font-mono md:p-8" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-lg leading-snug opacity-70">{`> STEP ${step + 1} OF ${EXAMPLE_STEP_COUNT} · ${script.steps[step].title.toUpperCase()}`}</p>
          <div role="group" aria-label="Example steps" className="flex flex-wrap items-center gap-0.5">
            {script.steps.map((s, i) => (
              <button
                key={s.title}
                type="button"
                aria-label={`Step ${i + 1}: ${s.title}`}
                aria-current={i === step ? 'step' : undefined}
                onClick={() => onState({ ...state, step: i, playing: false })}
                className="flex size-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-2.5 rounded-full border border-stage-foreground/60',
                    i === step && 'bg-stage-foreground',
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        {step <= 1 && (
          <div className="flex flex-col gap-2">
            {sport === 'running' ? (
              <>
                <video
                  ref={videoRef}
                  src={EXAMPLE_FOOTAGE.src}
                  muted
                  playsInline
                  controls
                  loop
                  className="aspect-video max-h-72 w-full rounded-md bg-stage-foreground/10 object-cover"
                />
                <p className="text-base uppercase leading-snug opacity-60">
                  {`Loaded locally · example footage · ${EXAMPLE_FOOTAGE.credit} · ${EXAMPLE_FOOTAGE.range}`}
                </p>
                <p className="font-sans text-xs leading-relaxed opacity-60">
                  {`${EXAMPLE_FOOTAGE.rights}. The runner's height is unknown; nothing here is measured from this clip.`}
                </p>
                <details className="font-sans text-xs opacity-70">
                  <summary className="cursor-pointer underline decoration-dotted underline-offset-4">Source &amp; rights</summary>
                  <p className="mt-1 leading-relaxed">
                    {'Clip '}
                    <a className="underline" href={EXAMPLE_FOOTAGE.sourceUrl} target="_blank" rel="noreferrer">
                      Moving Image Archive
                    </a>
                    {' · original film '}
                    <a className="underline" href={EXAMPLE_FOOTAGE.originalUrl} target="_blank" rel="noreferrer">
                      Internet Archive
                    </a>
                    {`. ${EXAMPLE_FOOTAGE.rights}. Archival use implies no endorsement or consent.`}
                  </p>
                </details>
              </>
            ) : (
              <>
                <ClimberSketch className="max-h-64 w-full max-w-sm self-center text-stage-foreground" />
                <p className="text-base uppercase leading-snug opacity-60">Loaded locally · synthetic illustration · no footage</p>
              </>
            )}
          </div>
        )}

        {step === 0 && script.steps[0].body && (
          <p className="max-w-2xl text-pretty font-sans text-base leading-relaxed opacity-85">{script.steps[0].body}</p>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <dl className="grid gap-px overflow-hidden rounded-md border border-stage-foreground/25 bg-stage-foreground/25 sm:grid-cols-2">
              {metrics.map((m) => (
                <div key={m.label} className="flex items-baseline justify-between gap-2 bg-stage p-3">
                  <dt className="text-lg uppercase leading-none opacity-60">{m.label}</dt>
                  <dd className="text-2xl tabular-nums leading-tight phosphor">{`${m.value ?? '--'}${m.unit === 'deg' ? '°' : ` ${m.unit}`}`}</dd>
                </div>
              ))}
            </dl>
            <p className="font-sans text-sm leading-relaxed opacity-75">
              {sport === 'running'
                ? 'Illustrative measurements · not measured from this archive clip.'
                : 'Illustrative measurements · not measured from a real clip.'}{' '}
              In a real fitting these numbers come from your footage.
            </p>
            <FittingRationale requirements={script.rationale} />
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <p className="max-w-2xl text-pretty font-sans text-base leading-relaxed opacity-85">{script.steps[2].body}</p>
            <div className="grid gap-px overflow-hidden rounded-md border border-stage-foreground/25 bg-stage-foreground/25 sm:grid-cols-2">
              <p className={field}>{`Goal: ${script.brief.goal}`}</p>
              <p className={field}>{`Surface: ${script.brief.surface}`}</p>
              <p className={field}>{`Size: ${script.brief.size}`}</p>
              <p className={field}>{`Budget: ${script.brief.budget}`}</p>
              <p className={cn(field, 'opacity-70 sm:col-span-2')}>{`Height: ${script.brief.height}`}</p>
            </div>
            <p className="font-sans text-sm leading-relaxed opacity-75">Example brief shown read-only — it never fills in your real answers.</p>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-5">
            <p className="max-w-2xl text-pretty font-sans text-base leading-relaxed opacity-85">{script.steps[3].body}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {script.concepts.map((item, i) => (
                <button
                  key={item.label}
                  type="button"
                  aria-pressed={concept === i}
                  onClick={() => onState({ ...state, concept: i, playing: false })}
                  className={cn(
                    'flex flex-col items-start gap-2 rounded-md border p-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    concept === i ? 'border-stage-foreground/80 bg-stage-foreground/10' : 'border-stage-foreground/25',
                  )}
                >
                  <ShoeSketch className="h-14 w-full text-stage-foreground/80" />
                  <span className="text-lg uppercase leading-tight">
                    {i === 0 ? `${item.label} · primary` : item.label}
                  </span>
                  <span className="font-sans text-xs leading-relaxed opacity-70">{item.tradeoff}</span>
                </button>
              ))}
            </div>
            <FittingRationale requirements={script.rationale} />
            <p className="font-sans text-sm leading-relaxed opacity-75">{script.conceptsNote}</p>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <p className="max-w-2xl text-pretty font-sans text-base leading-relaxed opacity-85">{script.steps[4].body}</p>
            <div className="flex flex-col gap-2 rounded-md border border-stage-foreground/30 p-4">
              <p className="text-lg uppercase leading-snug text-stage-foreground/80">{'Not run · no availability verified'}</p>
              <div className="grid gap-px overflow-hidden rounded-md border border-stage-foreground/25 bg-stage-foreground/25 sm:grid-cols-2">
                <p className={field}>{`Target: ${selected.label}`}</p>
                <p className={field}>{`Submitted size: ${script.brief.size}`}</p>
                <p className={cn(field, 'opacity-70')}>{'Observed page: Not captured'}</p>
                <p className={cn(field, 'opacity-70')}>{'HTTP: Not captured'}</p>
              </div>
              <p className="font-sans text-sm leading-relaxed opacity-75">
                A real check would include a screenshot and session replay when available — none exist here because nothing was run.
              </p>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-4 rounded-md border border-stage-foreground/30 p-4 font-sans">
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold text-stage-foreground">Make it your fitting</p>
              <p className="text-pretty text-sm leading-relaxed text-stage-foreground/75">{script.steps[5].body}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" className="h-10 px-4 text-sm" onClick={onUpload}>
                <Upload aria-hidden />
                Upload my clip
              </Button>
              <Button variant="outline" size="lg" className="h-10 px-4 text-sm" onClick={onFilm} disabled={!canFilm} title={filmHint}>
                <Camera aria-hidden />
                {filmLabel}
              </Button>
            </div>
            {filmHint && <p className="text-xs leading-relaxed text-stage-foreground/70">{filmHint}</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-dashed border-stage-foreground/30 pt-4 text-lg leading-none">
          <button
            type="button"
            onClick={() => onState({ ...state, step: nextStep(step, -1), playing: false })}
            disabled={step === 0}
            className="flex items-center gap-1 rounded-sm px-1 underline decoration-dotted underline-offset-4 phosphor hover:bg-stage-foreground hover:text-stage focus-visible:outline-none disabled:opacity-40 disabled:no-underline"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {'PREVIOUS'}
          </button>
          {still ? null : playing ? (
            <button
              type="button"
              onClick={() => onState({ ...state, playing: false })}
              className="flex items-center gap-1 rounded-sm px-1 underline decoration-dotted underline-offset-4 phosphor hover:bg-stage-foreground hover:text-stage focus-visible:outline-none"
            >
              <Pause className="size-4" aria-hidden />
              {'PAUSE'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onState(lastStep ? { step: 0, playing: !still, concept: 0 } : { ...state, playing: true })}
              className="flex items-center gap-1 rounded-sm px-1 underline decoration-dotted underline-offset-4 phosphor hover:bg-stage-foreground hover:text-stage focus-visible:outline-none"
            >
              <Play className="size-4" aria-hidden />
              {lastStep ? 'REPLAY' : 'PLAY'}
            </button>
          )}
          {still && lastStep && (
            <button
              type="button"
              onClick={() => onState({ step: 0, playing: false, concept: 0 })}
              className="flex items-center gap-1 rounded-sm px-1 underline decoration-dotted underline-offset-4 phosphor hover:bg-stage-foreground hover:text-stage focus-visible:outline-none"
            >
              <RotateCcw className="size-4" aria-hidden />
              {'REPLAY'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onState({ ...state, step: nextStep(step, 1), playing: false })}
            disabled={lastStep}
            className="flex items-center gap-1 rounded-sm px-1 underline decoration-dotted underline-offset-4 phosphor hover:bg-stage-foreground hover:text-stage focus-visible:outline-none disabled:opacity-40 disabled:no-underline"
          >
            {'NEXT'}
            <ChevronRight className="size-4" aria-hidden />
          </button>
          {still && (
            <span className="font-sans text-xs uppercase tracking-wider opacity-60">Reduced motion: step through manually</span>
          )}
        </div>
      </div>
    </section>
  )
}
