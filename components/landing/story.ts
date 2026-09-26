export const SHOE_IMAGES = [1, 2, 3, 4, 5, 6].map((n) => `/landing/shoe-${n}.webp`)
export const HERO_SHOE = SHOE_IMAGES[0]

/** Scroll ranges (0..1 of the pinned story) for each beat of the landing narrative. */
export const BEATS = {
  intro: [0, 0.13],
  problem: [0.13, 0.33],
  scan: [0.33, 0.54],
  climb: [0.54, 0.75],
  match: [0.75, 1],
} as const satisfies Record<string, readonly [number, number]>

export type BeatName = keyof typeof BEATS

const LATEST_FIRST = (Object.keys(BEATS) as BeatName[]).reverse()

export const beatAt = (progress: number): BeatName => LATEST_FIRST.find((beat) => progress >= BEATS[beat][0]) ?? 'intro'
