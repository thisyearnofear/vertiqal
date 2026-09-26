'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, ScanLine } from 'lucide-react'
import { SAMPLE_BRIEFS, briefFromReadout, briefLine, type MovementBrief, type ShopperPrefs } from '@/lib/agent/brief'
import { MIN_EVENTS, SPORTS, type Readout, type Sport } from '@/lib/metrics/readout'
import type { Passport } from '@/lib/passport/schema'
import type { Voice } from '@/lib/persona'
import { Button } from '@/components/ui/button'
import type { Fitting } from '@/lib/wassist/fitting'
import { DEPTHS, addedLayers, nextDepth, type Depth } from '@/lib/agent/depth'
import { AgentSteps } from './agent-steps'
import { outputsOf, type AgentOutputs } from './outputs'
import { DepthDial } from './depth-dial'
import { PassportCard, usePassport } from './passport-card'
import type { GearAgent } from './use-gear-agent'
import { WhatsAppHandoff } from './whatsapp-handoff'

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

function Field({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="well h-10 w-28 rounded-md px-3 font-mono text-2xl text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  )
}

interface AgentPanelProps {
  agent: GearAgent
  readout: Readout
  sport: Sport
  heightCm: number
  voice: Voice
  /** Autopilot waits until a live capture has finished. */
  capturing: boolean
  context: string[]
}

export function AgentPanel({ agent, readout, sport, heightCm, voice, capturing, context }: AgentPanelProps) {
  const [size, setSize] = useState('UK 9')
  const [budget, setBudget] = useState('£160')
  const [autopilot, setAutopilot] = useState(true)
  const [depth, setDepth] = useState<Depth>('considered')
  const { messages, addToolApprovalResponse, status, error, sentBrief, prefs, send, reset, busy } = agent

  const outputs = useMemo(() => outputsOf(messages), [messages])
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

  const run = (brief: MovementBrief, runDepth: Depth = depth) =>
    send(brief, { size, budget, heightCm, voice, depth: runDepth, notes: context })

  const ranDepth = prefs?.depth ?? depth
  const deeper = nextDepth(ranDepth)
  const goDeeper = () => {
    if (!sentBrief || !deeper) return
    setDepth(deeper)
    run(sentBrief, deeper)
  }

  // Autopilot: the moment enough movement is measured, Forma hands the brief to Grok on its own.
  const firedFor = useRef<Readout['sport'] | null>(null)
  useEffect(() => {
    if (!readout.ready) {
      // A fresh clip re-arms autopilot, unless results are already on screen (a proof run).
      if (!sentBrief) firedFor.current = null
      return
    }
    if (!autopilot || sentBrief || busy || capturing) return
    if (firedFor.current === readout.sport) return
    firedFor.current = readout.sport
    send(briefFromReadout(readout), { size, budget, heightCm, voice, depth, notes: context })
  }, [autopilot, readout, sentBrief, busy, capturing, send, size, budget, heightCm, voice, depth, context])

  const startOver = () => {
    firedFor.current = readout.ready ? readout.sport : null
    reset()
  }

  const eventWord = SPORTS[sport].events.toUpperCase()

  return (
    <section aria-labelledby="agent-heading" className="housing flex flex-col gap-5 rounded-2xl p-4 md:p-6">
      <div className="flex flex-col gap-5 px-1 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
            <span className="led" data-state={busy ? 'busy' : sentBrief ? 'on' : 'off'} aria-hidden />
            CH-2 · Forma procurement
          </p>
          <h2 id="agent-heading" className="text-balance text-xl font-semibold text-foreground">
            {sport === 'running' ? 'From stride to shopping basket' : 'From wall to shopping basket'}
          </h2>
          <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
            Grok turns your measurements into a shoe profile, Tavily searches live stock, and a browser agent
            fills the basket once you approve.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <Field id="shoe-size" label="Street size" value={size} onChange={setSize} />
          <Field id="budget" label="Budget" value={budget} onChange={setBudget} />
          <div className="flex flex-col gap-1.5">
            <span id="autopilot-label" className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
              Autopilot
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={autopilot}
              aria-labelledby="autopilot-label"
              onClick={() => setAutopilot((v) => !v)}
              className="well flex h-10 items-center gap-2 rounded-md px-3 font-mono text-2xl leading-none text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="led" data-state={autopilot ? 'on' : 'off'} aria-hidden />
              {autopilot ? 'ON' : 'OFF'}
            </button>
          </div>
          {sentBrief ? (
            <Button variant="outline" size="lg" className="h-10 px-4" onClick={startOver}>
              <RotateCcw aria-hidden />
              Start over
            </Button>
          ) : (
            <Button size="lg" className="h-10 px-4" disabled={!readout.ready || busy} onClick={() => run(briefFromReadout(readout))}>
              <ScanLine aria-hidden />
              Find my shoe
            </Button>
          )}
        </div>
      </div>

      <DepthDial value={depth} onChange={setDepth} disabled={busy} />

      <div className="screen min-h-56 p-5 font-mono md:p-8" aria-live="polite">
        {!sentBrief ? (
          <div className="flex flex-col gap-3 text-xl leading-snug">
            <p className="phosphor">{'> AWAITING MOVEMENT BRIEF'}</p>
            <p className="opacity-70">
              {readout.ready
                ? '  MEASUREMENTS LOCKED. PRESS FIND MY SHOE.'
                : `  PLAY A CLIP UNTIL ${MIN_EVENTS} ${eventWord} ARE MEASURED.${autopilot ? ' FORMA STARTS AUTOMATICALLY.' : ''}`}
            </p>
            <p className="flex flex-wrap items-center gap-x-2">
              <span className="opacity-70">{'  OR'}</span>
              <button
                type="button"
                onClick={() => run(SAMPLE_BRIEFS[sport])}
                className="rounded-sm px-1 underline decoration-dotted underline-offset-4 phosphor hover:bg-stage-foreground hover:text-stage focus-visible:bg-stage-foreground focus-visible:text-stage focus-visible:outline-none"
              >
                {`[ RUN SAMPLE ${sport.toUpperCase()} MEASUREMENTS ]`}
              </button>
              <span className="animate-blink" aria-hidden>
                {'█'}
              </span>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1 border-b border-dashed border-stage-foreground/30 pb-4 text-lg leading-snug">
              <p className="phosphor">{`> ${sentBrief.sport.toUpperCase()} BRIEF TRANSMITTED · DEPTH ${DEPTHS[ranDepth].label.toUpperCase()}`}</p>
              <p className="opacity-70">{`  ${briefLine(sentBrief)}`}</p>
            </div>
            <AgentSteps messages={messages} onApproval={addToolApprovalResponse} />
            {outputs && deeper && !busy && (
              <div className="flex flex-col gap-2 border-y border-dashed border-stage-foreground/30 py-4 text-lg leading-snug">
                <p className="opacity-70">{`  WANT MORE CONTEXT? ${DEPTHS[deeper].label.toUpperCase()} ADDS ${addedLayers(ranDepth, deeper).join(' + ').toUpperCase()} (~${DEPTHS[deeper].seconds}S).`}</p>
                <button
                  type="button"
                  onClick={goDeeper}
                  className="w-fit rounded-sm px-1 underline decoration-dotted underline-offset-4 phosphor hover:bg-stage-foreground hover:text-stage focus-visible:bg-stage-foreground focus-visible:text-stage focus-visible:outline-none"
                >
                  {`[ GO DEEPER: RE-RUN AS ${DEPTHS[deeper].label.toUpperCase()} ]`}
                </button>
              </div>
            )}
            {passport && fitting && (
              <div className="grid gap-4 xl:grid-cols-2">
                <PassportCard passport={passport} />
                <WhatsAppHandoff fitting={fitting} />
              </div>
            )}
            {status === 'submitted' && (
              <p className="text-lg opacity-80">
                {'> GROK IS THINKING '}
                <span className="animate-blink" aria-hidden>
                  {'█'}
                </span>
              </p>
            )}
            {error && (
              <p className="text-lg text-primary phosphor" role="alert">
                {`! AGENT HALTED: ${error.message}`}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
