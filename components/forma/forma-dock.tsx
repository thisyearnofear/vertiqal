'use client'

import { useId, type ReactNode } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { FormaAvatar } from '@/components/forma/forma-avatar'
import { FormaTuner } from '@/components/forma/forma-console'
import type { NextStep } from '@/lib/fitting/session'
import type { Sport } from '@/lib/metrics/readout'
import type { Mood, Persona } from '@/lib/persona'
import { exampleObservationLine, type ExampleObservation } from '@/lib/pose/example-observation'
import { cn } from '@/lib/utils'

const LABEL = 'text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved'
const PRIMARY =
  'min-h-11 w-full whitespace-normal rounded-md border border-primary/60 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.15em] text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
const SECONDARY =
  'min-h-11 w-full whitespace-normal rounded-md border border-border px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.15em] text-foreground hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

interface FormaDockProps {
  persona: Persona
  mood: Mood
  sport: Sport
  line: string
  stageLabel: string
  step: NextStep
  isExample: boolean
  observation?: ExampleObservation | null
  media?: ReactNode
  secondaryAction?: { label: string; onClick: () => void; disabled?: boolean; hint?: string }
  privacyLine?: string
  analysisSettings?: ReactNode
  exampleDetails?: ReactNode
  tuning: boolean
  onToggleTuning: () => void
  onPersona: (persona: Persona) => void
  action: { label: string; onClick: () => void } | null
}

export function FormaDock({
  persona,
  mood,
  sport,
  line,
  stageLabel,
  step,
  isExample,
  observation,
  media,
  secondaryAction,
  privacyLine,
  analysisSettings,
  exampleDetails,
  tuning,
  onToggleTuning,
  onPersona,
  action,
}: FormaDockProps) {
  const tunerId = useId()
  const hintId = useId()
  const hasOptions = Boolean(privacyLine || analysisSettings || exampleDetails || secondaryAction?.hint)

  const tuneButton = (fullWidth: boolean) => (
    <button
      type="button"
      aria-expanded={tuning}
      aria-controls={tunerId}
      aria-label={tuning ? 'Close Forma settings' : 'Tune Forma'}
      onClick={onToggleTuning}
      className={cn(
        'flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        fullWidth && 'w-full',
      )}
    >
      {tuning ? <X className="size-4" aria-hidden /> : <SlidersHorizontal className="size-4" aria-hidden />}
      <span className={fullWidth ? undefined : 'sr-only'}>{tuning ? 'Done' : 'Tune'}</span>
    </button>
  )

  const actions = (source: 'desktop' | 'mobile') =>
    (action || secondaryAction) && (
      <div className={cn('grid gap-2', action && secondaryAction ? 'grid-cols-2' : 'grid-cols-1')}>
        {action && (
          <button data-forma-action={source} type="button" onClick={action.onClick} className={PRIMARY}>
            {action.label}
          </button>
        )}
        {secondaryAction && (
          <button
            type="button"
            aria-describedby={secondaryAction.hint ? hintId : undefined}
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.disabled}
            className={SECONDARY}
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    )

  return (
    <>
      <aside aria-label="Forma" className="order-1 housing rounded-2xl p-3 lg:order-2 lg:sticky lg:top-6 lg:self-start lg:p-4">
        {media}
        <div className={cn('hidden flex-col gap-3 lg:flex', media && 'mt-3')}>
          <div className="flex items-center gap-2.5">
            <div className="screen flex size-14 shrink-0 items-center justify-center rounded-xl">
              <FormaAvatar mood={mood} shape={persona.shape} className="size-12" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">Forma</p>
          </div>
          <div role="status" className="flex flex-col gap-2">
            <p className={LABEL}>{isExample ? stageLabel : step.eyebrow}</p>
            <h2 className="text-base font-semibold leading-tight text-foreground">{step.title}</h2>
            <p className="font-sans text-sm leading-relaxed text-muted-foreground">{isExample ? line : step.detail}</p>
            {!isExample && line !== step.detail && <p className="font-mono text-xs leading-snug text-foreground">{line}</p>}
            {isExample && observation && (
              <p className="font-mono text-xs leading-snug text-muted-foreground">{exampleObservationLine(observation)}</p>
            )}
          </div>
          {actions('desktop')}
          {secondaryAction?.hint && (
            <p id={hintId} className="sr-only">
              {secondaryAction.hint}
            </p>
          )}
        </div>
        <div className={cn('flex items-start gap-2', media && 'mt-3')}>
          {hasOptions ? (
            <details className="group min-w-0 flex-1">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                <span className={LABEL}>Options</span>
                <span className="font-mono text-lg leading-none text-muted-foreground" aria-hidden>
                  +
                </span>
              </summary>
              <div className="mt-2 flex flex-col gap-3">
                {privacyLine && <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{privacyLine}</p>}
                {secondaryAction?.hint && <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{secondaryAction.hint}</p>}
                {exampleDetails}
                {analysisSettings}
              </div>
            </details>
          ) : (
            <span className="flex-1" aria-hidden />
          )}
          <div className="hidden lg:block">{tuneButton(false)}</div>
        </div>
        <div
          id={tunerId}
          hidden={!tuning}
          className="max-lg:fixed max-lg:inset-x-3 max-lg:z-50 max-lg:bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+9rem)]"
        >
          {tuning && (
            <div className="housing overflow-y-auto rounded-2xl p-3 max-lg:max-h-[min(50vh,calc(100dvh-12rem))] lg:max-h-[60vh] lg:rounded-none lg:bg-transparent lg:p-0 lg:pt-3 lg:shadow-none">
              <FormaTuner compact persona={persona} onChange={onPersona} sport={sport} />
            </div>
          )}
        </div>
      </aside>

      <div
        aria-label="Forma"
        className="housing fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-2xl p-3 lg:hidden"
      >
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2.5">
          <div className="screen flex size-11 shrink-0 items-center justify-center rounded-xl">
            <FormaAvatar mood={mood} shape={persona.shape} className="size-9" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
              <span className="shrink-0">Forma</span>
              <span className="min-w-0 truncate font-mono text-[0.65rem] normal-case tracking-normal opacity-80">{`· ${stageLabel}`}</span>
            </p>
            <p role="status" className="line-clamp-2 text-pretty font-mono text-sm leading-snug text-foreground">
              {line}
            </p>
          </div>
          {tuneButton(false)}
          {(action || secondaryAction) && <div className="col-span-3">{actions('mobile')}</div>}
        </div>
      </div>
    </>
  )
}
