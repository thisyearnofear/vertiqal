'use client'

import { SlidersHorizontal, X } from 'lucide-react'
import type { Sport } from '@/lib/metrics/readout'
import {
  PHOSPHORS,
  PHOSPHOR_COLOR,
  SHAPES,
  SHAPE_LABEL,
  VOICES,
  VOICE_PROFILE,
  speechFor,
  type Mood,
  type Persona,
} from '@/lib/persona'
import { cn } from '@/lib/utils'
import { FormaAvatar } from './forma-avatar'

function Choice({
  selected,
  onSelect,
  label,
  children,
}: {
  selected: boolean
  onSelect: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onSelect}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-lg p-2 text-xs font-semibold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        selected ? 'housing text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Tuner({ persona, onChange, sport }: { persona: Persona; onChange: (p: Persona) => void; sport: Sport }) {
  const set = (patch: Partial<Persona>) => onChange({ ...persona, ...patch })
  return (
    <div className="flex flex-col gap-5 border-t border-border pt-5 md:flex-row md:gap-8">
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">Body</legend>
        <div role="radiogroup" aria-label="Body shape" className="well flex gap-1 rounded-lg p-1">
          {SHAPES.map((shape) => (
            <Choice key={shape} label={SHAPE_LABEL[shape]} selected={persona.shape === shape} onSelect={() => set({ shape })}>
              <span className="screen flex size-12 items-center justify-center rounded-md">
                <FormaAvatar mood="watching" shape={shape} className="size-10" />
              </span>
              {SHAPE_LABEL[shape]}
            </Choice>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">Phosphor</legend>
        <div role="radiogroup" aria-label="Screen phosphor" className="well flex gap-1 rounded-lg p-1">
          {PHOSPHORS.map((phosphor) => (
            <Choice key={phosphor} label={phosphor} selected={persona.phosphor === phosphor} onSelect={() => set({ phosphor })}>
              <span
                className="size-6 rounded-full"
                style={{ background: PHOSPHOR_COLOR[phosphor], boxShadow: `0 0 10px ${PHOSPHOR_COLOR[phosphor]}` }}
                aria-hidden
              />
              {phosphor}
            </Choice>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex min-w-0 flex-1 flex-col gap-2">
        <legend className="pb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">Voice</legend>
        <div role="radiogroup" aria-label="Voice" className="grid gap-2 sm:grid-cols-3">
          {VOICES.map((voice) => (
            <button
              key={voice}
              type="button"
              role="radio"
              aria-checked={persona.voice === voice}
              onClick={() => set({ voice })}
              className={cn(
                'flex flex-col gap-1 rounded-lg p-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                persona.voice === voice ? 'housing' : 'well',
              )}
            >
              <span className="text-sm font-semibold text-foreground">{VOICE_PROFILE[voice].label}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{VOICE_PROFILE[voice].tagline}</span>
              <span className="pt-1 font-mono text-lg leading-tight text-foreground">
                {`“${speechFor(voice, 'watching', sport)}”`}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

export { Tuner as FormaTuner }

export function FormaConsole({
  persona,
  mood,
  sport,
  tuning,
  tunerId,
  onToggleTuning,
  line,
  compact = false,
}: {
  persona: Persona
  mood: Mood
  sport: Sport
  tuning: boolean
  tunerId: string
  onToggleTuning: () => void
  /** Overrides the mood line, e.g. with the runner's own number when measurements lock. */
  line?: string | null
  compact?: boolean
}) {
  const speech = line ?? speechFor(persona.voice, mood, sport)

  return (
    <div className="flex items-center gap-3 md:gap-4">
      <div className={cn('screen flex shrink-0 items-center justify-center rounded-xl', compact ? 'size-14 sm:size-[4.5rem]' : 'size-20 md:size-24')}>
        <FormaAvatar mood={mood} shape={persona.shape} className={compact ? 'size-12 sm:size-16' : 'size-16 md:size-20'} />
      </div>
      <div className={cn('min-w-0 flex-col gap-1', compact ? 'hidden sm:flex' : 'flex')}>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
          Forma
          <span className="font-mono text-base normal-case tracking-normal">{`· ${VOICE_PROFILE[persona.voice].label.toLowerCase()}`}</span>
        </p>
        <p
          key={speech}
          role="status"
          className={cn(
            'animate-type-in text-pretty font-mono leading-tight text-foreground',
            compact ? 'hidden truncate text-lg sm:block sm:max-w-52' : 'text-2xl',
          )}
        >
          {speech}
        </p>
      </div>
      <button
        type="button"
        aria-expanded={tuning}
        aria-controls={tunerId}
        onClick={onToggleTuning}
        className="flex w-fit shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {tuning ? <X className="size-3.5" aria-hidden /> : <SlidersHorizontal className="size-3.5" aria-hidden />}
        <span className={compact ? 'hidden sm:inline' : undefined}>{tuning ? 'Done tuning' : 'Tune Forma'}</span>
        {compact && <span className="sr-only sm:hidden">{tuning ? 'Done tuning' : 'Tune Forma'}</span>}
      </button>
    </div>
  )
}
