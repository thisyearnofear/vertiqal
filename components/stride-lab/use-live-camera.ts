'use client'

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'

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
  const beginRecording = useEffectEvent(onRecordingStart)

  const release = useCallback((current: MediaStream | null) => {
    current?.getTracks().forEach((track) => track.stop())
  }, [])

  const stop = useCallback(() => {
    setStream((current) => {
      release(current)
      return null
    })
    setPhase((current) => (current === 'recording' ? 'done' : 'off'))
  }, [release])

  const clear = useCallback(() => {
    setStream((current) => {
      release(current)
      return null
    })
    setPhase('off')
  }, [release])

  const start = useCallback((captureSeconds: number) => {
    captureSecondsRef.current = captureSeconds
    setError(null)
    setPhase('starting')
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false })
      .then((next) => {
        setStream(next)
        setSecondsLeft(COUNTDOWN_SECONDS)
        setPhase('countdown')
      })
      .catch((reason: Error) => {
        setError(reason.name === 'NotAllowedError' ? 'Camera permission was denied' : reason.message)
        setPhase('error')
      })
  }, [])

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

  useEffect(() => () => release(stream), [stream, release])

  return { phase, stream, secondsLeft, error, start, stop, clear }
}
