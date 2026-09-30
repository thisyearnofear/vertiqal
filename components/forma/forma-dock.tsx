'use client'

import { useId } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { FormaAvatar } from '@/components/forma/forma-avatar'
import { FormaTuner } from '@/components/forma/forma-console'
import type { NextStep } from '@/lib/fitting/session'
import type { Sport } from '@/lib/metrics/readout'
import type { Mood, Persona } from '@/lib/persona'
import { cn } from '@/lib/utils'

interface FormaDockProps {
  persona: Persona
  mood: Mood
  sport: Sport
  line: string
  stageLabel: string
  step: NextStep
  isExample: boolean
  tuning: boolean
  onToggleTuning: () => void
  onPersona: (persona: Persona) => void
  action: { label: string; onClick: () => void } | null
}

export function FormaDock({ persona, mood, sport, line, stageLabel, step, isExample, tuning, onToggleTuning, onPersona, action }: FormaDockProps) {
  const tunerId = useId()
  return (
    <aside
      aria-label="Forma"
      className={cn(
        'housing rounded-2xl p-4',
        'max-lg:fixed max-lg:inset-x-3 max-lg:z-40 max-lg:p-3',
        'max-lg:bottom-[max(0.75rem,env(safe-area-inset-bottom))]',
        'lg:sticky lg:top-6 lg:self-start',
      )}
    >
      <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2.5 lg:flex lg:flex-col lg:items-stretch lg:gap-4">
        <div className="screen flex size-11 shrink-0 items-center justify-center rounded-xl lg:order-1 lg:size-24">
          <FormaAvatar mood={mood} shape={persona.shape} className="size-9 lg:size-20" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 lg:order-2 lg:gap-1">
          <p className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
            <span className="shrink-0">Forma</span>
            <span className="min-w-0 truncate font-mono text-[0.65rem] normal-case tracking-normal opacity-80 lg:hidden">{`· ${stageLabel}`}</span>
          </p>
          <p role="status" className="line-clamp-2 text-pretty font-mono text-sm leading-snug text-foreground lg:hidden">
            {line}
          </p>
          <div role="status" className="hidden flex-col gap-2 lg:flex">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
              {isExample ? stageLabel : step.eyebrow}
            </p>
            <h2 className="text-base font-semibold leading-tight text-foreground">{step.title}</h2>
            <p className="font-sans text-sm leading-relaxed text-muted-foreground">
              {isExample ? line : step.detail}
            </p>
            {!isExample && line !== step.detail && (
              <p className="font-mono text-xs leading-snug text-foreground">{line}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-expanded={tuning}
          aria-controls={tunerId}
          aria-label={tuning ? 'Close Forma settings' : 'Tune Forma'}
          onClick={onToggleTuning}
          className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:order-4 lg:w-full"
        >
          {tuning ? <X className="size-4" aria-hidden /> : <SlidersHorizontal className="size-4" aria-hidden />}
          <span className="max-lg:sr-only">{tuning ? 'Done' : 'Tune'}</span>
        </button>
        {action && (
          <div className="col-span-3 lg:order-3 lg:w-full">
            <button
              type="button"
              onClick={action.onClick}
              className="min-h-11 w-full whitespace-normal rounded-md border border-primary/60 px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.15em] text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {action.label}
            </button>
          </div>
        )}
      </div>
      <div id={tunerId} hidden={!tuning}>
        {tuning && (
          <div className="max-h-[50vh] overflow-y-auto pt-3 lg:max-h-[60vh]">
            <FormaTuner compact persona={persona} onChange={onPersona} sport={sport} />
          </div>
        )}
      </div>
    </aside>
  )
}
