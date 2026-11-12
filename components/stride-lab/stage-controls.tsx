'use client'

import { Box, Camera, Pause, Play, RotateCcw, Sparkles, Square, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface StageControlsProps {
  /** Stage 'invite' labels the first-run copy differently. */
  invite: boolean
  onUpload: () => void
  /** Live capture in progress swaps the film button for stop. */
  liveActive: boolean
  onStopLive: () => void
  filmLabel: string
  filmDisabled: boolean
  filmTitle: string | undefined
  onFilm: () => void
  hasClip: boolean
  playing: boolean
  onTogglePlay: () => void
  onRestart: () => void
  /** Voice coaching only makes sense while there is footage to coach. */
  showVoice: boolean
  voiceOn: boolean
  onToggleVoice: () => void
  twinOn: boolean
  onToggleTwin: () => void
  /** The sample clears the current clip, so the button arms first when measurements exist. */
  showSample: boolean
  sampleArmed: boolean
  onSample: () => void
  /** Invite-stage shortcut: canned measurements sent to the real agent. */
  showDemo: boolean
  onDemo: () => void
}

/** The transport row under the stage: upload, film, play, restart, voice, twin, sample. */
export function StageControls({
  invite,
  onUpload,
  liveActive,
  onStopLive,
  filmLabel,
  filmDisabled,
  filmTitle,
  onFilm,
  hasClip,
  playing,
  onTogglePlay,
  onRestart,
  showVoice,
  voiceOn,
  onToggleVoice,
  twinOn,
  onToggleTwin,
  showSample,
  sampleArmed,
  onSample,
  showDemo,
  onDemo,
}: StageControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="lg" className="h-10 whitespace-nowrap px-3" onClick={onUpload}>
        <Upload aria-hidden />
        {invite ? 'Upload a clip' : 'Another clip'}
      </Button>
      {liveActive ? (
        <Button variant="outline" size="lg" className="h-10 whitespace-nowrap px-3" onClick={onStopLive}>
          <Square aria-hidden />
          Stop capture
        </Button>
      ) : (
        <Button variant="outline" size="lg" className="h-10 whitespace-nowrap px-3" onClick={onFilm} disabled={filmDisabled} title={filmTitle}>
          <Camera aria-hidden />
          {filmLabel}
        </Button>
      )}
      {hasClip && (
        <>
          <Button variant="outline" size="icon-lg" onClick={onTogglePlay} aria-label={playing ? 'Pause (Space)' : 'Play (Space)'}>
            {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
          </Button>
          <Button variant="outline" size="icon-lg" onClick={onRestart} aria-label="Restart analysis (R)">
            <RotateCcw aria-hidden />
          </Button>
        </>
      )}
      {showVoice && (
        <button
          type="button"
          role="switch"
          aria-checked={voiceOn}
          onClick={onToggleVoice}
          className="well flex h-10 items-center gap-2 rounded-md px-3 text-xs font-semibold uppercase tracking-[0.18em] text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="led" data-state={voiceOn ? 'on' : 'off'} aria-hidden />
          Voice
          <span className="sr-only">{': Forma speaks coaching cues aloud'}</span>
        </button>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={twinOn}
        onClick={onToggleTwin}
        className="well flex h-10 items-center gap-2 rounded-md px-3 text-xs font-semibold uppercase tracking-[0.18em] text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="led" data-state={twinOn ? 'on' : 'off'} aria-hidden />
        <Box className="size-3.5" aria-hidden />
        3D Twin
      </button>
      {showSample && (
        <Button
          variant="ghost"
          size="lg"
          className={cn(
            'h-10 whitespace-nowrap px-3 font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground',
            sampleArmed && 'text-primary hover:text-primary',
          )}
          title="Watch the illustrated sample fitting. This clears the current clip."
          onClick={onSample}
        >
          <Play aria-hidden />
          {sampleArmed ? 'Clears this clip — sure?' : 'Sample fitting'}
        </Button>
      )}
      {showDemo && (
        <Button
          variant="ghost"
          size="lg"
          className="h-10 whitespace-nowrap px-3 font-semibold uppercase tracking-wider text-primary hover:text-primary"
          title="Sends the example measurements to the real agent — real picks, no camera needed."
          onClick={onDemo}
        >
          <Sparkles aria-hidden />
          Demo fitting
        </Button>
      )}
    </div>
  )
}
