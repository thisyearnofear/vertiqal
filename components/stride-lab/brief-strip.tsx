'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { FOOT_WIDTHS, INTAKE_OPTIONS, type FittingNotesState } from '@/lib/agent/fitting-notes'
import { BUDGET_PRESETS, DEFAULT_SIZE, UK_SIZES, feetInches, isAnswered, questionPrompt, type BriefQuestion } from '@/lib/fitting/brief-flow'
import { parseBudgetPounds, parseHeightCm, type PrefDraft } from '@/lib/fitting/prefs'
import type { Sport } from '@/lib/metrics/readout'
import { cn } from '@/lib/utils'
import { HeightDial } from './height-dial'

export const QUESTION_ID = 'forma-question'

const CHIP =
  'min-h-10 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
const CHIP_ON = 'border-primary bg-primary/15 text-foreground'
const CHIP_OFF = 'border-border text-foreground hover:bg-foreground/5'
const NAV =
  'flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40'
const OTHER_INPUT =
  'well h-10 w-28 rounded-md px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50'

function Chips({
  label,
  options,
  value,
  onPick,
  render = (o) => o,
  suggested,
}: {
  label: string
  options: readonly string[]
  value: string
  onPick: (v: string) => void
  render?: (o: string) => ReactNode
  suggested?: string | null
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto pb-1 max-lg:flex-nowrap lg:flex-wrap">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onPick(o)}
          className={cn(CHIP, value === o ? CHIP_ON : suggested === o ? 'border-dashed border-primary/70 text-foreground' : CHIP_OFF)}
        >
          {render(o)}
          {suggested === o && value !== o && <span className="ml-1.5 text-xs font-normal normal-case tracking-normal text-muted-foreground">· looks like</span>}
        </button>
      ))}
    </div>
  )
}

function Other({ label, placeholder, numeric, onSet }: { label: string; placeholder: string; numeric?: boolean; onSet: (v: string) => void }) {
  const [text, setText] = useState('')
  const value = numeric ? text.replace(/[^\d]/g, '') : text.trim()
  return (
    <div className="flex items-center gap-2">
      <input
        aria-label={label}
        inputMode={numeric ? 'numeric' : undefined}
        maxLength={numeric ? 6 : 20}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value) onSet(value)
        }}
        className={OTHER_INPUT}
      />
      <button type="button" disabled={!value} onClick={() => onSet(value)} className={cn(CHIP, CHIP_OFF, 'disabled:opacity-40')}>
        Set
      </button>
    </div>
  )
}

function SizeChips({ value, likely, onPick }: { value: string; likely: string; onPick: (v: string) => void }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const centre = value || likely
  useEffect(() => {
    const row = rowRef.current
    const chip = row?.querySelector<HTMLElement>(`[data-size="${centre}"]`)
    if (row && chip) row.scrollLeft = chip.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2
  }, [centre])
  return (
    <div
      ref={rowRef}
      role="group"
      aria-label="UK size"
      className="relative flex flex-nowrap gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]"
    >
      {UK_SIZES.map((s) => (
        <button
          key={s}
          data-size={s}
          type="button"
          aria-pressed={value === s}
          onClick={() => onPick(s)}
          className={cn(CHIP, 'tabular-nums', value === s ? CHIP_ON : s === likely ? 'border-foreground/40 text-foreground' : CHIP_OFF)}
        >
          {s}
        </button>
      ))}
    </div>
  )
}

interface BriefQuestionPanelProps {
  question: BriefQuestion
  sport: Sport
  draft: PrefDraft
  notes: FittingNotesState
  likelySize: string | null
  onDraft: (patch: Partial<PrefDraft>) => void
  onNotes: (patch: Partial<FittingNotesState>) => void
  onSkip: () => void
  onBack: (() => void) | null
  onClose: () => void
  /** Opens another question (used by the "tell me in a sentence" link). */
  onAsk?: (q: BriefQuestion) => void
  /** Free-text brief parse; presence enables the describe panel. */
  describe?: { pending: boolean; error: string | null; onSubmit: (text: string) => void }
  /** Clip-based surface suggestion; presence enables the guess button. */
  surfaceGuess?: { pending: boolean; suggestion: string | null; message: string | null; onGuess: () => void }
}

function DescribeControls({ sport, describe }: { sport: Sport; describe: NonNullable<BriefQuestionPanelProps['describe']> }) {
  const [text, setText] = useState('')
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) describe.onSubmit(text.trim())
      }}
    >
      <div className="flex items-center gap-2">
        <input
          aria-label="Describe your shoes and fit in a sentence"
          maxLength={300}
          placeholder={
            sport === 'running'
              ? 'Pegasus 40, UK 9, a bit tight in the toes, up to £150'
              : 'Solution, UK 7, too painful for long sessions, under £140'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={cn(OTHER_INPUT, 'w-full max-w-md')}
        />
        <button type="submit" disabled={!text.trim() || describe.pending} className={cn(CHIP, CHIP_OFF, 'disabled:opacity-40')}>
          {describe.pending ? 'Forma is reading…' : 'Fill my brief'}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">Sent as text to Grok (xAI) via the AI gateway. No video or images.</p>
      {describe.error && (
        <p role="alert" className="text-xs font-semibold leading-relaxed text-primary">
          {describe.error}
        </p>
      )}
    </form>
  )
}

/** One brief question at a time, answered with a tap wherever the answer has a known shape. */
export function BriefQuestionPanel({
  question,
  sport,
  draft,
  notes,
  likelySize,
  onDraft,
  onNotes,
  onSkip,
  onBack,
  onClose,
  onAsk,
  describe,
  surfaceGuess,
}: BriefQuestionPanelProps) {
  const options = INTAKE_OPTIONS[sport]
  const optional = question === 'width' || question === 'niggles' || question === 'describe'
  const [niggles, setNiggles] = useState(notes.niggles)
  const budget = parseBudgetPounds(draft.budgetPounds)
  const height = parseHeightCm(draft.heightCm)

  return (
    <div id={QUESTION_ID} tabIndex={-1} role="group" aria-label={questionPrompt(question, sport)} className="flex flex-col gap-2 focus-visible:outline-none">
      {question === 'height' && <HeightDial key={height ?? 'none'} id="strip-height" variant="strip" value={height} onCommit={(cm) => onDraft({ heightCm: String(cm) })} />}
      {question === 'goal' && (
        <div className="flex flex-col gap-2">
          <Chips label="Goal" options={options.goals} value={draft.goal} onPick={(goal) => onDraft({ goal })} />
          {onAsk && describe && (
            <button
              type="button"
              onClick={() => onAsk('describe')}
              className="w-fit rounded-sm text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Or tell me in a sentence ›
            </button>
          )}
        </div>
      )}
      {question === 'surface' && (
        <div className="flex flex-col gap-2">
          <Chips
            label={options.surfaceLabel}
            options={options.surfaces}
            value={draft.surface}
            onPick={(surface) => onDraft({ surface })}
            suggested={surfaceGuess?.suggestion}
          />
          {surfaceGuess && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={surfaceGuess.onGuess}
                disabled={surfaceGuess.pending}
                className={cn(CHIP, CHIP_OFF, 'disabled:opacity-40')}
              >
                {surfaceGuess.pending ? 'Forma is looking…' : 'Guess from my clip'}
              </button>
              <span className="text-xs leading-relaxed text-muted-foreground">Sends one still to Grok.</span>
              {surfaceGuess.message && <span className="text-xs font-semibold leading-relaxed text-primary">{surfaceGuess.message}</span>}
            </div>
          )}
        </div>
      )}
      {question === 'describe' && describe && <DescribeControls sport={sport} describe={describe} />}
      {question === 'size' && (
        <div className="flex flex-col gap-2">
          <SizeChips value={draft.size} likely={likelySize ?? DEFAULT_SIZE} onPick={(size) => onDraft({ size })} />
          <Other label="Other size, e.g. EU 43 or US 10" placeholder="EU 43 / US 10" onSet={(size) => onDraft({ size })} />
        </div>
      )}
      {question === 'budget' && (
        <div className="flex flex-wrap items-center gap-2">
          <Chips
            label="Budget"
            options={BUDGET_PRESETS.map(String)}
            value={budget === null ? '' : String(budget)}
            onPick={(budgetPounds) => onDraft({ budgetPounds })}
            render={(o) => `£${o}`}
          />
          <Other label="Other budget in pounds" placeholder="£ other" numeric onSet={(budgetPounds) => onDraft({ budgetPounds })} />
        </div>
      )}
      {question === 'width' && (
        <Chips label="Foot width" options={FOOT_WIDTHS} value={notes.width} onPick={(w) => onNotes({ width: notes.width === w ? '' : (w as FittingNotesState['width']) })} />
      )}
      {question === 'niggles' && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onNotes({ niggles: niggles.trim() })
          }}
        >
          <input
            aria-label="Niggles or past issues"
            maxLength={160}
            placeholder={sport === 'running' ? 'e.g. sore shins after 10k' : 'e.g. bunion on left foot'}
            value={niggles}
            onChange={(e) => setNiggles(e.target.value)}
            className={cn(OTHER_INPUT, 'w-full max-w-md')}
          />
          <button type="submit" className={cn(CHIP, CHIP_OFF)}>
            Done
          </button>
        </form>
      )}
      <div className="flex items-center gap-1">
        {onBack && (
          <button type="button" onClick={onBack} className={NAV}>
            <ChevronLeft className="size-3.5" aria-hidden />
            Back
          </button>
        )}
        <span className="flex-1" />
        {optional ? (
          <button type="button" onClick={onClose} className={NAV}>
            Close
          </button>
        ) : (
          <button type="button" onClick={onSkip} className={NAV}>
            {isAnswered(question, draft, notes) ? 'Next' : 'Skip'}
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}

function Blank({ question, value, empty, active, onPick }: { question: BriefQuestion; value: string | null; empty: string; active: boolean; onPick: (q: BriefQuestion) => void }) {
  return (
    <button
      type="button"
      aria-label={value ? `Change ${empty}: ${value}` : `Add ${empty}`}
      aria-current={active ? 'step' : undefined}
      onClick={() => onPick(question)}
      className={cn(
        'rounded-sm px-0.5 underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        value ? 'font-semibold text-foreground' : 'font-mono text-muted-foreground',
        active && 'bg-primary/15 decoration-primary',
      )}
    >
      {value ?? `[ ${empty} ]`}
    </button>
  )
}

interface BriefSentenceProps {
  sport: Sport
  draft: PrefDraft
  notes: FittingNotesState
  active: BriefQuestion | null
  onPick: (q: BriefQuestion) => void
  trailing?: ReactNode
  /** When set, the sentence was pre-filled from last time and can be forgotten. */
  remembered?: { onForget: () => void }
}

/** The confirmed brief as one editable sentence; every blank reopens its question in the Forma strip. */
export function BriefSentence({ sport, draft, notes, active, onPick, trailing, remembered }: BriefSentenceProps) {
  const budget = parseBudgetPounds(draft.budgetPounds)
  const height = parseHeightCm(draft.heightCm)
  const blank = (question: BriefQuestion, value: string | null, empty: string) => (
    <Blank question={question} value={value} empty={empty} active={active === question} onPick={onPick} />
  )
  const extra = 'rounded-sm text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between md:gap-6">
      <p className="text-pretty text-sm leading-loose text-muted-foreground md:text-base">
        <span className="mr-2 text-xs font-semibold uppercase tracking-[0.2em] engraved">Your brief</span>
        {`I ${sport === 'running' ? 'run' : 'climb'} for `}
        {blank('goal', draft.goal ? draft.goal.toLowerCase() : null, 'goal')}
        {' on '}
        {blank('surface', draft.surface ? draft.surface.toLowerCase() : null, sport === 'running' ? 'surface' : 'rock')}
        {', size '}
        {blank('size', draft.size.trim() || null, 'size')}
        {', up to '}
        {blank('budget', budget === null ? null : `£${budget}`, 'budget')}
        {', '}
        {blank('height', height === null ? null : `${height} cm (${feetInches(height)})`, 'height')}
        {' tall'}
        {notes.width && (
          <>
            {', '}
            {blank('width', `${notes.width} feet`, 'foot width')}
          </>
        )}
        {notes.niggles.trim() && (
          <>
            {'. Niggles: '}
            {blank('niggles', notes.niggles.trim(), 'niggles')}
          </>
        )}
        .
      </p>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        {!notes.width && (
          <button type="button" onClick={() => onPick('width')} className={extra}>
            + foot width
          </button>
        )}
        {!notes.niggles.trim() && (
          <button type="button" onClick={() => onPick('niggles')} className={extra}>
            + niggles
          </button>
        )}
        <button type="button" onClick={() => onPick('describe')} className={extra}>
          + tell Forma in a sentence
        </button>
        {trailing}
      </div>
      {remembered && (
        <p className="w-full text-xs leading-relaxed text-muted-foreground">
          {'From your last fitting · '}
          <button type="button" onClick={remembered.onForget} className={extra}>
            Forget saved answers
          </button>
        </p>
      )}
    </div>
  )
}
