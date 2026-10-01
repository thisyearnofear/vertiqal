'use client'

import { useEffect } from 'react'
import { useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from 'lucide-react'
import {
  EXAMPLE_SCRIPTS,
  EXAMPLE_STEP_COUNT,
  EXAMPLE_STEP_MS,
  exampleMetrics,
  nextStep,
} from '@/lib/fitting/example'
import { SPORTS, type Sport } from '@/lib/metrics/readout'
import { cn } from '@/lib/utils'
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

export function ExampleWalkthrough({ sport, state, onState, onExit }: ExampleWalkthroughProps) {
  const script = EXAMPLE_SCRIPTS[sport]
  const { step, playing, concept } = state
  const still = useReducedMotion() ?? false
  const lastStep = step >= EXAMPLE_STEP_COUNT - 1

  useEffect(() => {
    if (!playing || still || lastStep) return
    const timer = window.setInterval(() => {
      onState({ ...state, step: nextStep(step, 1), playing: step + 1 < EXAMPLE_STEP_COUNT - 1 })
    }, EXAMPLE_STEP_MS)
    return () => window.clearInterval(timer)
  }, [playing, still, lastStep, step, state, onState])

  const metrics = exampleMetrics(sport)
  const selected = script.concepts[concept] ?? script.concepts[0]
  const field = 'bg-stage p-3 text-lg uppercase leading-none'
  const stageHeadline = [
    'See movement become a fitting',
    'What movement can tell us',
    script.steps[2].title,
    script.steps[3].title,
    script.steps[4].title,
    'Make this about your movement',
  ][step] ?? script.steps[step].title

  return (
    <section id="example-walkthrough" aria-labelledby="example-heading" className="housing scroll-mt-6 flex flex-col gap-5 rounded-2xl p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 px-1">
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
            <span className="led" data-state="off" aria-hidden />
            Illustrative fitting · These are not your measurements
          </p>
          <h2 id="example-heading" tabIndex={-1} className="text-balance text-xl font-semibold text-foreground focus-visible:outline-none">
            {stageHeadline}
          </h2>
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            {sport === 'running'
              ? 'AI-generated footage plus an illustrative fitting. No live products or stock checked.'
              : 'Synthetic movement example. Not analysed from a real clip; no live products or stock checked.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="flex min-h-11 items-center gap-1.5 rounded-md border border-stage-foreground/30 px-4 font-mono text-sm uppercase leading-none text-stage-foreground underline-offset-4 hover:bg-stage-foreground hover:text-stage focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X className="size-4" aria-hidden />
          Close example
        </button>
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

        {step === 0 && (
          <div className="flex flex-col gap-3">
            <p className="max-w-2xl text-pretty font-sans text-base leading-relaxed opacity-85">
              {script.steps[0].body} Watch the motion panel while this short walkthrough shows observe, brief, directions, receipt and handoff.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <p className="w-fit rounded-md border border-stage-foreground/40 bg-stage-foreground/10 px-3 py-1.5 font-mono text-sm uppercase leading-none">
              Illustrative readings — not extracted from this clip
            </p>
            <dl className="grid gap-px overflow-hidden rounded-md border border-stage-foreground/25 bg-stage-foreground/25 sm:grid-cols-2">
              {metrics.map((m) => (
                <div key={m.label} className="flex items-baseline justify-between gap-2 bg-stage p-3">
                  <dt className="text-lg uppercase leading-none opacity-60">{m.label}</dt>
                  <dd className="text-2xl tabular-nums leading-tight phosphor">{`${m.value ?? '--'}${m.unit === 'deg' ? '°' : ` ${m.unit}`}`}</dd>
                </div>
              ))}
            </dl>
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
            <div className="flex flex-col gap-3 rounded-md border border-stage-foreground/60 bg-stage-foreground/10 p-4">
              <ShoeSketch className="h-16 w-full text-stage-foreground/80" />
              <p className="text-xl uppercase leading-tight">{`${selected.label} · ${concept === 0 ? 'Starting direction' : 'Selected direction'}`}</p>
              <p className="font-sans text-sm leading-relaxed opacity-75">{selected.tradeoff}</p>
            </div>
            <div role="group" aria-label="Alternative directions" className="grid gap-3 sm:grid-cols-2">
              {script.concepts
                .map((item, i) => ({ item, i }))
                .filter(({ i }) => i !== concept)
                .map(({ item, i }) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => onState({ ...state, concept: i, playing: false })}
                    className="flex flex-col items-start gap-1.5 rounded-md border border-stage-foreground/25 p-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="text-base uppercase leading-tight">{item.label}</span>
                    <span className="font-sans text-xs leading-relaxed opacity-70">{item.tradeoff}</span>
                  </button>
                ))}
            </div>
            <p className="font-sans text-sm leading-relaxed opacity-75">{script.conceptsNote}</p>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <p className="max-w-2xl text-pretty font-sans text-base leading-relaxed opacity-85">{script.steps[4].body}</p>
            <div className="flex flex-col gap-3 rounded-md border border-stage-foreground/30 p-4">
              <p className="text-base uppercase leading-snug text-stage-foreground/80">{'Template — not a completed stock check'}</p>
              <dl className="flex flex-col gap-2 font-sans text-sm leading-relaxed opacity-85">
                <div><dt className="font-semibold">Submitted size</dt><dd className="opacity-80">{`Exact size you asked Forma to check against the observed controls — here ${script.brief.size}.`}</dd></div>
                <div><dt className="font-semibold">Observed URL</dt><dd className="opacity-80">The page actually checked for {selected.label.toLowerCase()}, recorded so you can verify it.</dd></div>
                <div><dt className="font-semibold">Check time</dt><dd className="opacity-80">When the observation ran, so stale receipts are obvious.</dd></div>
                <div><dt className="font-semibold">Screenshot &amp; replay</dt><dd className="opacity-80">Visual evidence of the check when available — execution evidence, not a guarantee of stock.</dd></div>
              </dl>
              <p className="font-sans text-sm leading-relaxed opacity-75">
                Nothing was run for this example, so no page, time or verdict exists to show.
              </p>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-3 rounded-md border border-stage-foreground/30 p-4 font-sans">
            <p className="text-xl font-semibold leading-tight text-stage-foreground">Make this about your movement</p>
            <p className="max-w-2xl text-pretty text-sm leading-relaxed text-stage-foreground/75">
              {script.steps[5].body} Upload a clip or film yourself from the motion panel — the example numbers stay synthetic; only your footage is measured.
            </p>
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
              {'PAUSE WALKTHROUGH'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onState(lastStep ? { step: 0, playing: !still, concept: 0 } : { ...state, playing: true })}
              className="flex items-center gap-1 rounded-sm px-1 underline decoration-dotted underline-offset-4 phosphor hover:bg-stage-foreground hover:text-stage focus-visible:outline-none"
            >
              <Play className="size-4" aria-hidden />
              {lastStep ? 'REPLAY' : 'PLAY WALKTHROUGH'}
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
