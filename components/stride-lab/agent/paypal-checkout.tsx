'use client'

import { useEffect, useRef, useState } from 'react'

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

const gbpAmount = (price: string) => {
  const match = price.match(/(\d+(?:\.\d{1,2})?)/)
  return match ? match[1] : null
}

/**
 * Agentic checkout: Forma verified the size in stock, PayPal is the till.
 * The shopper approves in PayPal's popup; the server captures and verifies
 * COMPLETED before the bought state is set.
 */
export function PayPalCheckout({ description, price, clientId, onBought }: { description: string; price: string; clientId: string; onBought?: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'paid'>('loading')
  const amount = gbpAmount(price)

  useEffect(() => {
    if (!amount) return
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
  }, [clientId, amount])

  useEffect(() => {
    const host = hostRef.current
    if (status !== 'ready' || !host || !window.paypal || !amount) return
    host.replaceChildren()
    window.paypal
      .Buttons({
        createOrder: async () => {
          const res = await fetch('/api/paypal/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description, amount }),
          })
          const data = await res.json()
          if (!res.ok || !data.id) throw new Error(data.error ?? 'Could not start checkout')
          return data.id
        },
        onApprove: async (data) => {
          const res = await fetch('/api/paypal/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: data.orderID, purpose: 'purchase' }),
          })
          const captured = await res.json().catch(() => null)
          if (!res.ok) {
            setStatus('error')
            return
          }
          // Remember the capture so a later "they didn't fit" can unwind it — refund, not just regret.
          if (captured?.captureId) {
            try {
              sessionStorage.setItem('forma-paypal-order', JSON.stringify({ orderId: data.orderID, captureId: captured.captureId, product: description }))
            } catch {
              // Session storage unavailable — the refund path just won't show.
            }
          }
          setStatus('paid')
          onBought?.()
        },
        onError: () => setStatus('error'),
        style: { layout: 'vertical', shape: 'rect', label: 'paypal' },
      })
      .render(host)
  }, [status, description, amount, onBought])

  if (!amount) return null
  if (status === 'paid') {
    return <p className="rounded border border-stage-foreground/60 px-4 py-2 text-sm phosphor">{'✓ Paid via PayPal — order captured'}</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {status === 'error' && <p className="text-sm leading-relaxed text-primary">Checkout is unavailable right now — the retailer link still works.</p>}
      <div ref={hostRef} />
    </div>
  )
}
