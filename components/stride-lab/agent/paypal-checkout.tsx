'use client'

import { useState } from 'react'

const gbpAmount = (price: string) => {
  const match = price.match(/(\d+(?:\.\d{1,2})?)/)
  return match ? match[1] : null
}

type Till = 'idle' | 'ordering' | 'awaiting' | 'capturing' | 'paid' | 'error'

const TILL_LINE: Record<Exclude<Till, 'idle' | 'error'>, string> = {
  ordering: 'CREATING ORDER…',
  awaiting: 'ORDER OPEN — APPROVE IN PAYPAL',
  capturing: 'VERIFYING CAPTURE…',
  paid: 'CAPTURED — PAID VIA PAYPAL',
}

/**
 * Forma's till: a retro PayPal button that drives a live console readout —
 * order created, awaiting approval, captured. The SDK button can't be
 * restyled (it's PayPal's iframe), so this uses the approve-link REST flow:
 * PayPal handles consent, Forma handles the ceremony.
 */
export function PayPalCheckout({ description, price, onBought }: { description: string; price: string; onBought?: () => void }) {
  const [till, setTill] = useState<Till>('idle')
  const [order, setOrder] = useState<{ id: string; approveUrl: string | null } | null>(null)
  const [tracking, setTracking] = useState<string | null>(null)
  const amount = gbpAmount(price)

  const create = async () => {
    setTill('ordering')
    try {
      const res = await fetch('/api/paypal/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, amount }),
      })
      const data = await res.json()
      if (!res.ok || !data.id) throw new Error()
      setOrder({ id: data.id, approveUrl: data.approveUrl ?? null })
      if (data.approveUrl) window.open(data.approveUrl, '_blank', 'noopener,noreferrer')
      setTill('awaiting')
    } catch {
      setTill('error')
    }
  }

  const capture = async () => {
    if (!order) return
    setTill('capturing')
    try {
      const res = await fetch('/api/paypal/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, purpose: 'purchase' }),
      })
      const captured = await res.json().catch(() => null)
      if (!res.ok) {
        setTill('awaiting')
        return
      }
      if (captured?.captureId) {
        // Demo shipment: Forma registers tracking on the capture it made, so
        // delivery status can feed the film-again reminder later.
        const trackingNumber = `FORMA${String(captured.captureId).replace(/[^A-Za-z0-9]/g, '').slice(-12).toUpperCase()}`
        setTracking(trackingNumber)
        fetch('/api/paypal/shipment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ captureId: captured.captureId, carrier: 'FEDEX', trackingNumber }),
        }).catch(() => {})
        try {
          sessionStorage.setItem(
            'forma-paypal-order',
            JSON.stringify({ orderId: order.id, captureId: captured.captureId, product: description, trackingNumber }),
          )
        } catch {
          // No storage — the refund offer just won't show.
        }
      }
      setTill('paid')
      onBought?.()
    } catch {
      setTill('awaiting')
    }
  }

  if (!amount) return null

  return (
    <div className="well flex w-full max-w-xs flex-col gap-2 rounded-md p-3">
      {/* The retro homage — a period-accurate PayPal button, phosphor edition */}
      {till !== 'paid' && (
        <button
          type="button"
          onClick={till === 'awaiting' ? capture : create}
          disabled={till === 'ordering' || till === 'capturing'}
          className="group flex w-fit items-center gap-2 rounded-[4px] border-2 border-stage-foreground/70 bg-stage px-4 py-2 shadow-[inset_0_-3px_0_rgba(0,0,0,0.5),0_2px_0_rgba(255,255,255,0.08)] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 motion-reduce:transition-none"
          aria-label={till === 'awaiting' ? 'Confirm PayPal payment' : 'Checkout with PayPal'}
        >
          <span className="font-mono text-base font-black italic tracking-tight">
            <span className="text-stage-foreground">Pay</span>
            <span className="text-primary">Pal</span>
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stage-foreground/60">est. 1998</span>
        </button>
      )}

      {/* The till readout — the agent working, line by line */}
      {till !== 'idle' && (
        <div className="font-mono text-[11px] leading-relaxed text-stage-foreground/80" aria-live="polite">
          {till !== 'ordering' && order && <p className="opacity-60">{`ORDER ${order.id}`}</p>}
          <p className={till === 'paid' ? 'phosphor' : undefined}>{TILL_LINE[till as Exclude<Till, 'idle' | 'error'>]}</p>
          {till === 'paid' && tracking && <p className="opacity-60">{`> tracking ${tracking} — delivery feeds your film-again nudge`}</p>}
          {till === 'awaiting' && order?.approveUrl && (
            <a href={order.approveUrl} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
              {'>'} approve link again
            </a>
          )}
          {till === 'awaiting' && <p className="opacity-60">{'>'} tap the button again once you have paid — Forma verifies</p>}
          {till === 'error' && <p className="text-primary">CHECKOUT UNAVAILABLE — retailer link still works</p>}
        </div>
      )}
    </div>
  )
}
