'use client'

import { useRef } from 'react'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import { ScanSearch } from 'lucide-react'
import type { StockCheck as StockCheckData } from '@/lib/agent/solari'
import { cn } from '@/lib/utils'

const VERDICT_LINE: Record<StockCheckData['verdict'], string> = {
  in_stock: 'In stock',
  out_of_stock: 'Sold out in your size',
  size_not_listed: 'Your size isn’t listed',
  blocked: 'Retailer blocked the check',
  unclear: 'Couldn’t confirm',
}

async function runCheck(url: string, { arg }: { arg: { productName: string; productUrl: string; size: string } }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? 'Stock check failed')
  return body as StockCheckData
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

export function StockCheck({ productName, productUrl, size }: { productName: string; productUrl: string; size: string }) {
  const { trigger, data, error, isMutating } = useSWRMutation('/api/stock-check', runCheck)
  const replayUrl = useReplay(data?.sessionId)
  const good = data?.verdict === 'in_stock'

  if (!data && !isMutating) {
    return (
      <div className="flex flex-col gap-1.5 border-t border-dashed border-stage-foreground/25 pt-3">
        <button
          type="button"
          onClick={() => trigger({ productName, productUrl, size }).catch(() => {})}
          className="flex w-fit items-center gap-2 rounded-sm border border-stage-foreground/60 px-2.5 py-1.5 text-lg uppercase leading-none transition-colors hover:bg-stage-foreground hover:text-stage focus-visible:bg-stage-foreground focus-visible:text-stage focus-visible:outline-none"
        >
          <ScanSearch className="size-4" aria-hidden />
          {`Verify ${size} in stock`}
        </button>
        {error && <p className="font-sans text-sm leading-relaxed text-primary">{error.message}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 border-t border-dashed border-stage-foreground/25 pt-3" aria-live="polite">
      {isMutating ? (
        <p className="flex items-center gap-2 text-lg uppercase leading-snug opacity-85">
          <span className="led" data-state="busy" aria-hidden />
          {`Stealth UK browser checking ${size}`}
          <span className="animate-blink" aria-hidden>
            {'█'}
          </span>
        </p>
      ) : (
        data && (
          <>
            <p className={cn('text-xl uppercase leading-snug', good ? 'phosphor' : 'text-primary phosphor')}>
              {`${good ? '■' : '!'} ${VERDICT_LINE[data.verdict]}`}
              {data.sizeFound && ` · ${data.sizeFound}`}
              {data.price && ` · ${data.price}`}
            </p>
            <p className="text-pretty font-sans text-sm leading-relaxed opacity-80">{data.evidence}</p>
            {data.screenshot && (
              <a
                href={data.screenshot}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-sm border border-stage-foreground/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
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
              {`// Solari · ${data.egress} · ${(data.elapsedMs / 1000).toFixed(1)}s · session ${data.sessionId.slice(-6)}`}
              {replayUrl && (
                <>
                  {' · '}
                  <a href={replayUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-4 hover:text-primary">
                    {'session recording'}
                  </a>
                </>
              )}
            </p>
          </>
        )
      )}
    </div>
  )
}
