'use client'

import { useMemo } from 'react'
import { Calendar, Film } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadFilmReminder } from '@/lib/fitting/reminder'
import type { HeroFrame } from '@/lib/hero/frame'
import type { Readout, Sport } from '@/lib/metrics/readout'
import type { BaselineReading } from '@/lib/hero/comparison'
import type { ShoePick } from '../agent/outputs'
import { CompareCard } from './compare-card'
import { HeroCard } from './hero-card'

export interface Baseline {
  readout: Readout
  clipName: string
  /** Hero frame photo URL for before/after comparison. */
  heroPhotoUrl: string
  /** Hero frame data for the before side of the comparison. */
  heroFrame: HeroFrame
  /** When the baseline was pinned (ISO). */
  capturedAt: string
}

interface TakeAwayProps {
  /** Hero card only renders once a pick is chosen and the stage shows take-aways. */
  showHero: boolean
  hero: HeroFrame | null
  baseline: Baseline | null
  panelReadout: Readout
  sport: Sport
  heroPicks: ShoePick[]
  themeKey: string
  /** Clears the hero so a fresh frame can be captured. */
  onFilmAgain: () => void
}

/** The personal artifacts after a fitting: hero card, film-again prompt, before/after compare. */
export function TakeAway({ showHero, hero, baseline, panelReadout, sport, heroPicks, themeKey, onFilmAgain }: TakeAwayProps) {
  const compareBaseline = useMemo<BaselineReading | null>(
    () =>
      baseline
        ? {
            sport,
            capturedAt: baseline.capturedAt,
            metrics: baseline.readout.metrics,
            standoutMetric: { value: '0', unit: '', label: '', description: '' },
            headline: '',
            frameId: baseline.heroFrame.id,
            photoUrl: baseline.heroPhotoUrl,
          }
        : null,
    [baseline, sport],
  )

  return (
    <>
      {showHero && hero && (
        <div id="hero-frame" className="scroll-mt-6">
          <HeroCard frame={hero} readout={panelReadout} sport={sport} picks={heroPicks} themeKey={themeKey} />
        </div>
      )}

      {/* Film-again prompt — shown after baseline is pinned, before re-film */}
      {baseline && hero && hero.id === baseline.heroFrame.id && (
        <div id="hero-film-again" className="scroll-mt-6">
          <div className="housing rounded-2xl p-4 md:p-6">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved flex items-center gap-2">
              <span className="led" data-state="on" aria-hidden /> Film again
            </p>
            <h2 className="mt-2 text-balance text-xl font-semibold text-foreground">See what changed</h2>
            <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
              {`You filmed on ${new Date(baseline.capturedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Film yourself again and Forma will compare your movement — side by side, before and after.`}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="outline" size="lg" className="gap-2" onClick={onFilmAgain}>
                <Film aria-hidden className="size-4" />
                Film again
              </Button>
              <Button variant="outline" size="lg" className="gap-2" onClick={() => downloadFilmReminder(sport)}>
                <Calendar aria-hidden className="size-4" />
                30-day reminder
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Baseline comparison — shown when there's a baseline AND a new hero frame */}
      {baseline && compareBaseline && hero && hero.id !== compareBaseline.frameId && (
        <div id="hero-compare" className="scroll-mt-6">
          <CompareCard beforeFrame={baseline.heroFrame} afterFrame={hero} beforeReadout={baseline.readout} afterReadout={panelReadout} baseline={compareBaseline} />
        </div>
      )}
    </>
  )
}
