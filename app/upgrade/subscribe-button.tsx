'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type State = 'idle' | 'pending' | 'checking' | 'active' | 'error'

/**
 * Forma Pro as a PayPal subscription: start the subscription server-side,
 * hand the shopper the PayPal approve link, verify ACTIVE on return.
 */
export function SubscribeButton() {
  const router = useRouter()
  const [state, setState] = useState<State>('idle')
  const [approveUrl, setApproveUrl] = useState<string | null>(null)
  const [subId, setSubId] = useState<string | null>(null)

  const start = async () => {
    setState('pending')
    try {
      const res = await fetch('/api/paypal/subscription', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.subscriptionId) throw new Error()
      setSubId(data.subscriptionId)
      if (data.approveUrl) {
        setApproveUrl(data.approveUrl)
        window.open(data.approveUrl, '_blank', 'noopener,noreferrer')
      }
      setState('idle')
    } catch {
      setState('error')
    }
  }

  const check = async () => {
    if (!subId) return
    setState('checking')
    try {
      const res = await fetch('/api/paypal/subscription/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId: subId }),
      })
      const data = await res.json()
      if (data.active) {
        setState('active')
        router.refresh()
      } else {
        setState('idle')
      }
    } catch {
      setState('error')
    }
  }

  if (state === 'active') return null // page re-reads tier and shows "Pro is active"

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      {subId && approveUrl ? (
        <>
          <a
            href={approveUrl}
            target="_blank"
            rel="noreferrer"
            className="w-fit rounded-sm border-2 border-foreground bg-foreground px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-background transition-transform hover:scale-[1.02]"
          >
            Approve in PayPal
          </a>
          <button
            type="button"
            onClick={check}
            disabled={state === 'checking'}
            className="w-fit text-xs uppercase tracking-[0.2em] text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            {state === 'checking' ? 'Checking…' : "I've approved it — activate"}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={state === 'pending'}
          className="w-fit rounded-sm border-2 border-foreground bg-foreground px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-background transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          {state === 'pending' ? 'Starting…' : 'Subscribe with PayPal — £9/mo'}
        </button>
      )}
      {state === 'error' && <p className="text-sm leading-relaxed text-primary">Checkout is unavailable right now — try again shortly.</p>}
      <p className="text-xs leading-relaxed text-muted-foreground">Recurring via PayPal subscriptions — cancel any time in PayPal.</p>
    </div>
  )
}
