'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from 'lucide-react'
import { EXAMPLE_SCRIPTS, EXAMPLE_STEP_COUNT, EXAMPLE_STEP_MS, exampleMetrics, nextStep } from '@/lib/fitting/example'
import { SPORTS, type Sport } from '@/lib/metrics/readout'
import { Button } from '@/components/ui/button'
import { FittingRationale } from './fitting-rationale'

export interface ExampleState {
  step: number
  playing: boolean
}

interface ExampleWalkthroughProps {
  sport: Sport
  state: ExampleState
  onState: (state: ExampleState) => void
  onExit: () => void
}

export function ExampleWalkthrough({ sport, state, onState, onExit }: ExampleWalkthroughProps) {
  const script = EXAMPLE_SCRIPTS[sport]
  const { step, playing } = state
  const [still] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false,
  )
  const lastStep = step >= EXAMPLE_STEP_COUNT - 1

  useEffect(() => {
    if (!playing || still || lastStep) return
    const timer = window.setInterval(() => {
      onState({ step: nextStep(step, 1), playing: step + 1 < EXAMPLE_STEP_COUNT - 1 })
    }, EXAMPLE_STEP_MS)
    return () => window.clearInterval(timer)
  }, [playing, still, lastStep, step, onState])

  const metrics = exampleMetrics(sport)

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
            Synthetic movement example. Not analysed from a real clip; no live products or stock checked.
          </p>
        </div>
        <Button variant="outline" size="lg" className="h-10 px-4" onClick={onExit}>
          <X aria-hidden />
          Close example
        </Button>
      </div>

      <div className="screen screen-readable flex flex-col gap-6 p-5 font-mono md:p-8" aria-live="polite">
        <p className="text-lg leading-snug opacity-70">{`> STEP ${step + 1} OF ${EXAMPLE_STEP_COUNT} · ${script.steps[step].title.toUpperCase()}`}</p>

        {step === 0 && (
          <div className="flex flex-col gap-4">
            <p className="text-2xl uppercase leading-snug phosphor">{'> Observe movement'}</p>
            <dl className="grid gap-px overflow-hidden rounded-md border border-stage-foreground/25 bg-stage-foreground/25 sm:grid-cols-2">
              {metrics.map((m) => (
                <div key={m.label} className="flex items-baseline justify-between gap-2 bg-stage p-3">
                  <dt className="text-lg uppercase leading-none opacity-60">{m.label}</dt>
                  <dd className="text-2xl tabular-nums leading-tight phosphor">{`${m.value ?? '--'}${m.unit === 'deg' ? '°' : ` ${m.unit}`}`}</dd>
                </div>
              ))}
            </dl>
            <p className="font-sans text-sm leading-relaxed opacity-75">
              Illustration · not a video analysis. In a real fitting these numbers come from your clip.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <p className="text-2xl uppercase leading-snug phosphor">{'> Confirm the brief'}</p>
            <p className="max-w-2xl text-pretty font-sans text-base leading-relaxed opacity-85">{script.steps[1].body}</p>
            <div className="grid gap-px overflow-hidden rounded-md border border-stage-foreground/25 bg-stage-foreground/25 sm:grid-cols-2">
              {['Goal', sport === 'running' ? 'Surface' : 'Rock', 'Size', 'Budget'].map((label) => (
                <p key={label} className="bg-stage p-3 text-lg uppercase leading-none opacity-70">
                  {`${label}: yours to set`}
                </p>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5">
            <p className="text-2xl uppercase leading-snug phosphor">{'> Compare a starting point'}</p>
            <p className="max-w-2xl text-pretty font-sans text-base leading-relaxed opacity-85">{script.steps[2].body}</p>
            <FittingRationale requirements={script.rationale} />
            <div className="flex flex-wrap items-center gap-2">
              {script.alternatives.map((label) => (
                <span key={label} className="rounded-sm border border-stage-foreground/40 px-3 py-1.5 text-lg uppercase leading-none opacity-80">
                  {label}
                </span>
              ))}
            </div>
            <p className="font-sans text-sm leading-relaxed opacity-75">{script.alternativesNote}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-dashed border-stage-foreground/30 pt-4 text-lg leading-none">
          <button
            type="button"
            onClick={() => onState({ step: nextStep(step, -1), playing: false })}
            disabled={step === 0}
            className="flex items-center gap-1 rounded-sm px-1 underline decoration-dotted underline-offset-4 phosphor hover:bg-stage-foreground hover:text-stage focus-visible:outline-none disabled:opacity-40 disabled:no-underline"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {'PREVIOUS'}
          </button>
          {still ? null : playing ? (
            <button
              type="button"
              onClick={() => onState({ step, playing: false })}
              className="flex items-center gap-1 rounded-sm px-1 underline decoration-dotted underline-offset-4 phosphor hover:bg-stage-foreground hover:text-stage focus-visible:outline-none"
            >
              <Pause className="size-4" aria-hidden />
              {'PAUSE'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onState({ step: lastStep ? 0 : step, playing: true })}
              className="flex items-center gap-1 rounded-sm px-1 underline decoration-dotted underline-offset-4 phosphor hover:bg-stage-foreground hover:text-stage focus-visible:outline-none"
            >
              <Play className="size-4" aria-hidden />
              {lastStep ? 'REPLAY' : 'PLAY'}
            </button>
          )}
          {still && lastStep && (
            <button
              type="button"
              onClick={() => onState({ step: 0, playing: false })}
              className="flex items-center gap-1 rounded-sm px-1 underline decoration-dotted underline-offset-4 phosphor hover:bg-stage-foreground hover:text-stage focus-visible:outline-none"
            >
              <RotateCcw className="size-4" aria-hidden />
              {'REPLAY'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onState({ step: nextStep(step, 1), playing: false })}
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
