'use client'

import { useCallback, useEffect, useRef } from 'react'

const audioCache = new Map<string, Promise<string>>()

function synthesize(text: string) {
  let pending = audioCache.get(text)
  if (!pending) {
    pending = fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then(async (response) => {
      if (!response.ok) throw new Error('Speech unavailable')
      return URL.createObjectURL(await response.blob())
    })
    pending.catch(() => audioCache.delete(text))
    audioCache.set(text, pending)
  }
  return pending
}

function speakLocally(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
}

/**
 * Speaks short lines with Grok TTS through the AI Gateway, falling back to the browser voice.
 * Lines arriving while Forma is mid-sentence are dropped, so cues never pile up.
 */
export function useVoice(enabled: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speakingRef = useRef(false)

  useEffect(() => {
    if (enabled) return
    audioRef.current?.pause()
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    speakingRef.current = false
  }, [enabled])

  return useCallback(
    async (text: string) => {
      if (!enabled || speakingRef.current) return
      speakingRef.current = true
      try {
        const url = await synthesize(text)
        const audio = audioRef.current ?? new Audio()
        audioRef.current = audio
        audio.src = url
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve()
          audio.onerror = () => reject(new Error('Playback failed'))
          audio.play().catch(reject)
        })
      } catch {
        speakLocally(text)
      } finally {
        speakingRef.current = false
      }
    },
    [enabled],
  )
}
