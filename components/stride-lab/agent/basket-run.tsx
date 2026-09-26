'use client'

import useSWR from 'swr'
import type { BasketRun as BasketRunData } from '@/lib/agent/browser-use'
import { cn } from '@/lib/utils'

const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

const fetcher = async (url: string): Promise<BasketRunData> => {
  const response = await fetch(url)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? 'Could not load run')
  return body
}

export function BasketRun({ runId, productName, size }: { runId: string; productName: string; size: string }) {
  const { data, error } = useSWR(`/api/basket/${runId}`, fetcher, {
    refreshInterval: (latest) => (latest && TERMINAL.has(latest.status) ? 0 : 3000),
  })

  const done = data && TERMINAL.has(data.status)
  const outcome = data?.outcome
  const success = done && outcome?.addedToBasket
  const failed = error || (done && !outcome?.addedToBasket)

  const headline = error
    ? 'Lost contact with the browser agent'
    : !data || !done
      ? `Browser agent ${data?.status ?? 'starting'} · finding ${size}`
      : outcome?.addedToBasket
        ? `In your basket: ${productName}, ${outcome.sizeSelected} at ${outcome.price}`
        : outcome
          ? `Couldn't add ${outcome.sizeSelected || size} to the basket`
          : `Run ${data.status}`

  return (
    <div className="flex flex-col gap-3">
      <p
        className={cn(
          'text-xl uppercase leading-snug',
          success && 'phosphor',
          failed && 'text-primary phosphor',
          !done && !error && 'opacity-85',
        )}
        aria-live="polite"
      >
        {`${success ? '■' : failed ? '!' : '▸'} ${headline}`}
        {!done && !error && (
          <span className="ml-2 animate-blink" aria-hidden>
            {'█'}
          </span>
        )}
      </p>

      {data?.liveUrl && !done && (
        <div className="overflow-hidden rounded-md border border-stage-foreground/30">
          <p className="border-b border-stage-foreground/30 px-3 py-1 text-lg leading-none opacity-70">
            {'LIVE FEED · REMOTE BROWSER'}
          </p>
          <iframe
            src={data.liveUrl}
            title="Live view of the browser agent"
            className="aspect-video w-full bg-stage"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}

      {done && (outcome?.notes || data.error || (!outcome && data.summary)) && (
        <p className="font-sans text-base leading-relaxed opacity-85">
          {outcome?.notes ?? data.error ?? data.summary}
        </p>
      )}
      {done && <p className="text-lg leading-none opacity-60">{'// STOPPED BEFORE CHECKOUT. NOTHING WAS PAID FOR.'}</p>}
    </div>
  )
}
