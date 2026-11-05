'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: {
        createOrder: () => Promise<string>
        onApprove: (data: { orderID: string }) => Promise<void>
        onError: (err: unknown) => void
        style?: Record<string, string>
      }) => { render: (el: HTMLElement) => void }
    }
  }
}

/**
 * The real PayPal checkout: creates the order server-side, captures on
 * approval (server verifies amount + status), then the tier cookie flips.
 */
export function PayPalUpgrade({ clientId }: { clientId: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'ready' | 'busy' | 'error'>('loading')

  useEffect(() => {
    if (window.paypal) {
      const id = requestAnimationFrame(() => setStatus('ready'))
      return () => cancelAnimationFrame(id)
    }
    const script = document.createElement('script')
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=GBP&intent=capture`
    script.async = true
    script.onload = () => setStatus('ready')
    script.onerror = () => setStatus('error')
    document.body.appendChild(script)
  }, [clientId])

  useEffect(() => {
    const host = hostRef.current
    if (status !== 'ready' || !host || !window.paypal) return
    host.replaceChildren()
    window.paypal
      .Buttons({
        createOrder: async () => {
          const res = await fetch('/api/paypal/order', { method: 'POST' })
          const data = await res.json()
          if (!res.ok || !data.id) throw new Error(data.error ?? 'Could not start checkout')
          return data.id
        },
        onApprove: async (data) => {
          setStatus('busy')
          const res = await fetch('/api/paypal/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: data.orderID }),
          })
          if (!res.ok) {
            setStatus('error')
            return
          }
          router.refresh()
        },
        onError: () => setStatus('error'),
        style: { layout: 'vertical', shape: 'rect', label: 'paypal' },
      })
      .render(host)
  }, [status, router])

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      {status === 'loading' && <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Loading PayPal…</p>}
      {status === 'error' && <p className="text-sm leading-relaxed text-primary">Checkout is unavailable right now — try again shortly.</p>}
      <div ref={hostRef} aria-hidden={status !== 'ready'} />
      <p className="text-xs leading-relaxed text-muted-foreground">£9, once — Pro stays on this browser.</p>
    </div>
  )
}
