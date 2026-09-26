'use client'

import { useId, useState, type ReactNode } from 'react'
import useSWRMutation from 'swr/mutation'
import { ChevronDown, Eye, ImageUp } from 'lucide-react'
import { briefFromReadout, briefLine } from '@/lib/agent/brief'
import {
  FOOT_WIDTHS,
  INTAKE_OPTIONS,
  type FittingNotesState,
  type VisionFinding,
  type VisionKind,
} from '@/lib/agent/fitting-notes'
import type { Readout, Sport } from '@/lib/metrics/readout'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Keyframe } from './pose-stage'

interface VisionRequest {
  kind: VisionKind
  sport: Sport
  images: string[]
  measurements?: string
}

async function analyse(url: string, { arg }: { arg: VisionRequest }): Promise<VisionFinding> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(arg) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? 'Vision analysis failed')
  return body
}

const SOLE_MAX_EDGE = 1024

async function downscale(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, SOLE_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.8)
}

const LABEL = 'text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved'
const SELECT = 'well h-10 w-full rounded-md px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">{title}</h3>
      {children}
    </div>
  )
}

function Finding({ finding }: { finding: VisionFinding }) {
  return (
    <div className="screen flex flex-col gap-3 p-4 font-mono">
      <p className="text-lg uppercase leading-none opacity-70">{`> GROK VISION · ${finding.confidence} CONFIDENCE`}</p>
      <ul className="flex flex-col gap-2">
        {finding.observations.map((o) => (
          <li key={o.title} className="flex flex-col gap-0.5">
            <span className="text-xl uppercase leading-tight phosphor">{o.title}</span>
            <span className="font-sans text-sm leading-relaxed opacity-85">{o.detail}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-dashed border-stage-foreground/30 pt-2 font-sans text-sm leading-relaxed phosphor">
        {finding.shoeImplication}
      </p>
    </div>
  )
}

interface FittingNotesProps {
  sport: Sport
  readout: Readout
  keyframes: Keyframe[]
  value: FittingNotesState
  onChange: (next: FittingNotesState) => void
}

export function FittingNotes({ sport, readout, keyframes, value, onChange }: FittingNotesProps) {
  const id = useId()
  const options = INTAKE_OPTIONS[sport]
  const sole = useSWRMutation('/api/vision', analyse)
  const frames = useSWRMutation('/api/vision#frames', (_key: string, arg: { arg: VisionRequest }) => analyse('/api/vision', arg))
  const set = (patch: Partial<FittingNotesState>) => onChange({ ...value, ...patch })
  const [open, setOpen] = useState(false)

  const uploadSole = async (file: File) => {
    const image = await downscale(file)
    const finding = await sole.trigger({ kind: 'soles', sport, images: [image] }).catch(() => null)
    if (finding) set({ sole: finding })
  }

  const reviewFrames = async () => {
    const measurements = readout.events > 0 ? briefLine(briefFromReadout(readout)) : undefined
    const finding = await frames
      .trigger({ kind: 'frames', sport, images: keyframes.map((k) => k.dataUrl), measurements })
      .catch(() => null)
    if (finding) set({ frames: finding })
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="housing flex flex-col gap-6 rounded-2xl p-4 md:p-6">
      <div className="flex flex-col gap-4 px-1 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1.5">
          <p className={cn(LABEL, 'flex items-center gap-2')}>
            <span className="led" data-state={value.sole || value.frames ? 'on' : 'off'} aria-hidden />
            Sharpen the fit · optional
          </p>
          <h2 id={`${id}-heading`} className="text-balance text-xl font-semibold text-foreground">
            {'What the camera can’t measure'}
          </h2>
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            {open
              ? 'Add what you like, then press Re-shop above. Photos and stills are only sent to Grok when you press a button, and are not stored.'
              : 'Old injuries, terrain, a photo of your worn soles. Add them, then re-shop for a sharper shortlist.'}
          </p>
        </div>
        <Button
          variant="outline"
          size="lg"
          className="h-10 w-fit px-4"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Hide notes' : 'Add notes'}
          <ChevronDown aria-hidden className={cn('transition-transform', open && 'rotate-180')} />
        </Button>
      </div>

      <div id={`${id}-body`} hidden={!open} className="grid gap-8 px-1 md:grid-cols-3">
        <Column title="About you">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-goal`} className={LABEL}>
              Goal
            </label>
            <select id={`${id}-goal`} value={value.goal} onChange={(e) => set({ goal: e.target.value })} className={SELECT}>
              <option value="">Not sure yet</option>
              {options.goals.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-surface`} className={LABEL}>
              {options.surfaceLabel}
            </label>
            <select id={`${id}-surface`} value={value.surface} onChange={(e) => set({ surface: e.target.value })} className={SELECT}>
              <option value="">Any</option>
              {options.surfaces.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span id={`${id}-width`} className={LABEL}>
              Foot width
            </span>
            <div role="group" aria-labelledby={`${id}-width`} className="well flex gap-1 rounded-lg p-1">
              {FOOT_WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={value.width === w}
                  onClick={() => set({ width: value.width === w ? '' : w })}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    value.width === w ? 'housing text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-niggles`} className={LABEL}>
              Niggles
            </label>
            <input
              id={`${id}-niggles`}
              value={value.niggles}
              maxLength={160}
              placeholder={sport === 'running' ? 'e.g. sore shins after 10k' : 'e.g. bunion on left foot'}
              onChange={(e) => set({ niggles: e.target.value })}
              className={cn(SELECT, 'placeholder:text-muted-foreground')}
            />
          </div>
        </Column>

        <Column title={sport === 'running' ? 'Old shoe soles' : 'Old shoe rubber'}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {sport === 'running'
              ? 'Photograph the bottom of your current running shoes. Wear shows where you really land.'
              : 'Photograph the toe and rand of your current climbing shoes. Wear shows how you stand on holds.'}
          </p>
          <label
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'w-fit cursor-pointer px-4 focus-within:ring-3 focus-within:ring-ring/50',
              sole.isMutating && 'pointer-events-none opacity-60',
            )}
          >
            <ImageUp aria-hidden />
            {sole.isMutating ? 'Grok is looking…' : value.sole ? 'Replace photo' : 'Add sole photo'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={sole.isMutating}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void uploadSole(file)
                e.target.value = ''
              }}
            />
          </label>
          {sole.error && (
            <p role="alert" className="text-sm leading-relaxed text-primary">
              {sole.error.message}
            </p>
          )}
          {value.sole && <Finding finding={value.sole} />}
        </Column>

        <Column title="Frame review">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {`Forma grabs stills at key ${sport === 'running' ? 'footfalls' : 'placements'} while it watches. Grok can check what the numbers miss, like foot roll.`}
          </p>
          {keyframes.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2" aria-label="Captured keyframes">
              {keyframes.map((k) => (
                <li key={k.label} className="flex flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data URL */}
                  <img src={k.dataUrl} alt={`Still at ${k.label}`} className="aspect-video w-full rounded-md object-cover" />
                  <span className="font-mono text-base leading-none text-muted-foreground">{k.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="well rounded-md px-3 py-4 font-mono text-lg leading-snug text-muted-foreground">
              {'NO STILLS YET · PLAY A CLIP OR GO LIVE'}
            </p>
          )}
          <Button
            variant="outline"
            size="lg"
            className="w-fit px-4"
            disabled={keyframes.length === 0 || frames.isMutating}
            onClick={reviewFrames}
          >
            <Eye aria-hidden />
            {frames.isMutating ? 'Grok is looking…' : value.frames ? 'Review again' : 'Review with Grok'}
          </Button>
          {frames.error && (
            <p role="alert" className="text-sm leading-relaxed text-primary">
              {frames.error.message}
            </p>
          )}
          {value.frames && <Finding finding={value.frames} />}
        </Column>
      </div>
    </section>
  )
}
