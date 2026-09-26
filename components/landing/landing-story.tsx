'use client'

import dynamic from 'next/dynamic'
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { BEATS, HERO_SHOE, beatAt, type BeatName } from './story'
import { IntroCopy, MatchCopy, ProblemCopy, ScanCopy, TopBar } from './story-beats'
import { StrideScan } from './stride-scan'

const ShoeWall = dynamic(() => import('./shoe-wall').then((m) => m.ShoeWall), { ssr: false })

const EASE = [0.2, 0.8, 0.2, 1] as const
const RAIL: { beat: Exclude<BeatName, 'intro'>; label: string }[] = [
  { beat: 'problem', label: 'Problem' },
  { beat: 'scan', label: 'Scan' },
  { beat: 'match', label: 'Match' },
]

function BeatRail({
  progress,
  beat,
  onSelect,
}: {
  progress: MotionValue<number>
  beat: BeatName
  onSelect: (b: BeatName) => void
}) {
  const fill = useTransform(progress, [BEATS.problem[0], 1], [0, 1], { clamp: true })
  return (
    <nav aria-label="Story chapters" className="absolute bottom-8 right-10 z-20 hidden flex-col items-end gap-3 md:flex">
      <ol className="flex items-center gap-6">
        {RAIL.map((item) => (
          <li key={item.beat}>
            <button
              type="button"
              onClick={() => onSelect(item.beat)}
              aria-current={beat === item.beat ? 'step' : undefined}
              className={cn(
                'rounded-sm text-xs font-semibold uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
                beat === item.beat ? 'text-stage-foreground' : 'text-stage-muted hover:text-stage-ink',
              )}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ol>
      <div className="h-px w-56 bg-stage-ink/15">
        <motion.div className="h-px origin-left bg-stage-foreground" style={{ scaleX: fill }} />
      </div>
    </nav>
  )
}

function PinnedStory() {
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const phaseRef = useRef<HTMLSpanElement>(null)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })
  const [beat, setBeat] = useState<BeatName>('intro')
  const [onScreen, setOnScreen] = useState(true)
  const [introPlayed, setIntroPlayed] = useState(false)

  useMotionValueEvent(scrollYProgress, 'change', (v) => setBeat(beatAt(v)))

  useEffect(() => {
    setBeat(beatAt(scrollYProgress.get()))
    const section = sectionRef.current
    if (!section) return
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting))
    observer.observe(section)
    return () => observer.disconnect()
  }, [scrollYProgress])

  useEffect(() => {
    if (beat !== 'intro') setIntroPlayed(true)
  }, [beat])

  const [scanStart, scanEnd] = BEATS.scan
  const scanOpacity = useTransform(scrollYProgress, [scanStart - 0.03, scanStart + 0.02, scanEnd - 0.03, scanEnd + 0.01], [0, 1, 1, 0])

  const goTo = (target: BeatName) => {
    const section = sectionRef.current
    if (!section) return
    const top = section.getBoundingClientRect().top + window.scrollY
    const into = target === 'intro' ? 0 : BEATS[target][0] + 0.03
    window.scrollTo({ top: top + into * (section.offsetHeight - window.innerHeight), behavior: 'smooth' })
  }

  const copy: Record<BeatName, ReactNode> = {
    intro: <IntroCopy entrance={!introPlayed} onHowItWorks={() => goTo('problem')} />,
    problem: <ProblemCopy />,
    scan: <ScanCopy progress={scrollYProgress} phaseRef={phaseRef} />,
    match: <MatchCopy />,
  }

  return (
    <section ref={sectionRef} aria-label="How vertiqal works" className="relative h-[520svh] bg-stage">
      <div ref={stageRef} className="sticky top-0 h-svh overflow-hidden">
        <div className="absolute inset-0" aria-hidden>
          <ShoeWall progress={scrollYProgress} active={onScreen} eventSource={stageRef} />
        </div>
        <motion.div className="absolute inset-0" style={{ opacity: scanOpacity }} aria-hidden>
          <StrideScan progress={scrollYProgress} phaseRef={phaseRef} />
        </motion.div>
        <div
          className="pointer-events-none absolute inset-0 bg-linear-to-t from-stage from-35% via-stage/80 to-transparent md:bg-linear-to-r md:from-25% md:via-stage/80 md:via-50% md:to-75%"
          aria-hidden
        />

        <TopBar />

        <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-end px-6 pb-14 md:justify-center md:px-10 md:pb-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={beat}
              className="flex max-w-xl flex-col gap-6"
              initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -16, filter: 'blur(6px)' }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              {copy[beat]}
            </motion.div>
          </AnimatePresence>
        </div>

        <BeatRail progress={scrollYProgress} beat={beat} onSelect={goTo} />

        <AnimatePresence>
          {beat === 'intro' && (
            <motion.p
              className="absolute bottom-8 left-1/2 z-20 hidden -translate-x-1/2 text-xs font-semibold uppercase tracking-[0.2em] text-stage-muted md:block"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 1.4, duration: 0.6 } }}
              exit={{ opacity: 0 }}
              aria-hidden
            >
              Scroll
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

/** Same story without scroll-driven motion, for people who ask their device to reduce motion. */
function StaticStory() {
  const progress = useMotionValue(BEATS.scan[0] + 0.2)
  const phaseRef = useRef<HTMLSpanElement>(null)
  const block = 'mx-auto flex max-w-6xl flex-col gap-10 px-6 py-20 md:flex-row md:items-center md:px-10'

  return (
    <section aria-label="How vertiqal works" className="relative bg-stage">
      <TopBar />
      <div className={cn(block, 'pt-32')}>
        <div className="flex max-w-xl flex-col gap-6">
          <IntroCopy entrance={false} />
        </div>
      </div>
      <div className={block}>
        <div className="flex max-w-xl flex-col gap-6">
          <ProblemCopy />
        </div>
      </div>
      <div className={block}>
        <div className="flex max-w-xl flex-col gap-6">
          <ScanCopy progress={progress} phaseRef={phaseRef} />
        </div>
        <div className="aspect-square w-full max-w-md" aria-hidden>
          <StrideScan progress={progress} phaseRef={phaseRef} framing="box" />
        </div>
      </div>
      <div className={cn(block, 'pb-28')}>
        <div className="flex max-w-xl flex-col gap-6">
          <MatchCopy />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- small local WebP, no optimisation needed */}
        <img src={HERO_SHOE} alt="" width={640} height={640} className="w-full max-w-md" />
      </div>
    </section>
  )
}

export function LandingStory() {
  const reduceMotion = useReducedMotion()
  return reduceMotion ? <StaticStory /> : <PinnedStory />
}
