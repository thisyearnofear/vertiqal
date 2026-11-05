'use client'

import { SPORTS, type Sport } from '@/lib/metrics/readout'
import { cn } from '@/lib/utils'

interface ProgressHudProps {
  sport: Sport
  progress: { events: number; target: number; ready: boolean }
  /** Locked measurements pinned along the bottom of the screen once the clip is measured. */
  lockedMetrics?: { label: string; value: string; unit: string }[]
  /** Height was never entered, so distance figures in the HUD are estimates. */
  provisional?: boolean
}

/** Event pips while measuring, then the lock banner and pinned metric strip. */
export function ProgressHud({ sport, progress, lockedMetrics, provisional = false }: ProgressHudProps) {
  if (!progress.ready) {
    return (
      <div className="absolute left-4 top-4 z-10 flex items-center gap-3 rounded border border-stage-foreground/40 bg-stage/80 px-3 py-1.5 font-mono text-lg leading-none text-stage-foreground phosphor md:left-6 md:top-6">
        <span>{SPORTS[sport].events.toUpperCase()}</span>
        <span className="flex gap-1" aria-hidden>
          {Array.from({ length: progress.target }, (_, i) => (
            <span
              key={i}
              className={cn('h-4 w-2 rounded-[1px] border border-stage-foreground/60', i < progress.events && 'animate-pip bg-stage-foreground')}
            />
          ))}
        </span>
        <span className="tabular-nums">{`${Math.min(progress.events, progress.target)}/${progress.target}`}</span>
      </div>
    )
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-10 animate-lock-flash bg-stage-foreground opacity-0" aria-hidden />
      <div className="pointer-events-none absolute inset-0 z-20 flex animate-lock-banner items-center justify-center motion-reduce:hidden" aria-hidden>
        <p className="rounded border-2 border-stage-foreground bg-stage/85 px-5 py-2 font-mono text-3xl uppercase leading-none text-stage-foreground phosphor md:text-5xl">
          {'Measurements locked'}
        </p>
      </div>
      {lockedMetrics && lockedMetrics.length > 0 && (
        <dl
          aria-label="Locked measurements"
          className="animate-hud-in absolute inset-x-0 bottom-0 z-10 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-stage-foreground/30 bg-stage/80 px-4 py-2.5 font-mono text-stage-foreground sm:grid-cols-3 md:flex md:flex-wrap md:items-end md:justify-between md:px-6 md:py-3"
        >
          {lockedMetrics.map((metric) => (
            <div key={metric.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="truncate text-[10px] uppercase tracking-[0.2em] opacity-60">{metric.label}</dt>
              <dd className="flex items-baseline gap-1 leading-none">
                <span className="text-2xl tabular-nums phosphor md:text-3xl">{metric.value}</span>
                <span className="text-sm opacity-60">{metric.unit}</span>
              </dd>
            </div>
          ))}
          {provisional && (
            <p className="col-span-full self-center text-[10px] uppercase tracking-[0.2em] phosphor opacity-60 md:col-span-1 md:ml-auto md:text-right">
              {'Height not set · distances estimated'}
            </p>
          )}
        </dl>
      )}
    </>
  )
}
