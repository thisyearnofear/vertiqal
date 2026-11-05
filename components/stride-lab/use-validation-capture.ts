'use client'

import { useCallback, useEffect, useState, type RefObject } from 'react'
import { downloadBlob } from '@/lib/downloads'
import type { MovementSnapshot, Sport } from '@/lib/metrics/readout'
import type { Pose } from '@/lib/pose/types'
import { createValidationRecorder, type ValidationCapture, type ValidationSource } from '@/lib/pose/validation'
import type { LivePhase } from './use-live-camera'

export type CaptureStatus = 'idle' | 'recording' | 'ready'

interface ValidationCaptureOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  /** All conditions outside the recorder itself (sport, engine, clip/live, provider match, height match). */
  canStart: boolean
  providerId: string
  enteredHeight: number | null
  sport: Sport
  /** A user clip is loaded — live-only otherwise. */
  hasClip: boolean
  livePhase: LivePhase
  /** Resumes the uploaded clip so recording keeps receiving frames. */
  resumePlayback: () => void
}

/**
 * Local validation recorder: captures raw pose frames for offline analysis.
 * Owns the recorder lifecycle — start/stop/export — and auto-stops when a live
 * capture ends.
 */
export function useValidationCapture({
  videoRef,
  canStart,
  providerId,
  enteredHeight,
  sport,
  hasClip,
  livePhase,
  resumePlayback,
}: ValidationCaptureOptions) {
  const [recorder, setRecorder] = useState<ReturnType<typeof createValidationRecorder> | null>(null)
  const [status, setStatus] = useState<CaptureStatus>('idle')
  const [trace, setTrace] = useState<ValidationCapture | null>(null)
  const [source, setSource] = useState<ValidationSource>('unclassified')

  // A trace belongs to one input set — provider, height, sport and clip identity
  // changing underfoot means the recorder's baked-in parameters are stale, so it
  // resets during render instead of in the callers' reset paths.
  const inputsKey = `${providerId}:${enteredHeight ?? 'none'}:${sport}:${hasClip}`
  const [prevInputsKey, setPrevInputsKey] = useState(inputsKey)
  if (inputsKey !== prevInputsKey) {
    setPrevInputsKey(inputsKey)
    setRecorder(null)
    setTrace(null)
    setStatus('idle')
  }

  const clear = useCallback(() => {
    setRecorder(null)
    setTrace(null)
    setStatus('idle')
  }, [])

  const stop = useCallback(() => {
    if (!recorder) return
    const finished = recorder.finish()
    setRecorder(null)
    setTrace(finished)
    setStatus(finished ? 'ready' : 'idle')
  }, [recorder])

  const start = useCallback(() => {
    if (!canStart || status === 'recording') return
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    setRecorder(createValidationRecorder({
      captureId: crypto.randomUUID(),
      sourceKind: source,
      providerId,
      heightCm: enteredHeight,
    }))
    setTrace(null)
    setStatus('recording')
    if (hasClip && video.paused) resumePlayback()
  }, [canStart, status, videoRef, source, providerId, enteredHeight, hasClip, resumePlayback])

  const onFrame = useCallback(
    (frame: { timeSec: number; pose: Pose | null; width: number; height: number; snapshot: MovementSnapshot }) => {
      if (!recorder || frame.snapshot.sport !== 'running') return
      recorder.record(frame.timeSec, frame.pose, frame.width, frame.height, frame.snapshot)
      if (recorder.stopReason) {
        const finished = recorder.finish()
        setRecorder(null)
        setTrace(finished)
        setStatus(finished ? 'ready' : 'idle')
      }
    },
    [recorder],
  )

  const exportTrace = useCallback(() => {
    if (!trace) return
    downloadBlob(
      `forma-running-validation-${trace.captureId.slice(0, 8)}.json`,
      new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' }),
    )
  }, [trace])

  // Live captures are never saved — stop recording the moment the camera phase ends.
  // Deferred to a frame callback so the state update isn't a synchronous effect setState.
  useEffect(() => {
    if (hasClip || status !== 'recording' || !['done', 'error', 'off'].includes(livePhase)) return
    const id = requestAnimationFrame(stop)
    return () => cancelAnimationFrame(id)
  }, [livePhase, status, hasClip, stop])

  return { status, trace, source, setSource, onFrame, start, stop, clear, exportTrace }
}
