'use client'

import { ArrowRight } from 'lucide-react'
import { motion, useTransform, type MotionValue } from 'motion/react'
import type { ReactNode, RefObject } from 'react'
import { cn } from '@/lib/utils'
import { BEATS } from './story'

const EYEBROW = 'font-mono text-xl uppercase leading-none tracking-[0.18em] text-stage-foreground'
const HEADLINE = 'text-balance text-4xl font-semibold leading-[1.04] tracking-tight text-stage-ink md:text-6xl'
const BODY = 'max-w-lg text-pretty text-base leading-relaxed text-stage-muted md:text-lg'
const EASE = [0.2, 0.8, 0.2, 1] as const

export function StartLink({ className }: { className?: string }) {
  return (
    <a
      href="#fitting"
      className={cn(
        'inline-flex h-12 w-fit items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold uppercase tracking-[0.14em] text-primary-foreground transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:transition-none',
        className,
      )}
    >
      Start your fitting
      <ArrowRight className="size-4" aria-hidden />
    </a>
  )
}

export function TopBar() {
  return (
    <div className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 md:px-10">
        <span className="text-xl font-semibold tracking-tight text-stage-ink">vertiqal</span>
        <a
          href="#fitting"
          className="rounded-sm text-xs font-semibold uppercase tracking-[0.16em] text-stage-ink transition-colors hover:text-stage-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          Start your fitting
        </a>
      </div>
    </div>
  )
}

function Line({ children, delay, entrance }: { children: ReactNode; delay: number; entrance: boolean }) {
  return (
    <span className="block overflow-hidden pb-1">
      <motion.span
        className="block"
        initial={entrance ? { y: '105%' } : false}
        animate={{ y: 0 }}
        transition={{ duration: 0.9, ease: EASE, delay }}
      >
        {children}
      </motion.span>
    </span>
  )
}

function Rise({ children, delay, entrance, className }: { children: ReactNode; delay: number; entrance: boolean; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={entrance ? { opacity: 0, y: 16 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

export function IntroCopy({ entrance, onHowItWorks }: { entrance: boolean; onHowItWorks?: () => void }) {
  return (
    <>
      <h1 className="text-balance text-5xl font-semibold leading-[1.02] tracking-tight text-stage-ink md:text-7xl">
        <Line delay={0.15} entrance={entrance}>
          Your body is
        </Line>
        <Line delay={0.27} entrance={entrance}>
          the search query.
        </Line>
      </h1>
      <Rise delay={0.5} entrance={entrance}>
        <p className={BODY}>
          Stop choosing running or climbing shoes by colourway. Film yourself on the road or on the wall and Forma,
          the vertiqal fitting agent, finds the pair built for how you actually move.
        </p>
      </Rise>
      <Rise delay={0.62} entrance={entrance} className="flex flex-wrap items-center gap-4">
        <StartLink />
        {onHowItWorks && (
          <button
            type="button"
            onClick={onHowItWorks}
            className="inline-flex h-12 items-center rounded-full border border-stage-ink/25 px-6 text-sm font-semibold uppercase tracking-[0.14em] text-stage-ink transition-colors hover:border-stage-ink/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            See how it works
          </button>
        )}
      </Rise>
    </>
  )
}

const PAINS = [
  'A twenty-second jog on a shop treadmill decides your next thousand kilometres.',
  'Climbing shoes get sized down by guesswork, so you find out halfway up a route whether the downturn suits you.',
  'The wrong fit shows up weeks later as sore shins or crushed toes, long after the return window.',
]

export function ProblemCopy() {
  return (
    <>
      <p className={EYEBROW}>The problem</p>
      <h2 className={HEADLINE}>Hundreds of shoes. Picked by colourway.</h2>
      <ul className="flex max-w-lg flex-col">
        {PAINS.map((pain) => (
          <li key={pain} className="border-t border-stage-ink/15 py-4 text-pretty text-base leading-relaxed text-stage-muted md:text-lg">
            {pain}
          </li>
        ))}
      </ul>
    </>
  )
}

function Metric({ label, value, unit }: { label: string; value: MotionValue<number>; unit: string }) {
  return (
    <div className="flex flex-col gap-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-stage-muted">{label}</dt>
      <dd className="font-mono text-4xl leading-none text-stage-foreground md:text-5xl">
        <motion.span>{value}</motion.span>
        <span className="ml-1 text-xl text-stage-muted">{unit}</span>
      </dd>
    </div>
  )
}

export function ScanCopy({ progress, phaseRef }: { progress: MotionValue<number>; phaseRef: RefObject<HTMLSpanElement | null> }) {
  const range = [BEATS.scan[0] + 0.02, BEATS.scan[0] + 0.16]
  const cadence = useTransform(progress, range, [0, 172], { clamp: true })
  const contact = useTransform(progress, range, [0, 248], { clamp: true })
  const overstride = useTransform(progress, range, [0, 7], { clamp: true })
  const round = (v: number) => Math.round(v)

  return (
    <>
      <p className={EYEBROW}>On the road</p>
      <h2 className={HEADLINE}>Ten seconds of you says more than any review.</h2>
      <p className={BODY}>
        Forma tracks 33 points on your body, entirely in your browser, and reads how you land, load and push off.
      </p>
      <dl className="grid max-w-lg grid-cols-3 gap-4 border-t border-stage-ink/15 pt-5">
        <Metric label="Cadence" value={useTransform(cadence, round)} unit="spm" />
        <Metric label="Contact" value={useTransform(contact, round)} unit="ms" />
        <Metric label="Overstride" value={useTransform(overstride, round)} unit="cm" />
      </dl>
      <p className="font-mono text-xl uppercase leading-none tracking-[0.14em] text-stage-muted">
        {'Phase · '}
        <span ref={phaseRef} className="text-stage-foreground">
          Landing
        </span>
        <span className="sr-only">{'. Example readout from a sample stride.'}</span>
      </p>
    </>
  )
}

export function ClimbCopy({ progress, phaseRef }: { progress: MotionValue<number>; phaseRef: RefObject<HTMLSpanElement | null> }) {
  const range = [BEATS.climb[0] + 0.02, BEATS.climb[0] + 0.16]
  const quiet = useTransform(progress, range, [0, 92], { clamp: true })
  const hips = useTransform(progress, range, [0, 34], { clamp: true })
  const edge = useTransform(progress, range, [0, 13], { clamp: true })
  const round = (v: number) => Math.round(v)

  return (
    <>
      <p className={EYEBROW}>On the wall</p>
      <h2 className={HEADLINE}>Every foot placement tells Forma how hard you push your shoes.</h2>
      <p className={BODY}>
        Film one short climb. Forma counts clean placements against readjusts, watches how close your hips stay to the
        wall and how you stand on edges, then picks the downturn, stiffness and size to match.
      </p>
      <dl className="grid max-w-lg grid-cols-3 gap-4 border-t border-stage-ink/15 pt-5">
        <Metric label="Quiet feet" value={useTransform(quiet, round)} unit="%" />
        <Metric label="Hips to wall" value={useTransform(hips, round)} unit="cm" />
        <Metric label="Edging" value={useTransform(edge, round)} unit="°" />
      </dl>
      <p className="font-mono text-xl uppercase leading-none tracking-[0.14em] text-stage-muted">
        {'Move · '}
        <span ref={phaseRef} className="text-stage-foreground">
          Reaching
        </span>
        <span className="sr-only">{'. Example readout from a sample climb.'}</span>
      </p>
    </>
  )
}

const PROOFS = [
  'Research weighed against your numbers',
  'Your exact size checked live, with a screenshot as proof',
  'Forma stays with you on WhatsApp while they break in',
]

export function MatchCopy() {
  return (
    <>
      <p className={EYEBROW}>The match</p>
      <h2 className={HEADLINE}>One shoe. Your size. Proven in stock.</h2>
      <ul className="flex max-w-lg flex-col gap-3">
        {PROOFS.map((proof) => (
          <li key={proof} className="flex items-center gap-3 text-pretty text-base leading-relaxed text-stage-ink md:text-lg">
            <span className="led shrink-0" data-state="on" aria-hidden />
            {proof}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3">
        <StartLink />
        <p className="text-sm leading-relaxed text-stage-muted">No account needed. Your frames never leave your browser.</p>
      </div>
    </>
  )
}
