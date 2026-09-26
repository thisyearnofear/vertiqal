'use client'

import { useCallback, useState } from 'react'
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
  const chat = useChat<GearAgentUIMessage>({ transport })
  const { sendMessage, setMessages, stop } = chat

  const send = useCallback(
    (brief: MovementBrief, nextPrefs: ShopperPrefs) => {
      setSentBrief(brief)
      setPrefs(nextPrefs)
      setMessages([])
      void sendMessage({ text: briefToPrompt(brief, nextPrefs) })
    },
    [sendMessage, setMessages],
  )

  const reset = useCallback(() => {
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
