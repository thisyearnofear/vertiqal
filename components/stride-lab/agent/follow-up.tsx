'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Check, Copy, CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trackStep } from '@/lib/funnel'
import { FOLLOW_UP_DAYS, reminderIcs } from '@/lib/outcome/reminder'
import type { Sport } from '@/lib/metrics/readout'

export interface OutcomeLinkInput {
  sport: Sport
  name: string
  retailer: string
  size: string
}

interface IssuedLink {
  ref: string
  url: string
}

async function issue([, sport, name, retailer, size]: readonly [string, Sport, string, string, string]): Promise<IssuedLink> {
  const res = await fetch('/api/outcome/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sport, name, retailer, size }),
  })
  if (!res.ok) throw new Error('unavailable')
  return res.json()
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return debounced
}

/**
 * A click reference and a follow-up link for the shoe and size on screen. Fetched ahead of the Buy
 * click (a link can't wait on a request), so it is debounced while the shopper types a size. When it
 * is unavailable the Buy link simply goes out without a reference.
 */
export function useOutcomeLink(input: OutcomeLinkInput) {
  const size = useDebounced(input.size.trim(), 700)
  const key = size ? ([ 'outcome-link', input.sport, input.name, input.retailer, size ] as const) : null
  const { data } = useSWR(key, issue, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
  })
  return data
}

export function FollowUp({ link, name, sport }: { link: IssuedLink | undefined; name: string; sport: Sport }) {
  const [copied, setCopied] = useState(false)
  if (!link) return null

  const copy = async () => {
    await navigator.clipboard.writeText(link.url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const addReminder = () => {
    const on = new Date(Date.now() + FOLLOW_UP_DAYS * 24 * 60 * 60_000)
    const ics = reminderIcs({
      uid: link.ref,
      summary: 'How did your new shoes fit? (vertiqal)',
      description: `One tap tells Forma whether it got ${name} right for you.`,
      url: link.url,
      on,
    })
    const href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = 'vertiqal-follow-up.ics'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
    trackStep('reminder_added', { sport })
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-stage-foreground/30 p-4 md:p-5">
      <p className="text-xl leading-snug phosphor">{'> COME BACK IN THREE WEEKS'}</p>
      <p className="max-w-xl font-sans text-base leading-relaxed opacity-80">
        {`Bought them, or not? Either way, one tap on this link tells Forma how the ${name} turned out, and that is how it learns which shoes run small or narrow. No account, no email: add a reminder to your calendar or keep the link.`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" variant="outline" className="h-10 px-4" onClick={addReminder}>
          <CalendarPlus aria-hidden />
          Add a reminder
        </Button>
        <Button size="lg" variant="outline" className="h-10 px-4" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy the link'}
        </Button>
      </div>
    </div>
  )
}
