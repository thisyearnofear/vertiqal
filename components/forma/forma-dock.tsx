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
  'min-h-11 whitespace-normal rounded-md border border-primary bg-primary px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.15em] text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
const SECONDARY =
  'min-h-11 whitespace-normal rounded-md border border-border px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.15em] text-foreground hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

interface FormaDockProps {
  persona: Persona
  mood: Mood
  sport: Sport
  line: string
  stageLabel: string
  step: NextStep
  isExample: boolean
  observation?: ExampleObservation | null
  /** The stage already shows the primary action, so the strip and mobile bar leave it out. */
  actionInStage?: boolean
  /** When Forma is asking a brief question, it replaces the step copy and its answers render below. */
  ask?: { eyebrow: string; prompt: string; controls: ReactNode } | null
  /** Required brief answers so far. */
  pips?: { done: number; total: number }
  /** In-flow content under the strip, e.g. the brief sentence. */
  footer?: ReactNode
  secondaryAction?: { label: string; onClick: () => void; disabled?: boolean; hint?: string }
  privacyLine?: string
  analysisSettings?: ReactNode
  tuning: boolean
  onToggleTuning: () => void
  onPersona: (persona: Persona) => void
  action: { label: string; onClick: () => void } | null
  /** Results stages: Forma follows the shopper down the page on desktop too, as on mobile. */
  floating?: boolean
}

function Pips({ done, total }: { done: number; total: number }) {
  return (
    <span className="flex items-center gap-1" role="img" aria-label={`${done} of ${total} brief answers`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn('h-1.5 w-3 rounded-full bg-foreground/20', i < done && 'bg-primary')} />
      ))}
    </span>
  )
}

/** Forma's strip under the stage on desktop; the same element becomes a fixed bar at the bottom on mobile. */
export function FormaDock({
  persona,
  mood,
  sport,
  line,
  stageLabel,
  step,
  isExample,
  observation,
  actionInStage = false,
  ask,
  pips,
  footer,
  secondaryAction,
  privacyLine,
  analysisSettings,
  tuning,
  onToggleTuning,
  onPersona,
  action,
  floating = false,
}: FormaDockProps) {
  const tunerId = useId()
  const hintId = useId()
  const showActions = !actionInStage && !ask && Boolean(action || secondaryAction)

  const actions = (source: 'desktop' | 'mobile') =>
    showActions && (
      <div
        className={cn(
          'gap-2',
          source === 'mobile'
            ? cn('grid lg:hidden [&>button]:w-full', action && secondaryAction ? 'grid-cols-2' : 'grid-cols-1')
            : 'hidden shrink-0 items-center lg:flex',
        )}
      >
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

  const eyebrow = ask ? ask.eyebrow : isExample ? 'Forma' : `Forma · ${step.eyebrow}`

  return (
    <div className="flex flex-col gap-2">
      <div
        role="region"
        aria-label="Forma"
        data-floating={floating || undefined}
        className={cn(
          'forma-bar flex flex-col gap-3 max-lg:fixed max-lg:inset-x-3 max-lg:bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:z-40 max-lg:rounded-2xl max-lg:p-3',
          floating
            ? 'lg:fixed lg:bottom-4 lg:left-1/2 lg:z-40 lg:w-[min(calc(100%-2rem),64rem)] lg:-translate-x-1/2 lg:rounded-2xl lg:p-3 lg:animate-in lg:fade-in lg:slide-in-from-bottom-2'
            : 'lg:border-t lg:border-dashed lg:border-border lg:pt-4',
        )}
      >
        <div className="flex items-center gap-3 lg:gap-4">
          <div className="screen flex size-11 shrink-0 items-center justify-center rounded-xl lg:size-14">
            <FormaAvatar mood={ask ? 'asking' : mood} shape={persona.shape} className="size-9 lg:size-12" />
          </div>
          <div role="status" className="flex min-w-0 flex-1 flex-col gap-0.5 lg:gap-1">
            <p className={cn(LABEL, 'flex items-center gap-3')}>
              <span className="min-w-0 truncate">
                <span className="lg:hidden">{ask ? ask.eyebrow : `Forma · ${stageLabel}`}</span>
                <span className="hidden lg:inline">{eyebrow}</span>
              </span>
              {pips && !isExample && <Pips done={pips.done} total={pips.total} />}
            </p>
            {ask ? (
              <p className="text-pretty text-sm font-semibold leading-snug text-foreground lg:text-base">{ask.prompt}</p>
            ) : (
              <>
                {!isExample && <p className="hidden text-base font-semibold leading-tight text-foreground lg:block">{step.title}</p>}
                <p className="line-clamp-2 text-pretty font-mono text-sm leading-snug text-foreground lg:line-clamp-none lg:text-muted-foreground">
                  {line}
                </p>
                {isExample && observation && (
                  <p className="hidden font-mono text-xs leading-snug text-muted-foreground lg:block">{exampleObservationLine(observation)}</p>
                )}
              </>
            )}
          </div>
          {actions('desktop')}
          <button
            type="button"
            aria-expanded={tuning}
            aria-controls={tunerId}
            aria-label={tuning ? 'Close Forma settings' : 'Forma settings'}
            onClick={onToggleTuning}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {tuning ? <X className="size-4" aria-hidden /> : <SlidersHorizontal className="size-4" aria-hidden />}
          </button>
        </div>
        {ask && <div className="lg:pl-[4.5rem]">{ask.controls}</div>}
        {actions('mobile')}
        {secondaryAction?.hint && (
          <p id={hintId} className="sr-only">
            {secondaryAction.hint}
          </p>
        )}
      </div>

      {footer}

      <div
        id={tunerId}
        hidden={!tuning}
        className={cn(
          'max-lg:fixed max-lg:inset-x-3 max-lg:bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+9rem)] max-lg:z-50',
          floating && 'lg:fixed lg:bottom-28 lg:left-1/2 lg:z-50 lg:w-[min(calc(100%-2rem),64rem)] lg:-translate-x-1/2',
        )}
      >
        {tuning && (
          <div
            className={cn(
              'housing flex flex-col gap-3 overflow-y-auto rounded-2xl p-3 max-lg:max-h-[min(50vh,calc(100dvh-12rem))]',
              floating ? 'lg:max-h-[min(60vh,calc(100dvh-10rem))]' : 'lg:rounded-none lg:bg-transparent lg:p-0 lg:pt-2 lg:shadow-none',
            )}
          >
            <FormaTuner persona={persona} onChange={onPersona} sport={sport} />
            {(privacyLine || secondaryAction?.hint || analysisSettings) && (
              <div className="flex flex-col gap-3 border-t border-dashed border-border pt-3">
                {privacyLine && <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{privacyLine}</p>}
                {secondaryAction?.hint && <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{secondaryAction.hint}</p>}
                {analysisSettings}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
