'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { GearAgentUIMessage } from '@/lib/agent/gear-agent'
import { briefToPrompt, type MovementBrief, type ShopperPrefs } from '@/lib/agent/brief'
import type { Mood } from '@/lib/persona'

const transport = new DefaultChatTransport<GearAgentUIMessage>({ api: '/api/agent' })

/** Forma's face follows the agent's latest meaningful step. */
function moodOf(messages: GearAgentUIMessage[], status: string, hasError: boolean): Mood | null {
  if (hasError) return 'sad'
  const parts = messages.flatMap((m) => (m.role === 'assistant' ? m.parts : []))
  if (parts.some((p) => p.type === 'tool-recommendProducts' && p.state === 'output-available')) {
    return status === 'ready' ? 'asking' : 'pleased'
  }
  if (
    parts.some((p) =>
      ['tool-checkEvidence', 'tool-searchProducts', 'tool-checkCommunity', 'tool-checkAthletes'].includes(p.type),
    )
  )
    return 'searching'
  if (status === 'submitted' || status === 'streaming') return 'thinking'
  return null
}

export function useGearAgent() {
  const [sentBrief, setSentBrief] = useState<MovementBrief | null>(null)
  const [prefs, setPrefs] = useState<ShopperPrefs | null>(null)
  const retriedRef = useRef(false)
  const chat = useChat<GearAgentUIMessage>({ transport })
  const { sendMessage, setMessages, stop } = chat

  const send = useCallback(
    (brief: MovementBrief, nextPrefs: ShopperPrefs) => {
      retriedRef.current = false
      setSentBrief(brief)
      setPrefs(nextPrefs)
      setMessages([])
      void sendMessage({ text: briefToPrompt(brief, nextPrefs) }, { body: { brief, prefs: nextPrefs } })
    },
    [sendMessage, setMessages],
  )

  // Open-weight models occasionally end the run in prose with no shortlist (cost logs show these
  // as agent_run with zero recommendProducts calls, or a rejected shortlist followed by text).
  // The route rebuilds the prompt from the body on every POST, so a fresh retry is safe; do it
  // once, silently, before surfacing an empty result.
  useEffect(() => {
    if (chat.status !== 'ready' || chat.error || !sentBrief || !prefs || retriedRef.current) return
    const hasPicks = chat.messages.some(
      (m) =>
        m.role === 'assistant' &&
        m.parts.some((p) => {
          if (p.type !== 'tool-recommendProducts' || p.state !== 'output-available') return false
          const output = p.output as { picks?: unknown[] } | undefined
          return Array.isArray(output?.picks) && output.picks.length > 0
        }),
    )
    if (hasPicks) return
    retriedRef.current = true
    setMessages([])
    void sendMessage({ text: briefToPrompt(sentBrief, prefs) }, { body: { brief: sentBrief, prefs } })
  }, [chat.status, chat.messages, chat.error, sentBrief, prefs, sendMessage, setMessages])

  const reset = useCallback(() => {
    retriedRef.current = false
    void stop()
    setMessages([])
    setSentBrief(null)
    setPrefs(null)
  }, [stop, setMessages])

  return {
    ...chat,
    sentBrief,
    prefs,
    send,
    reset,
    busy: chat.status === 'submitted' || chat.status === 'streaming',
    mood: sentBrief ? moodOf(chat.messages, chat.status, Boolean(chat.error)) : null,
  }
}

export type GearAgent = ReturnType<typeof useGearAgent>
