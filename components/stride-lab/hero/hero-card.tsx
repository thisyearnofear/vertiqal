'use client'

import { useEffect, useId, useRef, useState } from 'react'
import useSWRMutation from 'swr/mutation'
import { Download, Footprints, Share2 } from 'lucide-react'
import type { HeroFrame } from '@/lib/hero/frame'
import type { Readout, Sport } from '@/lib/metrics/readout'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { readOverlayTheme } from '../draw-overlay'
import { CARD_HEIGHT, CARD_WIDTH, GRADES, renderCard, type Grade } from './render-card'

interface TryOnRequest {
  image: string
  shoe: string
  sport: Sport
}

interface TryOn {
  frameId: number
  shoe: string
  image: string
}

async function requestTryOn(url: string, { arg }: { arg: TryOnRequest }): Promise<{ image: string }> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(arg) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? 'Try-on failed')
  return body
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load frame'))
    image.src = src
  })
}

const LABEL = 'text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved'
const GRADE_LIST: Grade[] = ['film', 'mono', 'clean']
const shortName = (name: string) => name.split(' ').slice(0, 3).join(' ')

interface HeroCardProps {
  frame: HeroFrame | null
  readout: Readout
  sport: Sport
  picks: { name: string }[]
  themeKey: string
}

export function HeroCard({ frame, readout, sport, picks, themeKey }: HeroCardProps) {
  const id = useId()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [grade, setGrade] = useState<Grade>('film')
  const [pickIndex, setPickIndex] = useState(0)
  const [tryOn, setTryOn] = useState<TryOn | null>(null)
  const [showImpression, setShowImpression] = useState(true)
  const [drawn, setDrawn] = useState(false)
  const tryOnRun = useSWRMutation('/api/tryon', requestTryOn)

  const pick = picks[pickIndex] ?? picks[0] ?? null
  const impression = tryOn && frame && tryOn.frameId === frame.id && showImpression ? tryOn : null
  const metricsKey = readout.metrics.map((m) => `${m.id}:${m.value === null ? '-' : m.value.toFixed(1)}`).join('|')

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !frame) return
    let cancelled = false
    const theme = readOverlayTheme(canvas)
    Promise.all([loadImage(impression?.image ?? frame.dataUrl), document.fonts.load(`84px ${theme.font}`).catch(() => [])])
      .then(([photo]) => {
        if (cancelled) return
        renderCard(ctx, {
          photo,
          frame,
          grade,
          theme,
          metrics: readout.metrics,
          sport,
          pick: impression?.shoe ?? pick?.name ?? null,
          impression: Boolean(impression),
          date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(),
        })
        setDrawn(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // metricsKey stands in for readout.metrics so the card only redraws when a shown number changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, grade, impression, metricsKey, pick?.name, sport, themeKey])

  const toFile = () =>
    new Promise<File | null>((resolve) =>
      canvasRef.current?.toBlob((blob) => resolve(blob ? new File([blob], 'vertiqal-hero.png', { type: 'image/png' }) : null), 'image/png'),
    )

  const save = async () => {
    const file = await toFile()
    if (!file) return
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    URL.revokeObjectURL(url)
  }

  const share = async () => {
    const file = await toFile()
    if (!file) return
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'My vertiqal hero frame' }).catch(() => {})
    } else {
      await save()
    }
  }

  const seeYourself = async () => {
    if (!frame || !pick) return
    const result = await tryOnRun.trigger({ image: frame.dataUrl, shoe: pick.name, sport }).catch(() => null)
    if (result) {
      setTryOn({ frameId: frame.id, shoe: pick.name, image: result.image })
      setShowImpression(true)
    }
  }

  const hasTryOn = tryOn && frame && tryOn.frameId === frame.id

  return (
    <section aria-labelledby={`${id}-heading`} className="housing flex flex-col gap-6 rounded-2xl p-4 md:p-6">
      <div className="flex flex-col gap-1.5 px-1">
        <p className={cn(LABEL, 'flex items-center gap-2')}>
          <span className="led" data-state={frame ? 'on' : 'off'} aria-hidden />
          CH-4 · Hero frame
        </p>
        <h2 id={`${id}-heading`} className="text-balance text-xl font-semibold text-foreground">
          {sport === 'running' ? 'Your longest stride, graded' : 'Your highest reach, graded'}
        </h2>
        <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
          {`Forma keeps the frame where your ${sport === 'running' ? 'stride is longest' : 'reach is highest'} and grades it on your device with your own numbers. Nothing is uploaded unless you ask for a try-on.`}
        </p>
      </div>

      <div className="grid gap-8 px-1 md:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <div className="relative w-full">
          <canvas
            ref={canvasRef}
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            role="img"
            aria-label={
              frame
                ? `Hero frame of your ${sport === 'running' ? 'stride' : 'reach'}${impression ? `, AI impression wearing ${impression.shoe}` : ''}, with your measurements`
                : 'No hero frame yet'
            }
            className={cn('aspect-[4/5] w-full rounded-lg bg-stage', !(frame && drawn) && 'invisible')}
          />
          {!(frame && drawn) && (
            <div className="screen absolute inset-0 flex items-center justify-center p-6">
              <p className="text-balance text-center font-mono text-xl leading-snug opacity-80 phosphor">
                {'NO HERO FRAME YET · PLAY A CLIP OR GO LIVE'}
              </p>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span id={`${id}-grade`} className={LABEL}>
              Grade
            </span>
            <div role="group" aria-labelledby={`${id}-grade`} className="well flex w-fit gap-1 rounded-lg p-1">
              {GRADE_LIST.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={grade === value}
                  onClick={() => setGrade(value)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    grade === value ? 'housing text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {GRADES[value].label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button size="lg" className="px-4" disabled={!frame || !drawn} onClick={share}>
              <Share2 aria-hidden />
              Share
            </Button>
            <Button variant="outline" size="lg" className="px-4" disabled={!frame || !drawn} onClick={save}>
              <Download aria-hidden />
              Save PNG
            </Button>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <p className={LABEL}>See yourself in them</p>
            <p className="max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground">
              {picks.length > 0
                ? 'Puts a Forma pick on your feet in this frame. Sends this one still to FLUX Kontext through Vercel AI Gateway, takes about 10 seconds, and nothing is stored. The result is an impression, not a fit check.'
                : 'Once Forma has picked shoes, you can see them on your feet in this frame.'}
            </p>

            {picks.length > 1 && (
              <div role="group" aria-label="Shoe to try on" className="flex flex-wrap gap-2">
                {picks.map((p, i) => (
                  <button
                    key={p.name}
                    type="button"
                    aria-pressed={pickIndex === i}
                    onClick={() => setPickIndex(i)}
                    className={cn(
                      'well rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      pickIndex === i ? 'text-foreground ring-2 ring-primary' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {shortName(p.name)}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="lg"
                className="w-fit px-4"
                disabled={!frame || !pick || tryOnRun.isMutating}
                onClick={seeYourself}
              >
                <Footprints aria-hidden />
                {tryOnRun.isMutating ? 'Lacing up…' : pick ? `Try on ${shortName(pick.name)}` : 'See yourself in them'}
              </Button>
              {hasTryOn && (
                <div role="group" aria-label="Card photo" className="well flex gap-1 rounded-lg p-1">
                  {[
                    { value: false, label: 'Your shoes' },
                    { value: true, label: shortName(tryOn.shoe) },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={showImpression === option.value}
                      onClick={() => setShowImpression(option.value)}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        showImpression === option.value ? 'housing text-foreground' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {tryOnRun.error && (
              <p role="alert" className="text-sm leading-relaxed text-primary">
                {tryOnRun.error.message}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
