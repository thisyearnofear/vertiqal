'use client'

import { useRef } from 'react'
import useSWR from 'swr'
import type { StockCheck as StockCheckData } from '@/lib/agent/solari'
import type { StockTarget } from '@/lib/fitting/stock'

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
  const source = data.source === 'live' ? 'Live UK browser' : data.source === 'cache' ? 'Cached UK check' : 'Shared live check'
  return (
    <details className="text-lg leading-snug">
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
