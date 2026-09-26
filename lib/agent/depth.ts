export type Depth = 'quick' | 'considered' | 'deep'
export type LayerId = 'measure' | 'stock' | 'riders' | 'research' | 'athletes'

export const LAYERS: { id: LayerId; label: string; detail: string }[] = [
  { id: 'measure', label: 'Your movement', detail: 'Profile built from your measurements and notes' },
  { id: 'stock', label: 'Live stock', detail: 'UK retailer search for current models and prices' },
  { id: 'riders', label: 'Rider reports', detail: 'Forums and independent reviews on fit and durability' },
  { id: 'research', label: 'Research', detail: 'Peer-reviewed findings behind each requirement' },
  { id: 'athletes', label: 'Athletes', detail: 'Which pros wear the shortlist, sponsored or spotted' },
]

export interface DepthPlan {
  label: string
  blurb: string
  layers: LayerId[]
  searches: number
  /** Typical end-to-end time to a shortlist, measured on the sample briefs. */
  seconds: number
}

export const DEPTHS: Record<Depth, DepthPlan> = {
  quick: {
    label: 'Quick',
    blurb: 'Straight to three shoes that fit your numbers.',
    layers: ['measure', 'stock'],
    searches: 1,
    seconds: 35,
  },
  considered: {
    label: 'Considered',
    blurb: 'Adds what real runners and climbers say before shortlisting.',
    layers: ['measure', 'stock', 'riders'],
    searches: 2,
    seconds: 60,
  },
  deep: {
    label: 'Deep',
    blurb: 'Adds the research behind every requirement and who wears each shoe.',
    layers: ['measure', 'stock', 'riders', 'research', 'athletes'],
    searches: 2,
    seconds: 90,
  },
}

export const DEPTH_ORDER: Depth[] = ['quick', 'considered', 'deep']

export const hasLayer = (depth: Depth, layer: LayerId) => DEPTHS[depth].layers.includes(layer)

export function nextDepth(depth: Depth): Depth | null {
  return DEPTH_ORDER[DEPTH_ORDER.indexOf(depth) + 1] ?? null
}

/** Layers the next depth would add, e.g. ["Research", "Athletes"]. */
export function addedLayers(from: Depth, to: Depth) {
  return LAYERS.filter((l) => hasLayer(to, l.id) && !hasLayer(from, l.id)).map((l) => l.label)
}

export function depthFromPrompt(text: string): Depth {
  const match = /^Depth: (quick|considered|deep)$/m.exec(text)
  return (match?.[1] as Depth | undefined) ?? 'considered'
}
