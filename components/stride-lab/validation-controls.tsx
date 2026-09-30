'use client'

import type { ValidationSource, ValidationStopReason } from '@/lib/pose/validation'
import { cn } from '@/lib/utils'

const LABEL = 'text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved'

interface ValidationControlsProps {
  status: 'idle' | 'recording' | 'ready'
  source: ValidationSource
  traceSource: ValidationSource | null
  onSource: (source: ValidationSource) => void
  canStart: boolean
  onStart: () => void
  onStop: () => void
  onExport: () => void
  stopReason: ValidationStopReason | null
  frameCount: number
  contactCount: number
}

const SOURCES: { value: ValidationSource; label: string }[] = [
  { value: 'unclassified', label: 'Unclassified' },
  { value: 'real-consented', label: 'Real footage (consent confirmed)' },
  { value: 'synthetic', label: 'Synthetic or debug' },
]

const STOP_NOTE: Record<ValidationStopReason, string> = {
  user: 'Stopped by you.',
  rewind: 'Stopped automatically when the clip looped or scrubbed back — the trace covers the first pass only.',
  limit: 'Stopped at the capture-size limit — this trace is truncated and cannot be scored.',
  'dimensions-changed': 'Stopped automatically when the video dimensions changed mid-clip.',
}

export function ValidationControls({ status, source, traceSource, onSource, canStart, onStart, onStop, onExport, stopReason, frameCount, contactCount }: ValidationControlsProps) {
  const recording = status === 'recording'
  const ready = status === 'ready'
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border px-4 py-4">
      <p className={LABEL}>Validation capture · running only</p>
      <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
        Saves keypoints and entered height in memory, not video. These can be identifying; keep exports private and use footage you have permission to assess.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex w-full min-w-0 flex-col items-start gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-foreground sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          {ready ? 'Next capture footage' : 'Footage'}
          <select
            value={source}
            disabled={recording}
            onChange={(e) => onSource(e.target.value as ValidationSource)}
            className="h-10 w-full min-w-0 rounded-md border border-border bg-transparent px-2 font-mono text-sm normal-case tracking-normal text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 sm:w-auto"
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {!recording ? (
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="min-h-11 rounded-md border border-primary/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
          >
            Record validation data locally
          </button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            className="min-h-11 rounded-md border border-primary/60 bg-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Stop and keep trace
          </button>
        )}
        {ready && (
          <button
            type="button"
            onClick={onExport}
            className="min-h-11 rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Export JSON
          </button>
        )}
      </div>
      <p role="status" className={cn('font-mono text-xs leading-snug', recording && 'phosphor')}>
        {recording && 'Recording frames in memory…'}
        {ready && `Trace ready · ${frameCount} frames · ${contactCount} contacts · ${SOURCES.find((s) => s.value === traceSource)?.label ?? traceSource}`}
      </p>
      {ready && stopReason && <p className="text-xs leading-relaxed text-muted-foreground">{STOP_NOTE[stopReason]}</p>}
    </div>
  )
}
