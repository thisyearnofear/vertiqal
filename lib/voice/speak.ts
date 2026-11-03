/**
 * Client-side text-to-speech using the browser's built-in SpeechSynthesis.
 * Zero cost, no external API. Gracefully degrades when unavailable.
 */
export function speak(text: string, opts?: { rate?: number; pitch?: number; lang?: string }): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  const synth = window.speechSynthesis
  synth.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.rate = opts?.rate ?? 1.0
  utter.pitch = opts?.pitch ?? 1.0
  utter.lang = opts?.lang ?? 'en-GB'
  synth.speak(utter)
  return true
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

export function isSpeaking(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  return window.speechSynthesis.speaking
}
