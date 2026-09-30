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

export interface ExampleConcept {
  label: string
  tradeoff: string
}

export interface ExampleBrief {
  goal: string
  surface: string
  size: string
  budget: string
  height: string
}

export interface ExampleScript {
  steps: readonly [ExampleStep, ExampleStep, ExampleStep, ExampleStep, ExampleStep, ExampleStep]
  brief: ExampleBrief
  rationale: RationaleRow[]
  concepts: readonly [ExampleConcept, ExampleConcept, ExampleConcept]
  conceptsNote: string
}

export const EXAMPLE_STEP_COUNT = 6
export const EXAMPLE_STEP_MS = 5200

export const EXAMPLE_COMPANIONS = [
  'Here is the whole fitting journey. Nothing is being uploaded.',
  'The footage is archival; these measurements are illustrative.',
  'Movement cannot tell me your size, budget or preferences.',
  'A fitting should explain the choice and its trade-offs.',
  'A receipt shows what was checked—not a guarantee of stock.',
  'Ready to make this about your movement?',
] as const

export const EXAMPLE_MOODS = ['watching', 'watching', 'asking', 'thinking', 'working', 'pleased'] as const

export function exampleCompanion(sport: Sport, step: number): string {
  if (sport === 'climbing' && step === 1) return 'The movement and measurements are illustrative.'
  return EXAMPLE_COMPANIONS[step] ?? EXAMPLE_COMPANIONS[0]
}

export const EXAMPLE_FOOTAGE = {
  src: '/examples/archival-runner.mp4',
  credit: 'Orientation to Physical Efficiency Battery (1986), Federal Law Enforcement Training Center',
  sourceUrl:
    'https://www.movingimagearchive.com/sources/orientation-to-physical-efficiency-battery-a4d3e5b5?clip=e9224f58-34ac-5ab8-9f9c-e5d5baed3804',
  originalUrl: 'https://archive.org/details/gov.ntis.ava18914vnb1',
  rights: 'Labelled public domain by the Internet Archive source and the Moving Image Archive',
  range: '7:55–7:58',
  heightKnown: false,
} as const

export function stepTitle(sport: Sport, step: number): string {
  return EXAMPLE_SCRIPTS[sport].steps[step].title
}

export function nextStep(current: number, direction: 1 | -1): number {
  return Math.min(EXAMPLE_STEP_COUNT - 1, Math.max(0, current + direction))
}

const SHARED_STEPS = {
  brief: {
    title: 'Confirm the brief',
    body: 'Movement is only one input. Add your goal, surface, size, budget and comfort needs before searching.',
  } satisfies ExampleStep,
  evidence: {
    title: 'Inspect the evidence',
    body: 'A real check lists the submitted size, the page it observed and a receipt. This template has not been run.',
  } satisfies ExampleStep,
  yours: {
    title: 'Make it my fitting',
    body: 'Upload a clip or record live. The example stays synthetic; only your own footage produces measurements.',
  } satisfies ExampleStep,
}

export const EXAMPLE_SCRIPTS: Record<Sport, ExampleScript> = {
  running: {
    steps: [
      { title: 'Load the example', body: 'Archival footage, loaded locally — nothing is uploaded or analysed.' },
      { title: 'Observe movement', body: '' },
      SHARED_STEPS.brief,
      {
        title: 'Compare directions',
        body: 'An everyday running shoe with cushioning is one option to research alongside your preferences. This is an illustrative direction, not a verified product recommendation.',
      },
      SHARED_STEPS.evidence,
      SHARED_STEPS.yours,
    ],
    brief: { goal: 'Easy miles', surface: 'Road', size: 'UK 9', budget: '£160', height: 'Unknown — the archival runner’s height was not recorded' },
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
    concepts: [
      { label: 'Everyday comfort', tradeoff: 'Softer underfoot for easy miles; trades a little ground feel and pace sharpness.' },
      { label: 'Lighter feel', tradeoff: 'Lighter and quicker to turn over; trades some cushioning on tired legs.' },
      { label: 'More structured feel', tradeoff: 'More support around the foot; trades a little weight and flexibility.' },
    ],
    conceptsNote: 'Your preferences and sourced product evidence decide the shortlist.',
  },
  climbing: {
    steps: [
      { title: 'Load the example', body: 'A synthetic illustration, loaded locally — nothing is uploaded or analysed.' },
      { title: 'Observe movement', body: '' },
      SHARED_STEPS.brief,
      {
        title: 'Compare directions',
        body: 'A supportive climbing shoe is one option to research for edging. Comfort, foot shape and the terrain still need checking. This is an illustrative direction, not a verified product recommendation.',
      },
      SHARED_STEPS.evidence,
      SHARED_STEPS.yours,
    ],
    brief: { goal: 'Indoor sessions', surface: 'Indoor wall', size: 'EU 40', budget: '£140', height: 'Not specified — synthetic example' },
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
    concepts: [
      { label: 'Comfort-first edging', tradeoff: 'Supportive on edges for longer sessions; trades some sensitivity on tiny holds.' },
      { label: 'Softer feedback', tradeoff: 'Softer and more sensitive; trades support on sharp edges.' },
      { label: 'More precise feel', tradeoff: 'Precise on small holds; trades comfort over long sessions.' },
    ],
    conceptsNote: 'Your preferences and sourced product evidence decide the shortlist.',
  },
}

export function exampleMetrics(sport: Sport) {
  return SAMPLE_BRIEFS[sport].metrics
}
