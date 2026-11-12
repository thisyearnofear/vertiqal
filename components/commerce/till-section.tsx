'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { PayPalCheckout } from '@/components/stride-lab/agent/paypal-checkout'

const LABEL = 'text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved'

interface Txn {
  id: string | null
  amount: string | null
  currency: string | null
  status: string | null
  date: string | null
  payer: string | null
  items: string[]
}

const STATUS_LABEL: Record<string, string> = { S: 'SUCCESS' }

const when = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * The till: PayPal is where a fitting ends. A judge can watch money move in
 * three clicks — the button opens a real sandbox order, PayPal handles
 * consent, the server verifies COMPLETED, and the ledger counts it. Same
 * ceremony the decision panel runs on a verified pick, minus the fitting.
 */
export function TillSection() {
  const [txns, setTxns] = useState<Txn[] | null>(null)
  const [ledger, setLedger] = useState<'loading' | 'ready' | 'error' | 'unconfigured'>('loading')
  const [tick, setTick] = useState(0)
  const refreshTimer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/paypal/activity?days=30')
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 503) {
          setLedger('unconfigured')
          return
        }
        const data = res.ok ? await res.json().catch(() => null) : null
        if (!data) {
          setLedger('error')
          return
        }
        setTxns(Array.isArray(data.transactions) ? data.transactions : [])
        setLedger('ready')
      })
      .catch(() => {
        if (!cancelled) setLedger('error')
      })
    return () => {
      cancelled = true
    }
  }, [tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  // A verified capture takes a moment to reach PayPal's transaction list —
  // poll again shortly after the till reports paid.
  const onPaid = useCallback(() => {
    refresh()
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(refresh, 5_000)
  }, [refresh])

  useEffect(() => () => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
  }, [])

  return (
    <section className="housing below-fold flex flex-col gap-4 rounded-2xl p-4 md:p-5" aria-label="Checkout and recent payments">
      <div className="flex flex-col gap-1.5">
        <p className={LABEL}>The till · PayPal sandbox, live</p>
        <p className="max-w-2xl text-pretty font-sans text-base leading-relaxed text-muted-foreground">
          A fitting ends with money moving. The same agent that verifies your size opens a real PayPal order —
          PayPal takes consent, the server verifies the capture, and the ledger counts it. No fitting needed
          to watch it work.
        </p>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
        <div className="flex shrink-0 flex-col gap-2">
          <PayPalCheckout description="Forma agent checkout — sandbox demo" price="144.99" onBought={onPaid} />
          <p className="max-w-xs font-sans text-xs leading-relaxed text-muted-foreground">
            Orders v2 create → PayPal approval → server-verified capture → shipment tracking registered. Sandbox
            money only.
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className={LABEL}>Ledger · last 30 days</p>
            {ledger === 'ready' && (
              <button
                type="button"
                onClick={refresh}
                className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="size-3.5" aria-hidden />
                Refresh
              </button>
            )}
          </div>

          {ledger === 'loading' && <p className="font-mono text-sm uppercase text-muted-foreground">Reading the ledger…</p>}
          {ledger === 'error' && (
            <p className="font-sans text-sm leading-relaxed text-muted-foreground">
              The ledger could not be read right now — the fitting and checkout still work.
            </p>
          )}
          {ledger === 'unconfigured' && (
            <p className="font-sans text-sm leading-relaxed text-muted-foreground">
              PayPal is not configured on this deployment, so there is no ledger to show.
            </p>
          )}
          {ledger === 'ready' && txns && txns.length === 0 && (
            <p className="font-mono text-sm uppercase text-muted-foreground">
              No transactions yet — run the till and a capture lands here.
            </p>
          )}
          {ledger === 'ready' && txns && txns.length > 0 && (
            <ul className="flex flex-col divide-y divide-stage-foreground/15 font-mono text-sm">
              {txns.map((t, i) => (
                <li key={t.id ?? i} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2">
                  <span className="shrink-0 text-muted-foreground">{when(t.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{t.items.join(', ') || '—'}</span>
                  <span className="shrink-0 text-muted-foreground">{t.payer ?? ''}</span>
                  <span className="shrink-0 phosphor">
                    {t.currency ?? ''} {t.amount ?? '—'}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{STATUS_LABEL[t.status ?? ''] ?? t.status ?? ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {'// OUTBOUND: the agent opens orders after a verified fit. INBOUND: any shopping agent can read a fit passport and prepare an order over MCP. Misfit? the same capture refunds itself from the outcome page.'}
      </p>
    </section>
  )
}
