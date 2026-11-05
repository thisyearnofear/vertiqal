'use client'

import type { ReactNode } from 'react'
import { SPORTS, type Sport } from '@/lib/metrics/readout'
import type { EngineState } from './pose-stage'

const ENGINE_LINE: Record<EngineState, string> = {
  loading: 'WARMING UP',
  ready: '33 KEYPOINTS · OK',
  error: 'OFFLINE',
}

const PROMISE: Record<Sport, string> = {
  running: 'Record or upload 20 seconds of you running. Get shoes matched to how you actually move.',
  climbing: 'Record or upload up to 45 seconds of one climb. Get shoes matched to how you actually move.',
}

function BootLine({ index, children }: { index: number; children: string }) {
  return (
    <p className="animate-type-in opacity-70" style={{ animationDelay: `${0.35 + index * 0.22}s` }}>
      {children}
    </p>
  )
}

interface BootScreenProps {
  engine: EngineState
  sport: Sport
  /** Primary call to action (e.g. the sample fitting button). */
  action?: ReactNode
  /** Height setter shown as a boot line. */
  heightControl?: ReactNode
}

/** The idle boot overlay: BIOS-style readout over the attract-mode animation. */
export function BootScreen({ engine, sport, action, heightControl }: BootScreenProps) {
  return (
    <div className="absolute inset-0 z-10 flex animate-boot flex-col justify-between p-5 font-mono text-stage-foreground md:p-10">
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1 text-sm leading-snug phosphor md:text-lg">
            <p>{'VERTIQAL V-01 MOVEMENT ANALYSER'}</p>
            <div className="hidden flex-col gap-1 sm:flex">
              <BootLine index={0}>{`POSE ENGINE ........ ${ENGINE_LINE[engine]}`}</BootLine>
              <BootLine index={1}>{`MODE .............. ${SPORTS[sport].label.toUpperCase()}`}</BootLine>
              <BootLine index={2}>{'SIGNAL ............ NONE'}</BootLine>
            </div>
          </div>
          <p className="max-w-32 shrink-0 text-right text-xs uppercase leading-snug tracking-wider opacity-60 sm:max-w-none">Illustration · not a video analysis</p>
        </div>
        {heightControl && <div className="mt-1 animate-type-in" style={{ animationDelay: '1.05s' }}>{heightControl}</div>}
      </div>
      <div className="flex w-full flex-col items-start gap-3 sm:w-3/5 md:gap-4 lg:w-1/2">
        <h2 className="text-balance text-3xl leading-[0.95] phosphor md:text-5xl xl:text-6xl">
          YOUR BODY IS THE SEARCH QUERY
          <span className="ml-2 inline-block animate-blink" aria-hidden>
            {'█'}
          </span>
        </h2>
        <p className="max-w-xl text-pretty text-base leading-snug phosphor md:text-xl">{PROMISE[sport]}</p>
        {action}
        <p className="hidden text-pretty text-sm leading-snug opacity-70 sm:block">{'> OR DROP A SIDE-ON CLIP ON THIS SCREEN'}</p>
      </div>
    </div>
  )
}
