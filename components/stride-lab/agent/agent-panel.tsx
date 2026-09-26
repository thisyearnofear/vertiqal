'use client'

import { useEffect, useEffectEvent, useImperativeHandle, useMemo, useRef, useState, type FormEvent, type Ref } from 'react'
import { RotateCcw } from 'lucide-react'
import { SAMPLE_BRIEFS, briefFromReadout, briefLine, type MovementBrief, type ShopperPrefs } from '@/lib/agent/brief'
import { DEPTHS, addedLayers, nextDepth, type Depth } from '@/lib/agent/depth'
import type { Readout, Sport } from '@/lib/metrics/readout'
import type { MemberView } from '@/lib/member/schema'
import type { Passport } from '@/lib/passport/schema'
import type { Voice } from '@/lib/persona'
import { Button } from '@/components/ui/button'
import type { Fitting } from '@/lib/wassist/fitting'
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
  readout: Readout
  sport: Sport
  heightCm: number
  voice: Voice
  /** Autopilot waits until a live capture has finished. */
  capturing: boolean
  context: string[]
  member: MemberView
  choice: ShoePick | null
  onChoose: (pick: ShoePick | null) => void
  onPinBaseline?: () => void
  baselinePinned: boolean
  ref?: Ref<AgentPanelHandle>
}

export interface AgentPanelHandle {
  runSample: () => void
}

/** Lets "measurements locked" land before Forma starts talking about shopping. */
const LOCK_BEAT_MS = 1600

export function AgentPanel({
  agent,
  readout,
  sport,
  heightCm,
  voice,
  capturing,
  context,
  member,
  choice,
  onChoose,
  onPinBaseline,
  baselinePinned,
  ref,
}: AgentPanelProps) {
  const [size, setSize] = useState(member.last?.size ?? 'UK 9')
  const [budget, setBudget] = useState('£160')
  const [depth, setDepth] = useState<Depth>('considered')
  const { messages, status, error, sentBrief, prefs, send, reset, busy } = agent

  const outputs = useMemo(() => outputsOf(messages), [messages])
  const activity = useMemo(() => activityOf(messages), [messages])
  const passport = useMemo(
    () => (sentBrief && prefs && outputs ? passportFrom(sentBrief, prefs, outputs) : null),
    [sentBrief, prefs, outputs],
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

  const run = (brief: MovementBrief, runDepth: Depth = depth) => {
    onChoose(null)
    send(brief, { size, budget, heightCm, voice, depth: runDepth, notes: context })
  }

  const ranDepth = prefs?.depth ?? depth
  const deeper = nextDepth(ranDepth)
  const goDeeper = () => {
    if (!sentBrief || !deeper) return
    setDepth(deeper)
    run(sentBrief, deeper)
  }
  const reshop = (e: FormEvent) => {
    e.preventDefault()
    if (sentBrief) run(sentBrief, ranDepth)
  }

  useImperativeHandle(ref, () => ({
    runSample: () => {
      if (!busy) run(SAMPLE_BRIEFS[sport])
    },
  }))

  // Once enough movement is measured (and the lock has had a beat), Forma starts shopping on its own.
  const firedFor = useRef<Readout['sport'] | null>(null)
  const fireAutopilot = useEffectEvent(() => {
    if (firedFor.current === readout.sport) return
    firedFor.current = readout.sport
    run(briefFromReadout(readout))
  })
  useEffect(() => {
    if (!readout.ready) {
      // A fresh clip re-arms autopilot, unless results are already on screen (a proof run).
      if (!sentBrief) firedFor.current = null
      return
    }
    if (sentBrief || busy || capturing) return
    const timer = setTimeout(fireAutopilot, LOCK_BEAT_MS)
    return () => clearTimeout(timer)
  }, [readout.ready, sentBrief, busy, capturing])

  if (!sentBrief) return null

  const startOver = () => {
    firedFor.current = readout.ready ? readout.sport : null
    onChoose(null)
    reset()
  }

  const verb = sport === 'running' ? 'run' : 'climb'
  const heading = choice ? 'Make it yours' : outputs ? `Three shoes for how you ${verb}` : `Finding shoes for how you ${verb}`

  return (
    <section aria-labelledby="agent-heading" className="housing flex flex-col gap-5 rounded-2xl p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
            <span className="led" data-state={busy ? 'busy' : 'on'} aria-hidden />
            {choice ? 'Step 3 of 3 · Decide' : outputs ? 'Step 2 of 3 · Choose' : 'Step 1 of 3 · Forma is shopping'}
          </p>
          <h2 id="agent-heading" className="text-balance text-xl font-semibold text-foreground">
            {heading}
          </h2>
        </div>
        <Button variant="outline" size="lg" className="h-10 px-4" onClick={startOver}>
          <RotateCcw aria-hidden />
          Start over
        </Button>
      </div>

      <div className="screen flex flex-col gap-6 p-5 font-mono md:p-8" aria-live="polite">
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
                {deeper && (
                  <button
                    type="button"
                    onClick={goDeeper}
                    className={LINK}
                    title={`Adds ${addedLayers(ranDepth, deeper).join(' and ')} (about ${DEPTHS[deeper].seconds}s)`}
                  >
                    {'[ LOOK HARDER ]'}
                  </button>
                )}
                <form onSubmit={reshop} className="flex items-center gap-2">
                  <label htmlFor="budget" className="opacity-60">
                    {'MAX'}
                  </label>
                  <input
                    id="budget"
                    value={budget}
                    maxLength={12}
                    onChange={(e) => setBudget(e.target.value)}
                    className="h-8 w-20 rounded-sm border border-stage-foreground/50 bg-transparent px-2 text-xl text-stage-foreground outline-none focus-visible:border-stage-foreground"
                  />
                  <button type="submit" className={LINK}>
                    {'[ RE-SHOP ]'}
                  </button>
                </form>
                <a href="#fitting-notes" className={LINK}>
                  {'[ TELL FORMA MORE ↓ ]'}
                </a>
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
            size={size}
            onSizeChange={setSize}
            onChoose={onChoose}
            fitting={fitting}
            passport={passport}
            member={member}
            onPinBaseline={onPinBaseline}
            baselinePinned={baselinePinned}
          />
        )}

        {error && (
          <p className="text-lg text-primary phosphor" role="alert">
            {`! FORMA HALTED: ${error.message}`}
          </p>
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
