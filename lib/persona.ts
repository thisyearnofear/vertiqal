import { z } from 'zod'
import { SPORTS, type Sport } from './metrics/readout.ts'

export const SHAPES = ['pebble', 'orb', 'visor', 'crag'] as const
export const PHOSPHORS = ['amber', 'green', 'ice'] as const
export const VOICES = ['coach', 'lab', 'hype'] as const

export const personaSchema = z.object({
  shape: z.enum(SHAPES),
  phosphor: z.enum(PHOSPHORS),
  voice: z.enum(VOICES),
})

export type Persona = z.infer<typeof personaSchema>
export type Shape = Persona['shape']
export type Phosphor = Persona['phosphor']
export type Voice = Persona['voice']

export const DEFAULT_PERSONA: Persona = { shape: 'pebble', phosphor: 'amber', voice: 'coach' }
export const PERSONA_COOKIE = 'vertiqal-persona'

export function parsePersona(raw: string | undefined): Persona {
  if (!raw) return DEFAULT_PERSONA
  try {
    return personaSchema.parse(JSON.parse(raw))
  } catch {
    return DEFAULT_PERSONA
  }
}

/** Screen tints. Only the CRT phosphor changes, so the palette stays at five colours. */
export const PHOSPHOR_COLOR: Record<Phosphor, string> = {
  amber: 'oklch(0.8 0.15 62)',
  green: 'oklch(0.84 0.17 145)',
  ice: 'oklch(0.85 0.1 220)',
}

export const SHAPE_LABEL: Record<Shape, string> = {
  pebble: 'Pebble',
  orb: 'Orb',
  visor: 'Visor',
  crag: 'Crag',
}

export type Mood =
  | 'asleep'
  | 'watching'
  | 'ready'
  | 'thinking'
  | 'searching'
  | 'pleased'
  | 'asking'
  | 'working'
  | 'sad'

type Lines = Record<Mood, (ctx: { events: string; gear: string }) => string>

export const VOICE_PROFILE: Record<Voice, { label: string; tagline: string; prompt: string; lines: Lines }> = {
  coach: {
    label: 'Coach',
    tagline: 'Warm, direct, gets you moving',
    prompt: 'a warm, direct coach: short encouraging sentences, second person, no fluff',
    lines: {
      asleep: () => 'Load a clip and I will take it from there.',
      watching: ({ events }) => `Watching your ${events}. Keep it rolling.`,
      ready: () => 'Got enough data. Ready when you are.',
      thinking: ({ gear }) => `Working out the ${gear} you actually need.`,
      searching: () => 'Checking what is in stock right now.',
      pleased: () => 'Three solid options. Top one is the pick.',
      asking: () => 'Your call: shall I fill the basket?',
      working: () => 'On the retailer site now, checking your size.',
      sad: () => 'Hit a snag. Try again or pick another option.',
    },
  },
  lab: {
    label: 'Lab tech',
    tagline: 'Numbers first, dry wit',
    prompt: 'a precise lab technician: lead with the numbers, clipped sentences, a touch of dry wit',
    lines: {
      asleep: () => 'Awaiting specimen. Any clip will do.',
      watching: ({ events }) => `Sampling ${events}. Variance acceptable.`,
      ready: () => 'Sample size sufficient. Awaiting go.',
      thinking: ({ gear }) => `Mapping measurements to ${gear} specs.`,
      searching: () => 'Querying live inventory.',
      pleased: () => 'Shortlist compiled. Confidence: high.',
      asking: () => 'Authorisation required before I touch a basket.',
      working: () => 'Browser agent deployed. Observing.',
      sad: () => 'Anomaly logged. Recommend retry.',
    },
  },
  hype: {
    label: 'Hype buddy',
    tagline: 'Big energy, still honest',
    prompt: 'an upbeat hype buddy: energetic and fun, at most one exclamation mark per message, still honest about the data',
    lines: {
      asleep: () => 'Wake me up with a clip, let us go.',
      watching: ({ events }) => `Ooh, clocking those ${events}.`,
      ready: () => 'That is plenty. Let us go shopping!',
      thinking: ({ gear }) => `Cooking up your perfect ${gear}.`,
      searching: () => 'Raiding the shops for you.',
      pleased: () => 'Found your match. Look at that top pick.',
      asking: () => 'Say the word and I will grab it.',
      working: () => 'In the store, hunting your size.',
      sad: () => 'Ugh, a hiccup. Shake it off and retry.',
    },
  },
}

export function speechFor(voice: Voice, mood: Mood, sport: Sport) {
  return VOICE_PROFILE[voice].lines[mood]({ events: SPORTS[sport].events, gear: SPORTS[sport].gear })
}

/** What Forma says the moment measurements lock: the runner's own number, not a generic line. */
export function lockedLine(voice: Voice, metrics: { id: string; label: string; unit: string; value: number | null }[]) {
  const lead = metrics.find((m) => m.value !== null)
  if (!lead || lead.value === null) return null
  const value = Math.round(lead.value)
  const fact = lead.id === 'cadence' ? `${value} steps a minute` : `${lead.label.toLowerCase()} ${value} ${lead.unit}`
  const lines: Record<Voice, string> = {
    coach: `Got you. ${fact}.`,
    lab: `Locked. ${fact.charAt(0).toUpperCase()}${fact.slice(1)}.`,
    hype: `Got you! ${fact}!`,
  }
  return lines[voice]
}
