'use client'

import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import { briefLine, type MovementBrief, type ShopperPrefs } from '@/lib/agent/brief'
import { DEPTHS, addedLayers, type Depth } from '@/lib/agent/depth'
import type { Sport } from '@/lib/metrics/readout'
import type { MemberView } from '@/lib/member/schema'
import type { Passport } from '@/lib/passport/schema'
import { Button } from '@/components/ui/button'
import type { Fitting } from '@/lib/wassist/fitting'
import type { BriefField } from '../fitting-brief'
import { AgentSteps, activityOf } from './agent-steps'
import { DecisionPanel } from './decision-panel'
import { closingLineOf, outputsOf, type AgentOutputs, type ShoePick } from './outputs'
import { usePassport } from './passport-card'
import { Shortlist } from './shortlist'
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
}: AgentPanelProps) {
  const { messages, status, error, sentBrief, prefs, busy } = agent

  const outputs = useMemo(() => outputsOf(messages), [messages])
  const activity = useMemo(() => activityOf(messages), [messages])
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
            {choice ? 'Step 3 of 3 · Decide' : outputs ? 'Step 3 of 3 · Choose' : 'Step 3 of 3 · Forma is searching'}
          </p>
          <h2 id="agent-heading" className="text-balance text-xl font-semibold text-foreground">
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

        {!outputs && !error && (
          <div className="flex flex-col gap-1">
            <p className="text-2xl uppercase leading-snug phosphor">
              {`> ${activity.label}`}
              <span className="ml-2 animate-blink" aria-hidden>
                {'█'}
              </span>
            </p>
            <p className="text-lg leading-snug opacity-60">
              {`  ${DEPTHS[ranDepth].label.toUpperCase()} SEARCH · STEP ${Math.max(activity.steps, 1)}${status === 'submitted' ? ' · GROK IS THINKING' : ''}`}
            </p>
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
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-dashed border-stage-foreground/30 pt-4 text-lg leading-none">
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
            )}
          </>
        )}

        {outputs && choice && (
          <DecisionPanel
            key={choice.url}
            pick={choice}
            picks={outputs.picks}
            sport={sport}
            size={confirmedSize}
            onSizeCommit={onSizeCommit}
            onChoose={onChoose}
            fitting={fitting}
            passport={passport}
            member={member}
            onPinBaseline={onPinBaseline}
            baselinePinned={baselinePinned}
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
          <details className="border-t border-dashed border-stage-foreground/30 pt-4 text-lg leading-snug">
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
