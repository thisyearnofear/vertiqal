'use client'

import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowUpRight, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Fitting, HandoffResult } from '@/lib/wassist/fitting'

const POLL_MS = 3000

async function requestHandoff([, phone, , fitting]: readonly [string, string, number, Fitting]): Promise<HandoffResult> {
  const res = await fetch('/api/wassist/handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, fitting }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'WhatsApp handoff failed')
  return body
}

const pretty = (phone: string) => `+${phone.replace(/\D/g, '')}`

export function WhatsAppHandoff({ fitting }: { fitting: Fitting }) {
  const [phone, setPhone] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [sent, setSent] = useState<Extract<HandoffResult, { status: 'sent' }> | null>(null)

  const key = target && !sent ? (['wassist-handoff', target, attempt, fitting] as const) : null
  const { data, error } = useSWR(key, requestHandoff, {
    refreshInterval: (latest) => (latest?.status === 'awaiting-link' ? POLL_MS : 0),
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    dedupingInterval: POLL_MS - 500,
    onSuccess: (result) => result.status === 'sent' && setSent(result),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (phone.replace(/\D/g, '').length < 8) return
    setTarget(phone)
    setAttempt((n) => n + 1)
  }

  if (sent && target) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-stage-foreground/40 p-4 md:p-5">
        <p className="text-xl leading-snug phosphor">{`> DELIVERED ${sent.messages} MESSAGES TO ${pretty(target)}`}</p>
        <p className="font-sans text-base leading-relaxed opacity-85">
          Your fitting and picks are on WhatsApp. Reply there and Grok keeps shopping with you, searching live
          stock if you want something different.
        </p>
        <a
          href={sent.chatUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1 text-lg leading-none underline decoration-dotted underline-offset-4 hover:text-primary"
        >
          CONTINUE ON WHATSAPP
          <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </div>
    )
  }

  if (target && data?.status === 'awaiting-link') {
    return (
      <div className="flex flex-col gap-5 rounded-md border-2 border-dashed border-primary p-4 md:flex-row md:items-center md:p-5">
        <a
          href={data.connectUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Open WhatsApp to link Forma"
          className="w-fit shrink-0 rounded-md bg-stage-foreground p-2.5 text-stage shadow-[0_0_28px_-4px_var(--stage-foreground)]"
        >
          <QRCodeSVG value={data.connectUrl} size={132} fgColor="currentColor" bgColor="transparent" marginSize={0} />
        </a>
        <div className="flex flex-col gap-2">
          <p className="text-xl leading-snug text-primary phosphor">{'> SCAN, THEN TAP SEND IN WHATSAPP'}</p>
          <p className="max-w-md font-sans text-base leading-relaxed opacity-85">
            {`Scan with ${pretty(target)}'s phone, or open the link on it. WhatsApp only lets Forma message you after you say hello first.`}
          </p>
          <p className="text-lg leading-none opacity-70">
            {'  LISTENING FOR YOUR HELLO '}
            <span className="animate-blink" aria-hidden>
              {'█'}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setTarget(null)}
            className="w-fit text-lg leading-none underline decoration-dotted underline-offset-4 opacity-70 hover:opacity-100"
          >
            {'[ USE A DIFFERENT NUMBER ]'}
          </button>
        </div>
      </div>
    )
  }

  const pending = Boolean(target) && !error

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border border-stage-foreground/30 p-4 md:p-5">
      <label htmlFor="wa-phone" className="text-xl leading-snug phosphor">
        {'> TAKE THIS TO WHATSAPP'}
      </label>
      <p className="max-w-xl font-sans text-base leading-relaxed opacity-80">
        Get the fitting and picks on your phone, then keep asking Grok questions in the chat.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id="wa-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+44 7700 900123"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={pending}
          className="h-10 w-64 rounded-sm border border-stage-foreground/50 bg-transparent px-3 text-2xl text-stage-foreground outline-none placeholder:text-stage-foreground/35 focus-visible:border-stage-foreground focus-visible:shadow-[0_0_16px_-4px_var(--stage-foreground)] disabled:opacity-60"
        />
        <Button type="submit" size="lg" className="h-10 px-4" disabled={pending || phone.replace(/\D/g, '').length < 8}>
          <MessageCircle aria-hidden />
          {pending ? 'Connecting' : 'Send to WhatsApp'}
        </Button>
      </div>
      {error && (
        <p className="text-lg text-primary phosphor" role="alert">
          {`! ${error.message.toUpperCase()}`}
        </p>
      )}
    </form>
  )
}
