'use client'

import { useEffect, useState, type RefObject } from 'react'
import type { FittingNotesState } from '@/lib/agent/fitting-notes'
import { applyParsedBrief } from '@/lib/fitting/brief-parse'
import { nextQuestion, type BriefQuestion } from '@/lib/fitting/brief-flow'
import type { PrefDraft } from '@/lib/fitting/prefs'
import type { Sport } from '@/lib/metrics/readout'
import type { BriefField } from './fitting-brief'

const prefersStill = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface BriefFlowOptions {
  sport: Sport
  draft: PrefDraft
  notes: FittingNotesState
  onDraft: (next: PrefDraft) => void
  onNotes: (next: FittingNotesState) => void
  /** The guided brief only opens during capture/confirm stages. */
  askingBrief: boolean
  /** Height is committed on the stage screen while idle — no need to ask it. */
  heightOnScreen: boolean
  /** First captured keyframe backs the vision surface guess. */
  surfaceFrame: { dataUrl: string } | null
  /** The example suppresses the whole flow. */
  example: boolean
  /** Focus target of the rendered question panel. */
  panelRef: RefObject<HTMLDivElement | null>
}

/**
 * Owns the guided brief: which question is open, skipped optional fields, the
 * free-text describe parse, the vision surface guess and the "filled from your
 * sentence" note. The panel itself renders wherever the stage puts it — this is
 * the state machine behind it.
 */
export function useBriefFlow({ sport, draft, notes, onDraft, onNotes, askingBrief, heightOnScreen, surfaceFrame, example, panelRef }: BriefFlowOptions) {
  const [active, setActive] = useState<BriefQuestion | null>(null)
  const [skipped, setSkipped] = useState<ReadonlySet<BriefQuestion>>(new Set())
  const [describeState, setDescribeState] = useState<{ pending: boolean; error: string | null }>({ pending: false, error: null })
  const [filledNote, setFilledNote] = useState<string | null>(null)
  const [surfaceGuess, setSurfaceGuess] = useState<{ pending: boolean; suggestion: string | null; message: string | null }>({
    pending: false,
    suggestion: null,
    message: null,
  })

  const question = active ?? (askingBrief && !example ? nextQuestion({ draft, notes, skipped, heightOnScreen }) : null)

  // Esc dismisses the focused question — the docked overlay traps attention, so it must be escapable.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  const ask = (next: BriefQuestion) => {
    setActive(next)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = panelRef.current
        target?.scrollIntoView({ block: 'nearest', behavior: prefersStill() ? 'auto' : 'smooth' })
        target?.focus({ preventScroll: true })
      }),
    )
  }

  const close = () => setActive(null)

  const answerDraft = (patch: Partial<PrefDraft>) => {
    onDraft({ ...draft, ...patch })
    setActive(null)
  }

  const answerNotes = (patch: Partial<FittingNotesState>) => {
    onNotes({ ...notes, ...patch })
    setActive(null)
  }

  const skip = (current: BriefQuestion) => {
    setSkipped((s) => new Set(s).add(current))
    setActive(null)
  }

  const submitDescribe = async (text: string) => {
    setDescribeState({ pending: true, error: null })
    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'text', sport, text }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) throw new Error(data?.error ?? 'Forma could not read that')
      const applied = applyParsedBrief(draft, notes, data)
      if (applied.filled.length > 0 || applied.notes.current !== notes.current) {
        onDraft(applied.draft)
        onNotes(applied.notes)
        setActive(null)
        const note =
          applied.filled.length > 0
            ? `Filled ${applied.filled.join(', ')} from what you wrote — tap any to change.`
            : 'Noted your current shoe — tap any field to change.'
        setFilledNote(note)
        window.setTimeout(() => setFilledNote((n) => (n === note ? null : n)), 9000)
      } else {
        setActive(null)
        setFilledNote("Couldn't find anything to fill — try naming your size or budget.")
        window.setTimeout(() => setFilledNote(null), 9000)
      }
      setDescribeState({ pending: false, error: null })
    } catch (error) {
      setDescribeState({ pending: false, error: error instanceof Error ? error.message : 'Forma could not read that' })
    }
  }

  const guessSurface = async () => {
    if (!surfaceFrame || surfaceGuess.pending || example) return
    setSurfaceGuess({ pending: true, suggestion: null, message: null })
    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'surface', sport, image: surfaceFrame.dataUrl }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) throw new Error(data?.error ?? 'Could not read the still')
      setSurfaceGuess({
        pending: false,
        suggestion: data.surface ?? null,
        message: data.surface ? null : "Couldn't tell from the clip.",
      })
    } catch (error) {
      setSurfaceGuess({ pending: false, suggestion: null, message: error instanceof Error ? error.message : 'Could not read the still' })
    }
  }

  /** Session resets clear transient prompt state; skipped survives sport-neutral resets. */
  const reset = (clearSkipped: boolean) => {
    if (clearSkipped) setSkipped(new Set())
    setActive(null)
    setDescribeState({ pending: false, error: null })
    setFilledNote(null)
    setSurfaceGuess({ pending: false, suggestion: null, message: null })
  }

  return {
    question,
    ask,
    focusField: (field: BriefField) => ask(field),
    close,
    answerDraft,
    answerNotes,
    skip,
    describe: { pending: describeState.pending, error: describeState.error, onSubmit: submitDescribe },
    surfaceGuess: surfaceFrame
      ? { pending: surfaceGuess.pending, suggestion: surfaceGuess.suggestion, message: surfaceGuess.message, onGuess: guessSurface }
      : undefined,
    filledNote,
    reset,
  }
}
