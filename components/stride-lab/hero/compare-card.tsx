'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Download, Share2, Film, ChevronRight } from 'lucide-react'
import { downloadBlob } from '@/lib/downloads'
import type { HeroFrame } from '@/lib/hero/frame'
import type { Readout } from '@/lib/metrics/readout'
import type { BaselineReading } from '@/lib/hero/comparison'
import { compareReadings, type ComparisonResult } from '@/lib/hero/comparison'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { readOverlayTheme } from '../draw-overlay'
import { COMPARE_HEIGHT, COMPARE_WIDTH, COMPARE_GRADES, renderCompareCard, type CompareGrade } from './render-compare'

interface CompareCardProps {
  beforeFrame: HeroFrame | null
  afterFrame: HeroFrame | null
  beforeReadout: Readout
  afterReadout: Readout
  baseline: BaselineReading
}

export function CompareCard({ beforeFrame, afterFrame, beforeReadout, afterReadout, baseline }: CompareCardProps) {
  const id = useId()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [compareGrade, setCompareGrade] = useState<CompareGrade>('film')
  const [drawn, setDrawn] = useState(false)
  const [images, setImages] = useState<{ beforePhoto: HTMLImageElement | null; afterPhoto: HTMLImageElement | null }>({ beforePhoto: null, afterPhoto: null })
  const [loaded, setLoaded] = useState(false)
  const [comparison, setComparison] = useState<ComparisonResult | null>(null)

  // Load photos and compute comparison
  useEffect(() => {
    if (!beforeFrame || !afterFrame || loaded) return

    const loadImage = (src: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Could not load image'))
        img.src = src
      })

    Promise.all([
      loadImage(baseline.photoUrl).catch(() => null),
      loadImage(afterFrame.dataUrl).catch(() => null),
    ]).then(([bImg, aImg]) => {
      setImages({ beforePhoto: bImg, afterPhoto: aImg })
      setLoaded(true)

      // Compute comparison
      const comp = compareReadings(baseline, afterReadout.metrics)
      setComparison(comp)
    }).catch(() => {
      // If photos fail to load, still show the comparison with text
      const comp = compareReadings(baseline, afterReadout.metrics)
      setComparison(comp)
    })
  }, [beforeFrame, afterFrame, baseline, afterReadout.metrics, loaded])

  // Render the compare card
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !images.beforePhoto || !images.afterPhoto || !comparison) return

    let cancelled = false
    const theme = readOverlayTheme(canvas)
    Promise.all([document.fonts.load(`56px ${theme.font}`).catch(() => [])])
      .then(() => {
        if (cancelled) return
        renderCompareCard(ctx, {
          beforePhoto: images.beforePhoto!,
          afterPhoto: images.afterPhoto!,
          beforeFrame,
          afterFrame,
          beforeMetrics: beforeReadout.metrics,
          afterMetrics: afterReadout.metrics,
          comparison,
          grade: compareGrade,
          theme,
          dateBefore: new Date(baseline.capturedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          dateAfter: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        })
        setDrawn(true)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [images, comparison, compareGrade, beforeFrame, afterFrame, beforeReadout.metrics, afterReadout.metrics, baseline.capturedAt])

  const toFile = () =>
    new Promise<File | null>((resolve) =>
      canvasRef.current?.toBlob((blob) => resolve(blob ? new File([blob], 'forma-compare.png', { type: 'image/png' }) : null), 'image/png'),
    )

  const save = async () => {
    const file = await toFile()
    if (!file) return
    downloadBlob(file.name, file)
  }

  const share = async () => {
    const file = await toFile()
    if (!file) return
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'My Forma comparison',
        text: 'Forma compared my movement across sessions',
        url: 'https://vertiqal.vercel.app/?ref=compare',
      }).catch(() => {})
    } else {
      await save()
    }
  }

  const notReady = !images.beforePhoto || !images.afterPhoto || !comparison

  return (
    <section aria-labelledby={`${id}-heading`} className="housing flex flex-col gap-6 rounded-2xl p-4 md:p-6">
      <div className="flex flex-col gap-1.5 px-1">
        <p className={cn(LABEL, 'flex items-center gap-2')}>
          <span className="led" data-state={beforeFrame && afterFrame ? 'on' : 'off'} aria-hidden />
          CH-5 · Comparison
        </p>
        <h2 id={`${id}-heading`} className="text-balance text-xl font-semibold text-foreground">
          See what changed
        </h2>
        <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
          Film yourself again and Forma compares your movement to your original reading. One card shows before and after.
        </p>
      </div>

      <div className="grid gap-8 px-1 md:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        {/* ── COMPARE CARD ─────────────────────────────────────── */}
        <div className="relative w-full">
          <canvas
            ref={canvasRef}
            width={COMPARE_WIDTH}
            height={COMPARE_HEIGHT}
            role="img"
            aria-label={comparison ? `${comparison.headline} — before and after comparison` : 'Comparison loading…'}
            className={cn('aspect-square w-full rounded-lg bg-stage', (!drawn || notReady) && 'invisible')}
          />
          {(!drawn || notReady) && (
            <div className="screen absolute inset-0 flex items-center justify-center">
              {beforeFrame && afterFrame ? (
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-sm text-muted-foreground">Comparing your movement…</p>
                </div>
              ) : (
                <p className="text-balance text-center font-mono text-lg opacity-60 phosphor">
                  FILM AGAIN TO SEE THE COMPARISON
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── CONTROLS + DETAILS ───────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-6">
          {/* Grade toggle */}
          <div className="flex flex-col gap-2">
            <span className={LABEL}>Grade</span>
            <div role="group" className="well flex w-fit gap-1 rounded-lg p-1">
              {Object.keys(COMPARE_GRADES).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={compareGrade === value}
                  onClick={() => setCompareGrade(value as CompareGrade)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    compareGrade === value ? 'housing text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {COMPARE_GRADES[value as CompareGrade].label}
                </button>
              ))}
            </div>
          </div>

          {/* Share actions */}
          <div className="flex flex-wrap gap-3">
            <Button size="lg" className="px-4" disabled={!drawn || notReady} onClick={share}>
              <Share2 aria-hidden />
              Share
            </Button>
            <Button variant="outline" size="lg" className="px-4" disabled={!drawn || notReady} onClick={save}>
              <Download aria-hidden />
              Save PNG
            </Button>
          </div>

          {/* Comparison details */}
          {comparison && (
            <div className="flex flex-col gap-4 border-t border-border pt-5">
              {/* Headline */}
              <div className="border-l-2 border-primary pl-4 text-lg font-medium leading-relaxed text-foreground">
                {comparison.headline}
              </div>

              {/* Narrative */}
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                {comparison.narrative}
              </p>

              {/* Notable changes */}
              {comparison.notableChanges.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className={LABEL}>What changed</p>
                  {comparison.notableChanges.slice(0, 3).map((change, i) => (
                    <div key={i} className="well rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{change.label}</span>
                        <span className={cn(
                          'font-mono text-sm',
                          change.description === 'Increased' ? 'text-emerald-600' : 'text-amber-600',
                        )}>
                          {change.before}{change.unit} → {change.after}{change.unit}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {change.delta > 0 ? '+' : ''}{change.delta}{change.unit} ({change.description})
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Film again CTA */}
          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <Button variant="outline" size="lg" className="w-full gap-2">
              <Film aria-hidden />
              Film again
              <ChevronRight aria-hidden className="size-4" />
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Film yourself again and Forma will compare your movement to your original reading.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

const LABEL = 'text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved'
