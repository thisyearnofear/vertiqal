'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { briefLine, type MovementBrief, type ShopperPrefs } from '@/lib/agent/brief'
import { DEPTHS, addedLayers, type Depth } from '@/lib/agent/depth'
import type { Sport } from '@/lib/metrics/readout'
import type { MemberView } from '@/lib/member/schema'
import type { Passport } from '@/lib/passport/schema'
import { Button } from '@/components/ui/button'
import type { Fitting } from '@/lib/wassist/fitting'
import type { BriefField } from '../fitting-brief'
import { AgentSteps, activityOf, progressOf, readingOf } from './agent-steps'
import { DecisionPanel } from './decision-panel'
import { closingLineOf, outputsOf, type AgentOutputs, type ShoePick } from './outputs'
import { usePassport } from './passport-card'
import { Shortlist } from './shortlist'
import { trackStep } from '@/lib/funnel'
import type { StockPhase } from '@/lib/fitting/narration'
import type { GearAgent } from './use-gear-agent'

function passportFrom(brief: MovementBrief, prefs: ShopperPrefs, outputs: AgentOutputs): Passport {
  return {
    v: 1,
    sport: brief.sport,
    heightCm: Math.round(prefs.heightCm),
    size: prefs.size.slice(0, 20),
    voice: prefs.voice,
    metrics: brief.metrics,
    signals: brief.signals,
    profile: {
      summary: outputs.profile.summary,
      category: outputs.profile.category,
      requirements: outputs.profile.requirements.map(({ attribute, target }) => ({ attribute, target })),
    },
    picks: outputs.picks.map(({ name, retailer, url, price }) => ({ name, retailer, url, price })),
  }
}

const LINK =
  'rounded-sm px-1 underline decoration-dotted underline-offset-4 phosphor hover:bg-stage-foreground hover:text-stage focus-visible:bg-stage-foreground focus-visible:text-stage focus-visible:outline-none'

const FEEDBACK_REASONS = ['Wrong type of shoe', 'Over budget', "Don't trust the sizing", 'Already tried these', 'Something else']

/** One-tap quality signal on the shortlist; sent once, then replaced with a thanks line. */
function ShortlistFeedback({ sport, depth }: { sport: Sport; depth: Depth }) {
  const [declined, setDeclined] = useState(false)
  const [done, setDone] = useState(false)

  const send = (verdict: 'yes' | 'no', reason?: string) => {
    if (done) return
    setDone(true)
    trackStep('shortlist_feedback', reason ? { sport, depth, verdict, reason } : { sport, depth, verdict })
  }

  if (done) return <p className="text-base uppercase leading-snug opacity-60">{'// Thanks — that helps Forma get better.'}</p>

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-lg leading-none">
      <span className="opacity-60">{'DOES THIS SHORTLIST LOOK RIGHT?'}</span>
      <button type="button" onClick={() => send('yes')} className={LINK}>
        {'[ LOOKS RIGHT ]'}
      </button>
      <button type="button" onClick={() => setDeclined(true)} className={LINK}>
        {'[ NOT REALLY ]'}
      </button>
      {declined &&
        FEEDBACK_REASONS.map((reason) => (
          <button key={reason} type="button" onClick={() => send('no', reason)} className={LINK}>
            {`[ ${reason.toUpperCase()} ]`}
          </button>
        ))}
    </div>
  )
}

interface AgentPanelProps {
  agent: GearAgent
  sport: Sport
  member: MemberView
  choice: ShoePick | null
  onChoose: (pick: ShoePick | null) => void
  onPinBaseline?: () => void
  baselinePinned: boolean
  deeper: Depth | null
  onLookHarder: () => void
  onRetry: () => void
  onStartFresh: () => void
  confirmedSize: string
  onSizeCommit: (size: string) => void
  onBriefField: (field: BriefField) => void
  /** After the size check: WhatsApp, baseline and passport are offered. */
  takeAway: boolean
  onStock: (stock: { phase: StockPhase; price: string | null }) => void
  canFallBack: boolean
  onAutoAdvance: (next: ShoePick) => void
  onBought: () => void
}

export function AgentPanel({
  agent,
  sport,
  member,
  choice,
  onChoose,
  onPinBaseline,
  baselinePinned,
  deeper,
  onLookHarder,
  onRetry,
  onStartFresh,
  confirmedSize,
  onSizeCommit,
  onBriefField,
  takeAway,
  onStock,
  canFallBack,
  onAutoAdvance,
  onBought,
}: AgentPanelProps) {
  const { messages, status, error, sentBrief, prefs, busy } = agent

  const outputs = useMemo(() => outputsOf(messages), [messages])
  const activity = useMemo(() => activityOf(messages), [messages])
  const progress = useMemo(() => progressOf(messages), [messages])
  const reading = useMemo(() => readingOf(messages), [messages])
  const headingRef = useRef<HTMLHeadingElement>(null)
  const hasOutputs = Boolean(outputs)

  // When the shortlist lands, bring it into view and move focus to it, instead of leaving the
  // shopper at the bottom of a growing transcript.
  useEffect(() => {
    if (!hasOutputs) return
    const heading = headingRef.current
    if (!heading) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    heading.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' })
    heading.focus({ preventScroll: true })
  }, [hasOutputs])
  const passport = useMemo(
    () => (sentBrief && prefs && outputs ? passportFrom(sentBrief, { ...prefs, size: confirmedSize.trim() || prefs.size }, outputs) : null),
    [sentBrief, prefs, outputs, confirmedSize],
  )
  const { data: issued } = usePassport(passport)
  const fitting = useMemo<Fitting | null>(
    () =>
      sentBrief && outputs && prefs
        ? {
            sport: sentBrief.sport,
            voice: prefs.voice,
            passportUrl: issued?.url,
            measurements: briefLine(sentBrief).toLowerCase(),
            summary: outputs.profile.summary,
            category: outputs.profile.category,
            requirements: outputs.profile.requirements.map(({ attribute, target }) => ({ attribute, target })),
            picks: outputs.picks,
          }
        : null,
    [sentBrief, outputs, prefs, issued?.url],
  )

  if (!sentBrief) return null

  const ranDepth = prefs?.depth ?? 'considered'
  const verb = sport === 'running' ? 'run' : 'climb'
  const heading = choice ? 'Make it yours' : outputs ? `Three shoes for how you ${verb}` : `Finding shoes for how you ${verb}`

  return (
    <section aria-labelledby="agent-heading" className="housing flex flex-col gap-5 rounded-2xl p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
            <span className="led" data-state={busy ? 'busy' : 'on'} aria-hidden />
            {choice ? 'Your pick' : outputs ? 'Shortlist' : 'Searching'}
          </p>
          <h2 id="agent-heading" ref={headingRef} tabIndex={-1} className="scroll-mt-6 text-balance text-xl font-semibold text-foreground focus-visible:outline-none">
            {heading}
          </h2>
        </div>
        <Button variant="outline" size="lg" className="h-10 px-4" onClick={onStartFresh}>
          <RotateCcw aria-hidden />
          Start over
        </Button>
      </div>

      <div className="screen screen-readable flex flex-col gap-6 p-5 font-mono md:p-8" aria-live="polite">
        <p className="text-lg leading-snug opacity-70">{`> YOUR NUMBERS · ${briefLine(sentBrief)}`}</p>

        {!outputs && !error && !busy && status === 'ready' && messages.some((m) => m.role === 'assistant') && (
          <div className="flex flex-col gap-3">
            <p className="text-xl uppercase leading-snug text-primary phosphor" role="status">
              {"! FORMA COULDN'T SETTLE ON THREE DIFFERENT SHOES WITH REAL PRODUCT PAGES"}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-3 text-lg leading-none">
              <button type="button" onClick={onRetry} className={LINK}>
                {'[ TRY AGAIN ]'}
              </button>
              {deeper && (
                <button type="button" onClick={onLookHarder} className={LINK}>
                  {'[ LOOK HARDER ]'}
                </button>
              )}
            </div>
          </div>
        )}

        {!outputs && !error && (busy || status !== 'ready' || !messages.some((m) => m.role === 'assistant')) && (
          <div className="flex flex-col gap-1">
            <p className="text-2xl uppercase leading-snug phosphor">
              {`> ${activity.label}`}
              <span className="ml-2 animate-blink" aria-hidden>
                {'█'}
              </span>
            </p>
            <p className="text-lg leading-snug opacity-60">
              {`  ${DEPTHS[ranDepth].label.toUpperCase()} SEARCH · ABOUT ${DEPTHS[ranDepth].seconds}S${status === 'submitted' ? ' · GROK IS THINKING' : ''}`}
            </p>
            {progress.length > 0 && (
              <ol className="mt-3 flex flex-col gap-1 text-lg leading-snug" aria-label="Search progress">
                {progress.map((step) => (
                  <li key={step.label} className={step.done ? 'opacity-70' : 'phosphor'}>
                    {`${step.done ? '[ OK ]' : '[ .. ]'} ${step.label.toUpperCase()}${step.count > 1 ? ` ×${step.count}` : ''}`}
                  </li>
                ))}
              </ol>
            )}
            {reading.length > 0 && (
              <div className="mt-4 flex flex-col gap-2" aria-label="Pages Forma is reading">
                <p className="text-base uppercase leading-none opacity-60">{'> Forma is reading'}</p>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {reading.map((page) => (
                    <li
                      key={page.url}
                      className="flex min-w-0 animate-in flex-col gap-0.5 rounded-md border border-stage-foreground/25 bg-stage-foreground/5 px-3 py-2 fade-in slide-in-from-bottom-1 duration-500"
                    >
                      <span className="truncate text-sm uppercase opacity-60">{page.host}</span>
                      <span className="line-clamp-2 font-sans text-sm leading-snug opacity-90">{page.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {outputs && !choice && (
          <>
            <Shortlist
              outputs={outputs}
              closingLine={busy ? '' : closingLineOf(messages)}
              onChoose={(pick) => {
                onChoose(pick)
                requestAnimationFrame(() => document.getElementById('forma-procurement')?.scrollIntoView({ block: 'start' }))
              }}
            />
            {!busy && (
              <div className="flex flex-col gap-4 border-t border-dashed border-stage-foreground/30 pt-4">
                <ShortlistFeedback key={messages[0]?.id} sport={sport} depth={ranDepth} />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-lg leading-none">
                <span className="opacity-60">{'NOT QUITE?'}</span>
                <button type="button" onClick={() => onBriefField('budget')} className={LINK}>
                  {'[ ADJUST BUDGET ]'}
                </button>
                <button type="button" onClick={() => onBriefField('goal')} className={LINK}>
                  {'[ CHANGE GOAL ]'}
                </button>
                <button type="button" onClick={() => onBriefField('niggles')} className={LINK}>
                  {'[ ADD COMFORT NOTES ]'}
                </button>
                {deeper && (
                  <button
                    type="button"
                    onClick={onLookHarder}
                    className={LINK}
                    title={`Adds ${addedLayers(ranDepth, deeper).join(' and ')} (about ${DEPTHS[deeper].seconds}s)`}
                  >
                    {'[ LOOK HARDER ]'}
                  </button>
                )}
              </div>
              </div>
            )}
          </>
        )}

        {outputs && choice && (
          <DecisionPanel
            key={choice.url}
            pick={choice}
            picks={outputs.picks}
            brief={sentBrief}
            sport={sport}
            size={confirmedSize}
            onSizeCommit={onSizeCommit}
            onChoose={onChoose}
            fitting={fitting}
            passport={passport}
            member={member}
            onPinBaseline={onPinBaseline}
            baselinePinned={baselinePinned}
            takeAway={takeAway}
            onStock={onStock}
            canFallBack={canFallBack}
            onAutoAdvance={onAutoAdvance}
            onBought={onBought}
          />
        )}

        {error && (
          <div className="flex flex-col gap-3">
            <p className="text-lg text-primary phosphor" role="alert">
              {`! FORMA HALTED: ${error.message}`}
            </p>
            <button type="button" onClick={onRetry} disabled={busy} className={LINK}>
              {'[ TRY AGAIN ]'}
            </button>
          </div>
        )}

        {messages.length > 1 && (
          <details name="forma-panels" className="border-t border-dashed border-stage-foreground/30 pt-4 text-lg leading-snug">
            <summary className="w-fit cursor-pointer opacity-70 hover:text-primary">
              {`+ How Forma decided · ${activity.steps} steps`}
            </summary>
            <div className="mt-5">
              <AgentSteps messages={messages} />
            </div>
          </details>
        )}
      </div>
    </section>
  )
}
