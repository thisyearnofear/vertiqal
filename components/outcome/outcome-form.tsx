'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { NOT_BOUGHT_REASONS, OUTCOMES, OUTCOME_LABEL, type Outcome } from '@/lib/outcome/schema'

interface Props {
  token: string
  sport: 'running' | 'climbing'
  name: string
  retailer: string
  size: string
}

export function OutcomeForm({ token, sport, name, retailer, size }: Props) {
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  const needsReason = outcome === 'not-bought'
  const ready = outcome !== null && (!needsReason || reason !== null)

  const send = async () => {
    if (!outcome) return
    setState('sending')
    try {
      const res = await fetch('/api/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, outcome, ...(needsReason && reason ? { reason } : {}) }),
      })
      setState(res.ok ? 'done' : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-5 py-10">
      <p className="font-mono text-2xl tracking-wider text-foreground engraved">vertiqal</p>
      {state === 'done' ? (
        <section className="flex flex-col gap-3" aria-live="polite">
          <h1 className="text-balance text-2xl font-semibold text-foreground">Thanks. That helps the next climber or runner.</h1>
          <p className="text-pretty text-base leading-relaxed text-muted-foreground">
            {outcome === 'fits-well'
              ? 'Glad they fit. Your answer makes the next size recommendation for this shoe better.'
              : sport === 'climbing'
                ? 'Your answer is how Forma learns which shoes run small or narrow, which matters when shoes cannot be returned. You can change it by opening this link again.'
                : 'Your answer is how Forma learns which shoes run small, big or narrow. You can change it by opening this link again.'}
          </p>
        </section>
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="text-balance text-2xl font-semibold text-foreground">How did they fit?</h1>
            <p className="text-pretty text-base leading-relaxed text-muted-foreground">
              {`You looked at the ${name} in ${size} at ${retailer}. One tap tells Forma whether it got your size right. No account, no email.`}
            </p>
          </header>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">How did the shoes fit?</legend>
            {OUTCOMES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={outcome === value}
                onClick={() => {
                  setOutcome(value)
                  setReason(null)
                }}
                className="well rounded-md px-4 py-3 text-left text-base font-semibold text-foreground aria-pressed:housing aria-pressed:ring-2 aria-pressed:ring-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {OUTCOME_LABEL[value]}
              </button>
            ))}
          </fieldset>
          {needsReason && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">What stopped you?</legend>
              <div className="flex flex-wrap gap-2">
                {NOT_BOUGHT_REASONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={reason === value}
                    onClick={() => setReason(value)}
                    className="well rounded-md px-3 py-2 text-sm font-semibold text-foreground aria-pressed:housing aria-pressed:ring-2 aria-pressed:ring-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {state === 'error' && (
            <p role="alert" className="text-sm text-primary">
              That didn&apos;t send. Please try again.
            </p>
          )}
          <Button size="lg" className="h-11 w-fit px-5 text-base" disabled={!ready || state === 'sending'} onClick={send}>
            {state === 'sending' ? 'Sending' : 'Send'}
          </Button>
        </>
      )}
    </main>
  )
}
