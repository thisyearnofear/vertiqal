'use client'

import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { feetInches, stepHeight } from '@/lib/fitting/brief-flow'
import { HEIGHT_MAX_CM, HEIGHT_MIN_CM, parseHeightCm } from '@/lib/fitting/prefs'
import { cn } from '@/lib/utils'

interface HeightDialProps {
  id: string
  /** The committed height. Remount (key on this) to reset the local draft when it changes elsewhere. */
  value: number | null
  onCommit: (cm: number) => void
  variant: 'screen' | 'strip'
}

/** Height is committed explicitly: every committed change re-analyses the clip, so stepping must not. */
export function HeightDial({ id, value, onCommit, variant }: HeightDialProps) {
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  const cm = parseHeightCm(draft)
  const dirty = cm !== null && cm !== value
  const commit = () => {
    if (cm !== null && cm !== value) onCommit(cm)
  }
  const screen = variant === 'screen'
  const step = screen
    ? 'flex size-9 items-center justify-center rounded-sm border border-stage-foreground/50 hover:bg-stage-foreground hover:text-stage focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring'
    : 'well flex size-11 items-center justify-center rounded-md text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

  return (
    <div className={cn('flex items-center gap-2', screen ? 'flex-nowrap font-mono text-stage-foreground phosphor' : 'flex-wrap')}>
      <label htmlFor={id} className={screen ? 'text-sm md:text-lg' : 'sr-only'}>
        {screen ? (
          <>
            HEIGHT<span className="hidden sm:inline"> ......</span>
          </>
        ) : (
          'Height in centimetres'
        )}
      </label>
      <button type="button" aria-label="Shorter by 1 cm" onClick={() => setDraft(String(stepHeight(draft, -1)))} className={step}>
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={HEIGHT_MIN_CM}
        max={HEIGHT_MAX_CM}
        placeholder="---"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
        aria-describedby={`${id}-hint`}
        className={cn(
          'w-[4.5ch] appearance-none bg-transparent text-center tabular-nums outline-none [-moz-appearance:textfield] focus-visible:ring-3 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          screen
            ? 'h-9 rounded-sm border border-stage-foreground/50 text-lg placeholder:text-stage-foreground/50 focus-visible:ring-ring md:text-xl'
            : 'well h-11 rounded-md text-base text-foreground focus-visible:ring-ring/50',
        )}
      />
      <button type="button" aria-label="Taller by 1 cm" onClick={() => setDraft(String(stepHeight(draft, 1)))} className={step}>
        <Plus className="size-4" aria-hidden />
      </button>
      <span id={`${id}-hint`} className={cn('tabular-nums', screen ? 'text-sm opacity-80 md:text-lg' : 'text-sm text-muted-foreground')}>
        CM
        <span className={screen ? 'hidden sm:inline' : undefined}>
          {cm === null ? ` · ${HEIGHT_MIN_CM}–${HEIGHT_MAX_CM}` : ` ≈ ${feetInches(cm)}`}
        </span>
      </span>
      {(dirty || value === null) && (
        <button
          type="button"
          onClick={commit}
          disabled={!dirty}
          className={cn(
            'min-h-9 rounded-sm px-3 text-sm uppercase leading-none focus-visible:outline-none focus-visible:ring-3 disabled:opacity-40',
            screen
              ? 'border-2 border-stage-foreground bg-stage-foreground text-stage focus-visible:ring-ring'
              : 'min-h-11 border border-primary bg-primary font-semibold tracking-[0.15em] text-primary-foreground focus-visible:ring-ring/50',
          )}
        >
          Set
        </button>
      )}
    </div>
  )
}
