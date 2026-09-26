'use client'

import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import { RotateCcw, ScanLine } from 'lucide-react'
import type { GearAgentUIMessage } from '@/lib/agent/gear-agent'
import { SAMPLE_BRIEF, briefFromSnapshot, briefToPrompt, type GaitBrief } from '@/lib/agent/brief'
import { MIN_STRIKES_FOR_SIGNALS, type GaitSnapshot } from '@/lib/metrics/gait'
import { Button } from '@/components/ui/button'
import { AgentSteps } from './agent-steps'

const transport = new DefaultChatTransport<GearAgentUIMessage>({ api: '/api/agent' })

function briefLine(brief: GaitBrief) {
  return [
    `CADENCE ${brief.cadenceSpm ?? '--'}SPM`,
    `OVERSTRIDE ${brief.overstrideCm ?? '--'}CM`,
    `KNEE ${brief.kneeAtContactDeg ?? '--'}°`,
  ].join('  ·  ')
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved"
      >
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

export function AgentPanel({ snapshot, heightCm }: { snapshot: GaitSnapshot | null; heightCm: number }) {
  const [size, setSize] = useState('UK 9')
  const [budget, setBudget] = useState('£160')
  const [sentBrief, setSentBrief] = useState<GaitBrief | null>(null)

  const { messages, sendMessage, addToolApprovalResponse, status, error, setMessages, stop } =
    useChat<GearAgentUIMessage>({
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    })

  const ready = (snapshot?.totalStrikes ?? 0) >= MIN_STRIKES_FOR_SIGNALS
  const busy = status === 'submitted' || status === 'streaming'

  const send = (brief: GaitBrief) => {
    setSentBrief(brief)
    setMessages([])
    void sendMessage({ text: briefToPrompt(brief, { size, budget, heightCm }) })
  }

  const reset = () => {
    void stop()
    setMessages([])
    setSentBrief(null)
  }

  return (
    <section aria-labelledby="agent-heading" className="housing flex flex-col gap-5 rounded-2xl p-4 md:p-6">
      <div className="flex flex-col gap-5 px-1 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
            <span className="led" data-state={busy ? 'busy' : sentBrief ? 'on' : 'off'} aria-hidden />
            CH-2 · Procurement agent
          </p>
          <h2 id="agent-heading" className="text-balance text-xl font-semibold text-foreground">
            From stride to shopping basket
          </h2>
          <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
            Grok turns your measurements into a shoe profile, Tavily searches live stock, and a browser agent
            fills the basket once you approve.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <Field id="shoe-size" label="Size" value={size} onChange={setSize} />
          <Field id="budget" label="Budget" value={budget} onChange={setBudget} />
          {sentBrief ? (
            <Button variant="outline" size="lg" className="h-10 px-4" onClick={reset}>
              <RotateCcw aria-hidden />
              Start over
            </Button>
          ) : (
            <Button
              size="lg"
              className="h-10 px-4"
              disabled={!ready || busy}
              onClick={() => snapshot && send(briefFromSnapshot(snapshot))}
            >
              <ScanLine aria-hidden />
              Find my shoe
            </Button>
          )}
        </div>
      </div>

      <div className="screen min-h-56 p-5 font-mono md:p-8" aria-live="polite">
        {!sentBrief ? (
          <div className="flex flex-col gap-3 text-xl leading-snug">
            <p className="phosphor">{'> AWAITING GAIT BRIEF'}</p>
            <p className="opacity-70">
              {ready
                ? '  MEASUREMENTS LOCKED. PRESS FIND MY SHOE.'
                : `  PLAY A CLIP UNTIL ${MIN_STRIKES_FOR_SIGNALS} FOOTFALLS ARE MEASURED.`}
            </p>
            <p className="flex flex-wrap items-center gap-x-2">
              <span className="opacity-70">{'  OR'}</span>
              <button
                type="button"
                onClick={() => send(SAMPLE_BRIEF)}
                className="rounded-sm px-1 underline decoration-dotted underline-offset-4 phosphor hover:bg-stage-foreground hover:text-stage focus-visible:bg-stage-foreground focus-visible:text-stage focus-visible:outline-none"
              >
                {'[ RUN SAMPLE MEASUREMENTS ]'}
              </button>
              <span className="animate-blink" aria-hidden>
                {'█'}
              </span>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1 border-b border-dashed border-stage-foreground/30 pb-4 text-lg leading-snug">
              <p className="phosphor">{'> BRIEF TRANSMITTED'}</p>
              <p className="opacity-70">{`  ${briefLine(sentBrief)}`}</p>
            </div>
            <AgentSteps messages={messages} onApproval={addToolApprovalResponse} />
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
