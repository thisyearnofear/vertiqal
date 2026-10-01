'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import type { StockCheck as StockCheckData } from '@/lib/agent/solari'
import type { StockTarget } from '@/lib/fitting/stock'
import { trackStep } from '@/lib/funnel'

export type { StockCheckData }

const VERDICT_LINE: Record<StockCheckData['verdict'], string> = {
  in_stock: 'In stock',
  out_of_stock: 'Sold out in your size',
  size_not_listed: 'Your size isn’t listed',
  blocked: 'Retailer blocked the check',
  unclear: 'Couldn’t confirm',
}

export const stockLine = (data: StockCheckData, size: string) =>
  [VERDICT_LINE[data.verdict], data.sizeFound || size, data.price].filter(Boolean).join(' · ')

type StockKey = readonly [string, string, string, string, string, number]

async function postCheck([url, productName, productUrl, size, stockToken, attempt]: StockKey) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productName, productUrl, size, stockToken, fresh: attempt > 0 }),
  })
  if (response.status === 429) trackStep('limit_hit', { route: 'stock-check' })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? 'Stock check failed')
  return body as StockCheckData
}

/** Checks one size on one product page in a live UK browser. Keyed by size, so changing it re-checks. */
export function useStockCheck(target: StockTarget | null, attempt: number) {
  const key = target?.size.trim()
    ? (['/api/stock-check', target.productName, target.productUrl, target.size.trim(), target.stockToken, attempt] as const)
    : null
  return useSWR(key, postCheck, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
  })
}

const REPLAY_POLLS = 12

function useReplay(sessionId: string | undefined) {
  const polls = useRef(0)
  const { data } = useSWR<{ url: string | null }>(
    sessionId ? `/api/stock-check/replay?session=${encodeURIComponent(sessionId)}` : null,
    (url: string) => {
      polls.current += 1
      return fetch(url).then((r) => r.json())
    },
    {
      refreshInterval: (latest) => (latest?.url || polls.current >= REPLAY_POLLS ? 0 : 3000),
      revalidateOnFocus: false,
    },
  )
  return data?.url ?? null
}

/** The receipt behind a stock verdict: what the browser saw, folded away until asked for. */
export function StockProof({ data, productName }: { data: StockCheckData; productName: string }) {
  const replayUrl = useReplay(data.sessionId)
  const checkedAt = new Date(data.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const source = data.source === 'live' ? 'Live browser' : data.source === 'cache' ? 'Cached browser check' : 'Shared live check'
  return (
    <details name="forma-panels" className="text-lg leading-snug">
      <summary className="w-fit cursor-pointer opacity-80 hover:text-primary">{'+ See what Forma saw'}</summary>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-pretty font-sans text-sm leading-relaxed opacity-80">{data.evidence}</p>
        {data.screenshot && (
          <a
            href={data.screenshot}
            target="_blank"
            rel="noreferrer"
            className="block max-w-md overflow-hidden rounded-sm border border-stage-foreground/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a per-request data URL; next/image adds nothing here */}
            <img
              src={data.screenshot}
              alt={`What the browser saw on ${data.pageTitle || productName}`}
              className="aspect-[16/11] w-full object-cover object-top"
            />
          </a>
        )}
        <p className="text-base uppercase leading-snug opacity-60">
          {`// Observed page: ${data.finalUrl || data.productUrl} · HTTP ${data.httpStatus ?? 'none'}`}
        </p>
        <p className="text-base uppercase leading-snug opacity-60">
          {`// ${source} · checked ${checkedAt} · ${data.egress} · ${(data.elapsedMs / 1000).toFixed(1)}s · session ${data.sessionId.slice(-6)}`}
          {replayUrl && (
            <>
              {' · '}
              <a href={replayUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-4 hover:text-primary">
                {'session recording'}
              </a>
            </>
          )}
        </p>
      </div>
    </details>
  )
}

const PEEK_LINGER_MS = 8000

/**
 * A small "Forma's browser" window while the size check runs: the address it is visiting, an honest
 * description and a clock, then the screenshot and verdict. Solari has no live view, so the
 * recording link appears once the session has uploaded. Closes itself a few seconds after the result.
 */
export function BrowserPeek({
  url,
  retailer,
  size,
  checking,
  elapsed,
  data,
  error,
  attempt,
}: {
  url: string
  retailer: string
  size: string | null
  checking: boolean
  elapsed: number
  data: StockCheckData | undefined
  error: Error | undefined
  /** Re-running the same size is a new run, so the window shows again. */
  attempt: number
}) {
  const runKey = `${url}|${size}|${attempt}`
  const [closed, setClosed] = useState<string | null>(null)
  const [faded, setFaded] = useState<string | null>(null)
  const replayUrl = useReplay(data?.sessionId)
  const done = !checking && Boolean(data || error)

  useEffect(() => {
    if (!done) return
    const id = window.setTimeout(() => setFaded(runKey), PEEK_LINGER_MS)
    return () => window.clearTimeout(id)
  }, [done, runKey])

  const visible = checking || (done && faded !== runKey)
  if (!size || closed === runKey || !visible) return null

  let address = url
  try {
    const u = new URL(url)
    address = `${u.hostname.replace(/^www\./, '')}${u.pathname}`
  } catch {}

  return (
    <div
      role="status"
      aria-label={`Forma's browser checking ${size} at ${retailer}`}
      className="fixed bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+11rem)] right-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] animate-in fade-in slide-in-from-bottom-2 overflow-hidden rounded-xl border border-stage-foreground/40 bg-stage font-mono text-stage-foreground shadow-[0_12px_40px_-12px_var(--stage-foreground)] duration-300 lg:bottom-32 lg:right-6"
    >
      <div className="flex items-center gap-2 border-b border-stage-foreground/30 px-3 py-2">
        <span className="flex gap-1" aria-hidden>
          <span className="size-2 rounded-full bg-stage-foreground/60" />
          <span className="size-2 rounded-full bg-stage-foreground/40" />
          <span className="size-2 rounded-full bg-stage-foreground/25" />
        </span>
        <span className="min-w-0 flex-1 truncate rounded-sm bg-stage-foreground/10 px-2 py-0.5 text-xs opacity-80">{address}</span>
        <button
          type="button"
          onClick={() => setClosed(runKey)}
          aria-label="Close Forma's browser"
          className="shrink-0 px-1 text-sm opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          ×
        </button>
      </div>
      <div className="flex flex-col gap-2 p-3">
        {checking ? (
          <>
            <p className="flex items-center gap-2 text-base uppercase leading-snug phosphor">
              <span className="led" data-state="busy" aria-hidden />
              {`Forma's browser · ${elapsed}s`}
            </p>
            <p className="font-sans text-sm leading-relaxed opacity-80">
              {`Loading ${retailer} from the UK, confirming it's this shoe and reading the ${size} button.`}
            </p>
          </>
        ) : error ? (
          <p className="text-base uppercase leading-snug text-primary phosphor">{`! Couldn't check: ${error.message}`}</p>
        ) : data ? (
          <>
            {data.screenshot && (
              // eslint-disable-next-line @next/next/no-img-element -- a per-request data URL; next/image adds nothing here
              <img src={data.screenshot} alt={`What Forma's browser saw at ${retailer}`} className="aspect-[16/10] w-full rounded-sm object-cover object-top" />
            )}
            <p className="text-base uppercase leading-snug phosphor">{`${data.verdict === 'in_stock' ? '■' : '!'} ${stockLine(data, size)}`}</p>
            {replayUrl && (
              <a href={replayUrl} target="_blank" rel="noreferrer" className="w-fit text-sm underline decoration-dotted underline-offset-4 hover:text-primary">
                Watch the recording
              </a>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
