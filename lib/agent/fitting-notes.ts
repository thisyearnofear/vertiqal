import { z } from 'zod'
import type { Sport } from '@/lib/metrics/readout'

export const WEAR_PATTERNS = [
  'outer heel',
  'centre heel',
  'forefoot',
  'inner edge',
  'outer edge',
  'even',
  'toe tip',
  'toe rand',
  'unclear',
] as const

export const visionFindingSchema = z.object({
  observations: z
    .array(
      z.object({
        title: z.string().describe('Two to four words, e.g. "Outer heel worn"'),
        detail: z.string().describe('One sentence pointing at what is visible in the image'),
      }),
    )
    .min(1)
    .max(4),
  wearPattern: z.enum(WEAR_PATTERNS).describe('Dominant wear area. For movement frames use "unclear".'),
  shoeImplication: z.string().describe('One sentence on what this means for the next shoe'),
  confidence: z.enum(['low', 'medium', 'high']),
})

export type VisionFinding = z.infer<typeof visionFindingSchema>
export type VisionKind = 'soles' | 'frames'

export const FOOT_WIDTHS = ['narrow', 'standard', 'wide'] as const
export type FootWidth = (typeof FOOT_WIDTHS)[number]

export interface FittingNotesState {
  goal: string
  surface: string
  width: FootWidth | ''
  niggles: string
  sole: VisionFinding | null
  frames: VisionFinding | null
}

export const EMPTY_NOTES: FittingNotesState = { goal: '', surface: '', width: '', niggles: '', sole: null, frames: null }

export const INTAKE_OPTIONS: Record<Sport, { goals: string[]; surfaces: string[]; surfaceLabel: string }> = {
  running: {
    goals: ['Easy miles', 'Race faster', 'First 10k', 'Marathon build', 'Back from a break'],
    surfaces: ['Road', 'Treadmill', 'Trail', 'Mixed'],
    surfaceLabel: 'Surface',
  },
  climbing: {
    goals: ['All-day comfort', 'Hard bouldering', 'Sport projects', 'Trad and multi-pitch', 'First pair'],
    surfaces: ['Indoor walls', 'Limestone', 'Grit and sandstone', 'Mixed'],
    surfaceLabel: 'Rock',
  },
}

const findingLine = (source: string, finding: VisionFinding) =>
  `${source} (Grok vision, ${finding.confidence} confidence): ${finding.observations.map((o) => o.title).join('; ')}. ${finding.shoeImplication}`

/** Flattens the notes into short lines the shopping agent can weigh. */
export function contextLines(notes: FittingNotesState, sport: Sport): string[] {
  const lines: string[] = []
  if (notes.goal) lines.push(`Goal: ${notes.goal}`)
  if (notes.surface) lines.push(`${INTAKE_OPTIONS[sport].surfaceLabel}: ${notes.surface}`)
  if (notes.width) lines.push(`Foot width: ${notes.width}`)
  if (notes.niggles.trim()) lines.push(`Niggles or past issues: ${notes.niggles.trim().slice(0, 160)}`)
  if (notes.sole) lines.push(findingLine(`Old ${sport === 'running' ? 'shoe sole' : 'shoe rubber'} photo`, notes.sole))
  if (notes.frames) lines.push(findingLine('Keyframes from my video', notes.frames))
  return lines
}
