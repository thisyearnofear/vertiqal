'use client'

import { useId } from 'react'
import { FormaConsole, FormaTuner } from '@/components/forma/forma-console'
import type { Sport } from '@/lib/metrics/readout'
import type { Mood, Persona } from '@/lib/persona'
import { cn } from '@/lib/utils'
import { HowItWorks } from './how-it-works'

const SPORT_LIST: Sport[] = ['running', 'climbing']
const SPORT_CHOICE: Record<Sport, string> = { running: 'I run', climbing: 'I climb' }

interface FittingHeaderProps {
  persona: Persona
  mood: Mood
  sport: Sport
  onSport: (sport: Sport) => void
  onPersona: (persona: Persona) => void
  tuning: boolean
  onToggleTuning: () => void
  lockLine: string | null
}

export function FittingHeader({
  persona,
  mood,
  sport,
  onSport,
  onPersona,
  tuning,
  onToggleTuning,
  lockLine,
}: FittingHeaderProps) {
  const tunerId = useId()
  return (
    <header className="housing flex flex-col gap-3 rounded-2xl px-5 py-4 md:px-7">
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-4xl leading-none tracking-wider text-foreground engraved">vertiqal</p>
        <div className="shrink-0">
          <FormaConsole
            compact
            persona={persona}
            mood={mood}
            sport={sport}
            tuning={tuning}
            tunerId={tunerId}
            onToggleTuning={onToggleTuning}
            line={mood === 'ready' ? lockLine : null}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-balance text-xl font-semibold leading-tight text-foreground lg:text-2xl">
          Find shoes for how you move.
        </h1>
        <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
          {'Your body is the search query. Film a short clip, confirm your brief, and Forma sources shoes that fit the way you actually move.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="group" aria-label="What are we fitting?" className="well flex w-fit gap-1 rounded-lg p-1">
          {SPORT_LIST.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={sport === value}
              onClick={() => onSport(value)}
              className={cn(
                'whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                sport === value ? 'housing text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {SPORT_CHOICE[value]}
            </button>
          ))}
        </div>
        <HowItWorks />
      </div>

      <div id={tunerId} hidden={!tuning}>
        {tuning && <FormaTuner persona={persona} onChange={onPersona} sport={sport} />}
      </div>
    </header>
  )
}
