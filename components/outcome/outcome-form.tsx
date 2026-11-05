'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Film, ChevronRight } from 'lucide-react'
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
  const router = useRouter()
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

  const downloadCalendar = () => {
    // 30 days from now — enough time to wear the shoes, not so far they forget
    const future = new Date()
    future.setDate(future.getDate() + 30)
    const formatted = (d: Date) =>
      d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Forma//EN',
      'BEGIN:VEVENT',
      `DTSTART:${formatted(future)}`,
      `DTEND:${formatted(new Date(future.getTime() + 3600000))}`,
      `SUMMARY:Film yourself again — Forma`,
      `DESCRIPTION:Film a clip of your ${sport === 'running' ? 'running' : 'climbing'} and upload it to Forma to see how your movement has changed since your original fitting.`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `forma-film-reminder-${future.toISOString().split('T')[0]}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  const shareOutcome = async () => {
    if (!outcome) return
    // Generate a shareable text card
    const text =
      `I told Forma about my ${name} (${size} at ${retailer}).\n` +
      `Result: ${OUTCOME_LABEL[outcome]}.\n` +
      `Check your body is the search query →`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // fallback — no-op
    }
  }

  const successMessage =
    outcome === 'fits-well'
      ? 'Glad they fit. Your answer makes the next size recommendation for this shoe better.'
      : sport === 'climbing'
        ? 'Your answer is how Forma learns which shoes run small or narrow, which matters when shoes cannot be returned. You can change it by opening this link again.'
        : 'Your answer is how Forma learns which shoes run small, big or narrow. You can change it by opening this link again.'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-5 py-10">
      <p className="font-mono text-2xl tracking-wider text-foreground engraved">forma</p>
      {state === 'done' ? (
        <section className="flex flex-col gap-5" aria-live="polite">
          {/* Success message */}
          <div className="flex flex-col gap-2">
            <h1 className="text-balance text-2xl font-semibold text-foreground">Thanks. That helps.</h1>
            <p className="text-pretty text-base leading-relaxed text-muted-foreground">
              {successMessage}
            </p>
          </div>

          {/* Shareable outcome card */}
          <div className="well rounded-lg p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Share your result</p>
            <p className="text-pretty text-sm leading-relaxed text-foreground">
              {`I looked at the ${name} in ${size} at ${retailer}. Forma said they'd fit. I ${outcome === 'fits-well' ? 'kept them' : outcome === 'not-bought' ? 'didn\'t buy them' : OUTCOME_LABEL[outcome as Outcome].toLowerCase()}.`}
            </p>
            <Button variant="ghost" size="sm" className="mt-3 h-8 w-fit gap-1.5 px-3 text-xs" onClick={shareOutcome}>
              Copy result
              <ChevronRight aria-hidden className="size-3" />
            </Button>
          </div>

          {/* Film again CTA — the retention loop */}
          <div className="border-t border-border pt-5">
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-foreground">See what changed</h2>
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                {`Come back in 30 days and film yourself again. Forma will compare your movement to your original reading and show you what shifted.`}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" className="gap-2" onClick={downloadCalendar}>
                  <Calendar aria-hidden className="size-4" />
                  30-day reminder
                </Button>
                <Button variant="outline" size="lg" className="gap-2" onClick={() => router.push('/')}>
                  <Film aria-hidden className="size-4" />
                  Go back to Forma
                </Button>
              </div>
            </div>
          </div>
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
