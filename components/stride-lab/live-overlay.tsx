'use client'

import { SPORTS, type Sport } from '@/lib/metrics/readout'
import type { FrameQuality } from '@/lib/pose/types'
import { cn } from '@/lib/utils'
import type { LivePhase } from './use-live-camera'

const clock = (seconds: number) => `00:${String(Math.max(0, seconds)).padStart(2, '0')}`

function Check({ ready, children }: { ready: boolean; children: string }) {
  return (
    <span className={cn('flex items-center gap-1.5 rounded-sm border px-2 py-1 text-sm uppercase leading-none', ready ? 'border-stage-foreground/70 bg-stage-foreground/15 phosphor' : 'border-stage-foreground/25 opacity-60')}>
      <span className="led" data-state={ready ? 'on' : 'off'} aria-hidden />
      {children}
    </span>
  )
}

export function LiveOverlay({
  phase,
  secondsLeft,
  totalSeconds,
  caption,
  events,
  framing,
  sport,
}: {
  phase: LivePhase
  secondsLeft: number
  totalSeconds: number
  caption: string | null
  events: number
  framing: FrameQuality
  sport: Sport
}) {
  const progress = totalSeconds > 0 ? Math.min(1, Math.max(0, (totalSeconds - secondsLeft) / totalSeconds)) : 0
  if (phase === 'starting') {
    return (
      <div className="flex h-full items-center justify-center bg-stage/85 p-6 font-mono text-stage-foreground">
        <p className="text-center text-2xl uppercase phosphor md:text-3xl">{'> REQUESTING CAMERA…'}</p>
      </div>
    )
  }

  if (phase === 'countdown') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-stage/60 p-4 font-mono text-stage-foreground">
        <p className="text-lg uppercase opacity-80 phosphor md:text-xl">
          {sport === 'running' ? 'Step side-on, whole body in frame' : 'Step onto the wall, whole body in frame'}
        </p>
        <p className="text-9xl leading-none tabular-nums phosphor" aria-live="assertive">
          {secondsLeft}
        </p>
        <div className="flex flex-wrap justify-center gap-2" aria-label="Framing checks">
          <Check ready={framing.person}>Person seen</Check>
          <Check ready={framing.hips}>Hips visible</Check>
          <Check ready={framing.feet}>Both feet</Check>
        </div>
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
        <div className="flex flex-col gap-3">
          {caption && (
            <p className="self-center rounded-sm bg-stage/85 px-3 py-1.5 text-center text-2xl leading-tight phosphor md:text-3xl" aria-live="polite">
              {`FORMA: ${caption}`}
            </p>
          )}
          <div className="flex flex-col gap-2 self-stretch">
            <p className="w-fit rounded-sm bg-stage/75 px-2 py-1 text-sm uppercase leading-none opacity-85">
              {!framing.person ? 'Step into frame' : !framing.feet ? 'Move back — keep both feet visible' : !framing.hips ? 'Keep your hips in view' : 'Framing looks good · keep moving'}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-stage-foreground/20" aria-hidden>
              <div className="h-full bg-stage-foreground transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        </div>
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
