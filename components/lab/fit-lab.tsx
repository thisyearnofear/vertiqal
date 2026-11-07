'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { themeQuartz, colorSchemeDark, type ColDef, type ValueFormatterParams } from 'ag-grid-community'

interface Transaction {
  id: string | null
  amount: string | null
  currency: string | null
  status: string | null
  date: string | null
  payer: string | null
  items: string[]
}

interface Outcome {
  ref: string
  sport: string
  retailer: string
  size: string
  outcome: string
  reason?: string
  clickedAt: string
  reportedAt: string
}

interface LabFeed {
  transactions: Transaction[]
  transactionsAvailable: boolean
  outcomes: Outcome[]
  outcomesAvailable: boolean
}

const gridTheme = themeQuartz.withPart(colorSchemeDark)

const money = (currency: string | null, value: string | null) => {
  const n = Number(value)
  if (!value || !Number.isFinite(n)) return ''
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP' }).format(n)
  } catch {
    return `${currency ?? ''} ${value}`.trim()
  }
}

const when = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : '')
const items = (value: string[] | null | undefined) => (value ?? []).join(', ')

const transactionCols: ColDef<Transaction>[] = [
  { field: 'date', headerName: 'Date', flex: 1.2, valueFormatter: (p: ValueFormatterParams<Transaction, string>) => when(p.value) },
  { field: 'payer', headerName: 'Payer', flex: 1 },
  { field: 'items', headerName: 'Items', flex: 2, valueFormatter: (p: ValueFormatterParams<Transaction, string[]>) => items(p.value) },
  {
    colId: 'amount',
    headerName: 'Amount',
    flex: 0.9,
    valueGetter: (p) => Number(p.data?.amount ?? NaN),
    valueFormatter: (p: ValueFormatterParams<Transaction, number>) =>
      p.data ? money(p.data.currency, p.data.amount) : '',
  },
  { field: 'status', headerName: 'Status', flex: 0.8 },
  { field: 'id', headerName: 'Transaction', flex: 1.4, tooltipField: 'id' },
]

const outcomeCols: ColDef<Outcome>[] = [
  { field: 'reportedAt', headerName: 'Reported', flex: 1.2, valueFormatter: (p: ValueFormatterParams<Outcome, string>) => when(p.value) },
  { field: 'sport', headerName: 'Sport', flex: 0.7 },
  { field: 'retailer', headerName: 'Retailer', flex: 1 },
  { field: 'size', headerName: 'Size', flex: 0.6 },
  { field: 'outcome', headerName: 'Outcome', flex: 0.9 },
  { field: 'reason', headerName: 'Reason', flex: 1.2 },
  { field: 'ref', headerName: 'Ref', flex: 1, tooltipField: 'ref' },
]

const FIT_FAILED = new Set(['too-tight', 'too-loose', 'wrong-type', 'returned'])

const AGENT_DEMO = 'node scripts/agent-shop-mcp.mjs --product "Nike Pegasus 41" --passport demo-running'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        } catch {
          // Clipboard unavailable — the command is selectable text anyway.
        }
      }}
      className="well rounded-md px-3 py-1.5 font-mono text-xs text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  )
}

export function FitLab() {
  const [feed, setFeed] = useState<LabFeed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchFeed = useCallback(async () => {
    const res = await fetch('/api/lab')
    if (!res.ok) throw new Error()
    setFeed(await res.json())
    setError(null)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      await fetchFeed()
    } catch {
      setError('The lab feed did not load.')
    } finally {
      setLoading(false)
    }
  }, [fetchFeed])

  useEffect(() => {
    // setError runs in a promise callback after the fetch settles — not a synchronous effect setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFeed().catch(() => setError('The lab feed did not load.'))
  }, [fetchFeed])

  const stats = useMemo(() => {
    const txns = feed?.transactions ?? []
    const gmv = txns.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
    const currency = txns.find((t) => t.currency)?.currency ?? 'GBP'
    const outcomes = feed?.outcomes ?? []
    const failed = outcomes.filter((o) => FIT_FAILED.has(o.outcome)).length
    return { orders: txns.length, gmv: money(currency, String(gmv)), reports: outcomes.length, fitFailRate: outcomes.length ? Math.round((failed / outcomes.length) * 100) : null }
  }, [feed])

  if (error && !feed) return <p className="text-sm text-primary">{error}</p>
  if (!feed) return <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Loading the lab…</p>

  return (
    <div className="flex flex-col gap-8">
      {/* Headline stats — the lab's answer in one glance */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Orders', value: String(stats.orders) },
          { label: 'Volume', value: stats.gmv || '—' },
          { label: 'Fit reports', value: String(stats.reports) },
          { label: 'Fit-fail rate', value: stats.fitFailRate === null ? '—' : `${stats.fitFailRate}%` },
        ].map((s) => (
          <div key={s.label} className="well rounded-lg p-4">
            <p className="font-mono text-2xl font-semibold text-foreground">{s.value}</p>
            <p className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* The agentic-commerce demo, one copy away */}
      <section className="well flex flex-col gap-2 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Agent demo</p>
          <CopyButton text={AGENT_DEMO} />
        </div>
        <code className="block overflow-x-auto rounded-md bg-background/60 px-3 py-2 font-mono text-xs text-foreground">{AGENT_DEMO}</code>
        <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
          One agent, two MCP servers: reads the fit passport, judges the shoe, shops the catalog, opens a PayPal order.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Fit verdicts</h2>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {loading ? 'refreshing…' : 'refresh'}
          </button>
        </div>
        {stats.reports === 0 && (
          <p className="text-sm text-muted-foreground">No fit reports stored yet — outcomes persist once a shared counter store is configured.</p>
        )}
        <div className="well overflow-hidden rounded-lg">
          <AgGridReact
            rowData={feed.outcomes}
            columnDefs={outcomeCols}
            theme={gridTheme}
            domLayout="autoHeight"
            rowHeight={36}
            headerHeight={38}
            enableCellTextSelection
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">PayPal orders</h2>
        {!feed.transactionsAvailable ? (
          <p className="text-sm text-muted-foreground">Transactions are unavailable — PayPal is not configured or the call failed.</p>
        ) : (
          <div className="well overflow-hidden rounded-lg">
            <AgGridReact
              rowData={feed.transactions}
              columnDefs={transactionCols}
              theme={gridTheme}
              domLayout="autoHeight"
              rowHeight={36}
              headerHeight={38}
              enableCellTextSelection
            />
          </div>
        )}
      </section>
      {error && <p className="text-sm text-primary">{error}</p>}
    </div>
  )
}
