'use client'

import type { Sport } from '@/lib/metrics/readout'
import { cn } from '@/lib/utils'
import { HowItWorks } from './how-it-works'

const SPORT_LIST: Sport[] = ['running', 'climbing']
const SPORT_CHOICE: Record<Sport, string> = { running: 'I run', climbing: 'I climb' }

interface FittingHeaderProps {
  sport: Sport
  onSport: (sport: Sport) => void
}

export function FittingHeader({ sport, onSport }: FittingHeaderProps) {
  return (
    <header className="housing flex flex-col gap-3 rounded-2xl px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="font-mono text-2xl leading-none tracking-wider text-foreground engraved lg:text-3xl">vertiqal</p>
        <h1 className="text-balance text-base font-semibold leading-tight text-foreground lg:text-lg">
          Find shoes for how you move.
        </h1>
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
    </header>
  )
}
