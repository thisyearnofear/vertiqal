'use client'

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { settleStream } from '@/lib/fitting/camera'

export type LivePhase = 'off' | 'starting' | 'countdown' | 'recording' | 'done' | 'error'

export interface LiveCamera {
  phase: LivePhase
  stream: MediaStream | null
  secondsLeft: number
  error: string | null
  start: (captureSeconds: number) => void
  stop: () => void
  clear: () => void
}

const COUNTDOWN_SECONDS = 3

/**
 * Camera capture for live analysis: a short countdown to get into frame, then a fixed
 * recording window. Frames stay in the browser; only the pose model sees them.
 */
export function useLiveCamera(onRecordingStart: () => void): LiveCamera {
  const [phase, setPhase] = useState<LivePhase>('off')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const captureSecondsRef = useRef(20)
  const streamRef = useRef<MediaStream | null>(null)
  const generation = useRef(0)
  const beginRecording = useEffectEvent(onRecordingStart)

  const attach = useCallback((next: MediaStream | null) => {
    streamRef.current = next
    setStream(next)
  }, [])

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
  }, [])

  const stop = useCallback(() => {
    generation.current += 1
    release()
    setPhase((current) => (current === 'recording' ? 'done' : 'off'))
  }, [release])

  const clear = useCallback(() => {
    generation.current += 1
    release()
    setError(null)
    setPhase('off')
  }, [release])

  const start = useCallback(
    (captureSeconds: number) => {
      captureSecondsRef.current = captureSeconds
      setError(null)
      release()
      const mine = ++generation.current
      let pending: Promise<MediaStream>
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera capture is not available in this browser')
        pending = navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: false,
        })
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Camera capture failed')
        setPhase('error')
        return
      }
      setPhase('starting')
      settleStream(pending, () => generation.current !== mine)
        .then((next) => {
          if (!next) return
          attach(next)
          setSecondsLeft(COUNTDOWN_SECONDS)
          setPhase('countdown')
        })
        .catch((reason: Error) => {
          if (generation.current !== mine) return
          setError(reason.name === 'NotAllowedError' ? 'Camera permission was denied' : reason.message)
          setPhase('error')
        })
    },
    [attach, release],
  )

  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'recording') return
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => s - 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (secondsLeft > 0) return
    if (phase === 'countdown') {
      beginRecording()
      setSecondsLeft(captureSecondsRef.current)
      setPhase('recording')
    } else if (phase === 'recording') {
      stop()
    }
  }, [secondsLeft, phase, stop])

  useEffect(
    () => () => {
      generation.current += 1
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    },
    [],
  )

  return { phase, stream, secondsLeft, error, start, stop, clear }
}
