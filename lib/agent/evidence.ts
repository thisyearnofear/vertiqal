import type { Sport } from '@/lib/metrics/readout'

export interface Finding {
  id: string
  sport: Sport
  /** Readout metric labels this finding speaks to; empty means it applies to any shoe choice. */
  metrics: string[]
  finding: string
  implication: string
  kind: 'RCT' | 'Cohort' | 'Lab study' | 'Review'
  sample?: string
  citation: string
  doi: string
}

/** Hand-checked findings (DOIs verified against Crossref). Kept deliberately small and honest. */
export const FINDINGS: Finding[] = [
  {
    id: 'R1',
    sport: 'running',
    metrics: ['Cadence'],
    finding: 'Raising step rate by 5–10% reduced loading at the hip and knee.',
    implication: 'Cadence is trainable. A shoe will not fix it, but a lighter, lower-bulk shoe makes quicker steps easier.',
    kind: 'Lab study',
    sample: 'n=45',
    citation: 'Heiderscheit et al., Med Sci Sports Exerc 2011',
    doi: '10.1249/MSS.0b013e3181ebedf4',
  },
  {
    id: 'R2',
    sport: 'running',
    metrics: ['Cadence', 'Overstride'],
    finding: 'A 10% higher step rate reduced patellofemoral (kneecap) joint force.',
    implication: 'Shorter steps that land closer to the hips ease knee load more than any midsole does.',
    kind: 'Lab study',
    sample: 'n=30',
    citation: 'Lenhart et al., Med Sci Sports Exerc 2014',
    doi: '10.1249/MSS.0b013e3182a78c3a',
  },
  {
    id: 'R3',
    sport: 'running',
    metrics: ['Overstride', 'Cadence'],
    finding: 'Heel-strike landings produce a sharp impact transient that forefoot landings largely avoid.',
    implication: 'Heel strikers are the runners that heel cushioning is designed for.',
    kind: 'Lab study',
    citation: 'Lieberman et al., Nature 2010',
    doi: '10.1038/nature08723',
  },
  {
    id: 'R4',
    sport: 'running',
    metrics: ['Knee @ contact'],
    finding: 'Landing with more knee bend lowered the impact peak and improved shock attenuation.',
    implication: 'A straight-legged landing leans harder on the midsole to absorb shock.',
    kind: 'Lab study',
    citation: 'Derrick, Med Sci Sports Exerc 2004',
    doi: '10.1249/01.MSS.0000126779.65353.CB',
  },
  {
    id: 'R5',
    sport: 'running',
    metrics: ['Trunk lean'],
    finding: 'A slightly more forward trunk lean reduced patellofemoral joint stress.',
    implication: 'Posture changes knee load independently of the shoe.',
    kind: 'Lab study',
    citation: 'Teng & Powers, J Orthop Sports Phys Ther 2014',
    doi: '10.2519/jospt.2014.5249',
  },
  {
    id: 'R6',
    sport: 'running',
    metrics: [],
    finding: 'Softer cushioning was linked to lower injury risk in lighter runners, but not in heavier ones.',
    implication: 'Body mass matters when choosing how soft to go.',
    kind: 'RCT',
    sample: 'n=848',
    citation: 'Malisoux et al., Am J Sports Med 2020',
    doi: '10.1177/0363546519892578',
  },
  {
    id: 'R7',
    sport: 'running',
    metrics: [],
    finding: 'Heel-to-toe drop made no overall difference to injury risk; subgroup results for occasional and regular runners pointed in opposite directions.',
    implication: 'Treat drop as a comfort and habit choice, and change it gradually.',
    kind: 'RCT',
    sample: 'n=553',
    citation: 'Malisoux et al., Am J Sports Med 2016',
    doi: '10.1177/0363546516654690',
  },
  {
    id: 'R8',
    sport: 'running',
    metrics: [],
    finding: 'Novice runners with pronated feet in neutral shoes were not injured more often over a year.',
    implication: 'Do not buy a stability shoe on a pronation label alone.',
    kind: 'Cohort',
    sample: 'n=927',
    citation: 'Nielsen et al., Br J Sports Med 2014',
    doi: '10.1136/bjsports-2013-092202',
  },
  {
    id: 'R9',
    sport: 'running',
    metrics: [],
    finding: 'Comfort and a runner’s preferred movement path are better guides than foot-type rules.',
    implication: 'If a recommended shoe feels wrong on a test run, trust that.',
    kind: 'Review',
    citation: 'Nigg et al., Br J Sports Med 2015',
    doi: '10.1136/bjsports-2015-095054',
  },
  {
    id: 'C1',
    sport: 'climbing',
    metrics: ['Toe-down'],
    finding: 'Tight, downturned climbing shoes are closely associated with foot pain and toe deformities.',
    implication: 'Size aggressively only for the terrain that needs it; comfort matters for volume.',
    kind: 'Review',
    citation: 'Schöffl & Küpper, World J Orthop 2013',
    doi: '10.5312/wjo.v4.i4.218',
  },
]

const FINDING_BY_ID = new Map(FINDINGS.map((f) => [f.id, f]))
export const findingById = (id: string) => FINDING_BY_ID.get(id.trim().toUpperCase())

export function findingsFor(sport: Sport, metricLabels: string[]) {
  const wanted = new Set(metricLabels.map((m) => m.trim().toLowerCase()))
  const relevant = FINDINGS.filter(
    (f) => f.sport === sport && (f.metrics.length === 0 || f.metrics.some((m) => wanted.has(m.toLowerCase()))),
  )
  const covered = new Set(relevant.flatMap((f) => f.metrics.map((m) => m.toLowerCase())))
  const unsupported = metricLabels.filter((m) => !covered.has(m.trim().toLowerCase()))
  return { findings: relevant, unsupported }
}
