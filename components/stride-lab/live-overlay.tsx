'use client'

import { SPORTS, type Sport } from '@/lib/metrics/readout'
import type { LivePhase } from './use-live-camera'

const clock = (seconds: number) => `00:${String(Math.max(0, seconds)).padStart(2, '0')}`

export function LiveOverlay({
  phase,
  secondsLeft,
  caption,
  events,
  sport,
}: {
  phase: LivePhase
  secondsLeft: number
  caption: string | null
  events: number
  sport: Sport
}) {
  if (phase === 'starting') {
    return (
      <div className="flex h-full items-center justify-center bg-stage/85 p-6 font-mono text-stage-foreground">
        <p className="text-center text-2xl uppercase phosphor md:text-3xl">{'> REQUESTING CAMERA…'}</p>
      </div>
    )
  }

  if (phase === 'countdown') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-stage/60 font-mono text-stage-foreground">
        <p className="text-lg uppercase opacity-80 phosphor md:text-xl">
          {sport === 'running' ? 'Step side-on, whole body in frame' : 'Step onto the wall, whole body in frame'}
        </p>
        <p className="text-9xl leading-none tabular-nums phosphor" aria-live="assertive">
          {secondsLeft}
        </p>
      </div>
    )
  }

  if (phase === 'recording') {
    return (
      <div className="flex h-full flex-col justify-between p-4 font-mono text-stage-foreground md:p-6">
        <div className="flex items-center justify-between gap-3 text-xl leading-none">
          <p className="flex items-center gap-2 rounded-sm bg-stage/75 px-2 py-1 phosphor">
            <span className="led" data-state="busy" aria-hidden />
            <span className="tabular-nums">{`REC ${clock(secondsLeft)}`}</span>
          </p>
          <p className="rounded-sm bg-stage/75 px-2 py-1 tabular-nums phosphor">
            {`${events} ${SPORTS[sport].events.toUpperCase()}`}
          </p>
        </div>
        {caption && (
          <p className="self-center rounded-sm bg-stage/85 px-3 py-1.5 text-center text-2xl leading-tight phosphor md:text-3xl" aria-live="polite">
            {`FORMA: ${caption}`}
          </p>
        )}
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="flex h-full flex-col justify-end gap-2 bg-stage/80 p-6 font-mono text-stage-foreground md:p-10">
        <p className="text-4xl leading-none phosphor md:text-5xl">CAPTURE COMPLETE</p>
        <p className="text-lg leading-snug opacity-80 phosphor md:text-xl">
          {`> ${events} ${SPORTS[sport].events.toUpperCase()} MEASURED. CAMERA OFF. NO VIDEO WAS UPLOADED.`}
        </p>
      </div>
    )
  }

  return null
}
