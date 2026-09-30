'use client'

import { useId, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { FOOT_WIDTHS, INTAKE_OPTIONS, type FittingNotesState } from '@/lib/agent/fitting-notes'
import { HEIGHT_MAX_CM, HEIGHT_MIN_CM, parseBudgetPounds, validatePrefs, type PrefDraft } from '@/lib/fitting/prefs'
import type { Sport } from '@/lib/metrics/readout'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const LABEL = 'text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved'
const INPUT = 'well h-10 w-full rounded-md px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50'

export const BRIEF_FIELD_ID = {
  size: 'brief-size',
  budget: 'brief-budget',
  height: 'brief-height',
  goal: 'brief-goal',
  surface: 'brief-surface',
  niggles: 'brief-niggles',
} as const

export type BriefField = keyof typeof BRIEF_FIELD_ID

interface FittingBriefProps {
  sport: Sport
  draft: PrefDraft
  notes: FittingNotesState
  onDraft: (draft: PrefDraft) => void
  onNotes: (notes: FittingNotesState) => void
  onSubmit: () => void
  attempted: boolean
  submitLabel: string
  submitEnabled: boolean
  submitHint?: string | null
  provisionalHeight: boolean
}

export function FittingBrief({
  sport,
  draft,
  notes,
  onDraft,
  onNotes,
  onSubmit,
  attempted,
  submitLabel,
  submitEnabled,
  submitHint,
  provisionalHeight,
}: FittingBriefProps) {
  const id = useId()
  const options = INTAKE_OPTIONS[sport]
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const touch = (field: string) => setTouched((t) => (t.has(field) ? t : new Set(t).add(field)))
  const allErrors = validatePrefs(draft)
  const fieldError = (field: string, key: keyof typeof allErrors) =>
    (attempted || touched.has(field)) && allErrors[key] ? allErrors[key] : undefined
  const set = (patch: Partial<PrefDraft>) => onDraft({ ...draft, ...patch })

  return (
    <section id="fitting-brief" aria-labelledby={`${id}-heading`} className="flex scroll-mt-6 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-heading`} className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground engraved">
          Your brief
        </h2>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          A clip shows how you move — it cannot measure your size or what you want. Confirm these before Forma searches.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={BRIEF_FIELD_ID.size} className={LABEL}>
            Shoe size <span className="sr-only">(required)</span>
          </label>
          <input
            id={BRIEF_FIELD_ID.size}
            required
            maxLength={20}
            placeholder="e.g. UK 9"
            value={draft.size}
            onChange={(e) => set({ size: e.target.value })}
            onBlur={() => touch('size')}
            aria-invalid={Boolean(fieldError('size', 'size'))}
            className={INPUT}
          />
          {fieldError('size', 'size') && <p className="text-xs text-primary">{fieldError('size', 'size')}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={BRIEF_FIELD_ID.budget} className={LABEL}>
            Max budget (£, UK) <span className="sr-only">(required)</span>
          </label>
          <input
            id={BRIEF_FIELD_ID.budget}
            required
            inputMode="numeric"
            maxLength={6}
            placeholder="e.g. 160"
            value={draft.budgetPounds}
            onChange={(e) => set({ budgetPounds: e.target.value.replace(/[^\d]/g, '') })}
            onBlur={() => touch('budget')}
            aria-invalid={Boolean(fieldError('budget', 'budget'))}
            className={cn(INPUT, 'tabular-nums')}
          />
          {fieldError('budget', 'budget') ? (
            <p className="text-xs text-primary">{fieldError('budget', 'budget')}</p>
          ) : (
            parseBudgetPounds(draft.budgetPounds) !== null && (
              <p className="text-xs text-muted-foreground">{`≈ £${parseBudgetPounds(draft.budgetPounds)}`}</p>
            )
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={BRIEF_FIELD_ID.height} className={LABEL}>
            Height (cm) <span className="sr-only">{`(required, ${HEIGHT_MIN_CM} to ${HEIGHT_MAX_CM})`}</span>
          </label>
          <input
            id={BRIEF_FIELD_ID.height}
            required
            type="number"
            min={HEIGHT_MIN_CM}
            max={HEIGHT_MAX_CM}
            placeholder={`${HEIGHT_MIN_CM}–${HEIGHT_MAX_CM}`}
            value={draft.heightCm}
            onChange={(e) => set({ heightCm: e.target.value })}
            onBlur={() => touch('height')}
            aria-invalid={Boolean(fieldError('height', 'height'))}
            className={cn(INPUT, 'tabular-nums')}
          />
          {fieldError('height', 'height') ? (
            <p className="text-xs text-primary">{fieldError('height', 'height')}</p>
          ) : (
            provisionalHeight && <p className="text-xs text-primary">Distance estimates need your height</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={BRIEF_FIELD_ID.goal} className={LABEL}>
            Goal <span className="sr-only">(required)</span>
          </label>
          <select
            id={BRIEF_FIELD_ID.goal}
            required
            value={draft.goal}
            onChange={(e) => set({ goal: e.target.value })}
            onBlur={() => touch('goal')}
            aria-invalid={Boolean(fieldError('goal', 'goal'))}
            className={INPUT}
          >
            <option value="">Choose…</option>
            {options.goals.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          {fieldError('goal', 'goal') && <p className="text-xs text-primary">{fieldError('goal', 'goal')}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={BRIEF_FIELD_ID.surface} className={LABEL}>
            {options.surfaceLabel} <span className="sr-only">(required)</span>
          </label>
          <select
            id={BRIEF_FIELD_ID.surface}
            required
            value={draft.surface}
            onChange={(e) => set({ surface: e.target.value })}
            onBlur={() => touch('surface')}
            aria-invalid={Boolean(fieldError('surface', 'surface'))}
            className={INPUT}
          >
            <option value="">Choose…</option>
            {options.surfaces.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          {fieldError('surface', 'surface') && <p className="text-xs text-primary">{fieldError('surface', 'surface')}</p>}
        </div>

        <div className="col-span-2 flex flex-col gap-1.5">
          <span id={`${id}-width`} className={LABEL}>
            Foot width <span className="normal-case tracking-normal">(optional)</span>
          </span>
          <div role="group" aria-labelledby={`${id}-width`} className="well flex gap-1 rounded-lg p-1">
            {FOOT_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={notes.width === w}
                onClick={() => onNotes({ ...notes, width: notes.width === w ? '' : w })}
                className={cn(
                  'flex-1 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  notes.width === w ? 'housing text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2 flex flex-col gap-1.5">
          <label htmlFor={BRIEF_FIELD_ID.niggles} className={LABEL}>
            Niggles <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <input
            id={BRIEF_FIELD_ID.niggles}
            maxLength={160}
            placeholder={sport === 'running' ? 'e.g. sore shins after 10k' : 'e.g. bunion on left foot'}
            value={notes.niggles}
            onChange={(e) => onNotes({ ...notes, niggles: e.target.value })}
            className={INPUT}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button size="lg" className="h-11 w-full px-4" disabled={!submitEnabled} onClick={onSubmit}>
          {submitLabel}
          <ArrowRight aria-hidden />
        </Button>
        {submitHint && (
          <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{submitHint}</p>
        )}
      </div>
    </section>
  )
}
