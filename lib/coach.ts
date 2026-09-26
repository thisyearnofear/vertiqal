import type { Readout } from './metrics/readout'
import type { Voice } from './persona'

type CueId =
  | 'low-cadence'
  | 'high-cadence'
  | 'overstride'
  | 'straight-knee'
  | 'upright'
  | 'run-good'
  | 'busy-feet'
  | 'hips-out'
  | 'bent-arms'
  | 'climb-good'

export interface Cue {
  id: CueId
  text: string
}

const CUES: Record<CueId, Record<Voice, string>> = {
  'low-cadence': {
    coach: 'Quicker feet. Aim for shorter, lighter steps.',
    lab: 'Cadence below 165. Increase step rate.',
    hype: 'Pick up those feet, quick and light!',
  },
  'high-cadence': {
    coach: 'Nice and quick. You can relax the rhythm a touch.',
    lab: 'Cadence above 190. Stride may be clipped.',
    hype: 'Whoa, speedy feet. Ease off a little.',
  },
  overstride: {
    coach: 'Land under your hips, not out in front.',
    lab: 'Foot landing ahead of centre of mass.',
    hype: 'Feet under you, stop reaching!',
  },
  'straight-knee': {
    coach: 'Soften the knee as you land.',
    lab: 'Knee near locked at contact. Add flexion.',
    hype: 'Bend that knee, land soft!',
  },
  upright: {
    coach: 'Lean slightly forward from the ankles.',
    lab: 'Trunk near vertical. A small forward lean helps.',
    hype: 'Lean in a little, let gravity help!',
  },
  'run-good': {
    coach: 'That looks good. Hold this rhythm.',
    lab: 'All metrics in range. Continue.',
    hype: 'Looking smooth, keep it rolling!',
  },
  'busy-feet': {
    coach: 'Look at the hold, place the foot once.',
    lab: 'Multiple readjustments detected. Place deliberately.',
    hype: 'One touch, stick it!',
  },
  'hips-out': {
    coach: 'Hips into the wall.',
    lab: 'Hip offset high. Close the gap to the wall.',
    hype: 'Hug that wall with your hips!',
  },
  'bent-arms': {
    coach: 'Straighten the arms and hang from the skeleton.',
    lab: 'Elbows flexed while reaching. Straight arms save strength.',
    hype: 'Straight arms, save those forearms!',
  },
  'climb-good': {
    coach: 'Quiet feet, nice. Keep moving.',
    lab: 'Footwork efficient. Continue.',
    hype: 'Silent feet, love it!',
  },
}

const valueOf = (readout: Readout, id: string) => readout.metrics.find((m) => m.id === id)?.value ?? null

function cueIdFor(readout: Readout): CueId | null {
  if (readout.events < 3) return null
  if (readout.sport === 'running') {
    const cadence = valueOf(readout, 'cadence')
    const overstride = valueOf(readout, 'overstride')
    const knee = valueOf(readout, 'knee')
    const lean = valueOf(readout, 'lean')
    if (overstride !== null && overstride > 10) return 'overstride'
    if (cadence !== null && cadence < 165) return 'low-cadence'
    if (knee !== null && knee > 170) return 'straight-knee'
    if (cadence !== null && cadence > 190) return 'high-cadence'
    if (lean !== null && lean < 3) return 'upright'
    return 'run-good'
  }
  const quiet = valueOf(readout, 'quiet')
  const hips = valueOf(readout, 'hips')
  const reach = valueOf(readout, 'reach')
  if (quiet !== null && quiet < 75) return 'busy-feet'
  if (hips !== null && hips > 25) return 'hips-out'
  if (reach !== null && reach < 140) return 'bent-arms'
  return 'climb-good'
}

/** One spoken correction for the most important issue in the live readout. */
export function cueFor(readout: Readout, voice: Voice): Cue | null {
  const id = cueIdFor(readout)
  return id ? { id, text: CUES[id][voice] } : null
}
