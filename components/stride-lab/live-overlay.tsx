'use client'

import { SPORTS, type Sport } from '@/lib/metrics/readout'
import type { FrameQuality } from '@/lib/pose/types'
import { cn } from '@/lib/utils'
import type { LivePhase } from './use-live-camera'

const clock = (seconds: number) => `00:${String(Math.max(0, seconds)).padStart(2, '0')}`

function Check({ ready, compact, children }: { ready: boolean; compact?: boolean; children: string }) {
  return (
    <span className={cn('flex items-center gap-1.5 rounded-sm border px-2 py-1 uppercase leading-none', compact ? 'text-xs' : 'text-sm', ready ? 'border-stage-foreground/70 bg-stage-foreground/15 phosphor' : 'border-stage-foreground/25 opacity-60')}>
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
  compact = false,
}: {
  phase: LivePhase
  secondsLeft: number
  totalSeconds: number
  caption: string | null
  events: number
  framing: FrameQuality
  sport: Sport
  compact?: boolean
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
      <div className={cn('flex h-full flex-col items-center justify-center bg-stage/60 font-mono text-stage-foreground', compact ? 'gap-2 p-3' : 'gap-4 p-4')}>
        <p className={cn('uppercase opacity-80 phosphor', compact ? 'text-xs' : 'text-lg md:text-xl')}>
          {sport === 'running' ? 'Step side-on, whole body in frame' : 'Step onto the wall, whole body in frame'}
        </p>
        <p className={cn('leading-none tabular-nums phosphor', compact ? 'text-6xl' : 'text-9xl')} aria-live="assertive">
          {secondsLeft}
        </p>
        <div className="flex flex-wrap justify-center gap-2" aria-label="Framing checks">
          <Check ready={framing.person} compact={compact}>Person seen</Check>
          <Check ready={framing.hips} compact={compact}>Hips visible</Check>
          <Check ready={framing.feet} compact={compact}>Both feet</Check>
        </div>
      </div>
    )
  }

  if (phase === 'recording') {
    return (
      <div className={cn('flex h-full flex-col justify-between font-mono text-stage-foreground', compact ? 'p-3' : 'p-4 md:p-6')}>
        <div className={cn('flex items-center justify-between gap-3 leading-none', compact ? 'text-sm' : 'text-xl')}>
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
            <p className={cn('self-center rounded-sm bg-stage/85 px-3 py-1.5 text-center leading-tight phosphor', compact ? 'text-sm' : 'text-2xl md:text-3xl')} aria-live="polite">
              {`FORMA: ${caption}`}
            </p>
          )}
          <div className="flex flex-col gap-2 self-stretch">
            <p className={cn('w-fit rounded-sm bg-stage/75 px-2 py-1 uppercase leading-none opacity-85', compact ? 'text-xs' : 'text-sm')}>
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
      <div className={cn('flex h-full flex-col justify-end gap-2 bg-stage/80 font-mono text-stage-foreground', compact ? 'p-3' : 'p-6 md:p-10')}>
        <p className={cn('leading-none phosphor', compact ? 'text-2xl' : 'text-4xl md:text-5xl')}>CAPTURE COMPLETE</p>
        <p className={cn('leading-snug opacity-80 phosphor', compact ? 'text-xs' : 'text-lg md:text-xl')}>
          {`> ${events} ${SPORTS[sport].events.toUpperCase()} MEASURED. CAMERA OFF. NO VIDEO WAS UPLOADED.`}
        </p>
      </div>
    )
  }

  return null
}
