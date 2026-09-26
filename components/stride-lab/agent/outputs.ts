import type { GearAgentUIMessage } from '@/lib/agent/gear-agent'

export function outputsOf(messages: GearAgentUIMessage[]) {
  const parts = messages.flatMap((m) => (m.role === 'assistant' ? m.parts : []))
  const profile = parts.find((p) => p.type === 'tool-buildGearProfile' && p.state === 'output-available')
  const shortlist = parts.find((p) => p.type === 'tool-recommendProducts' && p.state === 'output-available')
  if (profile?.type !== 'tool-buildGearProfile' || profile.state !== 'output-available') return null
  if (shortlist?.type !== 'tool-recommendProducts' || shortlist.state !== 'output-available') return null
  return { profile: profile.output, picks: shortlist.output.picks }
}

export type AgentOutputs = NonNullable<ReturnType<typeof outputsOf>>
