import { SAMPLE_BRIEFS } from '../agent/brief.ts'
import type { Sport } from '../metrics/readout'

export interface RationaleRow {
  attribute: string
  target: string
  evidence: string
}

export interface ExampleStep {
  title: string
  body: string
}

export interface ExampleScript {
  steps: [ExampleStep, ExampleStep, ExampleStep]
  rationale: RationaleRow[]
  alternatives: [string, string]
  alternativesNote: string
}

export const EXAMPLE_STEP_COUNT = 3
export const EXAMPLE_STEP_MS = 5200

export function stepTitle(sport: Sport, step: number): string {
  return EXAMPLE_SCRIPTS[sport].steps[step].title
}

export function nextStep(current: number, direction: 1 | -1): number {
  return Math.min(EXAMPLE_STEP_COUNT - 1, Math.max(0, current + direction))
}

export const EXAMPLE_SCRIPTS: Record<Sport, ExampleScript> = {
  running: {
    steps: [
      { title: 'Observe movement', body: '' },
      {
        title: 'Confirm the brief',
        body: 'Movement is only one input. Add your goal, surface, size, budget and comfort needs before searching.',
      },
      {
        title: 'Compare a starting point',
        body: 'An everyday running shoe with cushioning is one option to research alongside your preferences. This is an illustrative direction, not a verified product recommendation.',
      },
    ],
    rationale: [
      {
        attribute: 'Movement observation',
        target: 'Landing ahead of hips in this synthetic example',
        evidence: 'Illustrative overstride: 14cm.',
      },
      {
        attribute: 'What still needs confirming',
        target: 'Goal, surface and comfort',
        evidence: 'A movement clip cannot establish your shoe size or foot width.',
      },
    ],
    alternatives: ['Prioritise comfort', 'Explore another feel'],
    alternativesNote: 'Your preferences and sourced product evidence decide the shortlist.',
  },
  climbing: {
    steps: [
      { title: 'Observe movement', body: '' },
      {
        title: 'Confirm the brief',
        body: 'Movement is only one input. Add your goal, surface, size, budget and comfort needs before searching.',
      },
      {
        title: 'Compare a starting point',
        body: 'A supportive climbing shoe is one option to research for edging. Comfort, foot shape and the terrain still need checking. This is an illustrative direction, not a verified product recommendation.',
      },
    ],
    rationale: [
      {
        attribute: 'Movement observation',
        target: 'Foot readjustments in this synthetic example',
        evidence: 'Illustrative quiet feet: 61%.',
      },
      {
        attribute: 'What still needs confirming',
        target: 'Terrain, foot shape and comfort',
        evidence: 'A movement clip cannot establish your shoe size or foot width.',
      },
    ],
    alternatives: ['Prioritise comfort', 'Explore another feel'],
    alternativesNote: 'Your preferences and sourced product evidence decide the shortlist.',
  },
}

export function exampleMetrics(sport: Sport) {
  return SAMPLE_BRIEFS[sport].metrics
}
