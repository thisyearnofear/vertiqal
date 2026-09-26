export const SHOE_IMAGES = [1, 2, 3, 4, 5, 6].map((n) => `/landing/shoe-${n}.webp`)
export const HERO_SHOE = SHOE_IMAGES[0]

/** Scroll ranges (0..1 of the pinned story) for each beat of the landing narrative. */
export const BEATS = {
  intro: [0, 0.16],
  problem: [0.16, 0.4],
  scan: [0.4, 0.7],
  match: [0.7, 1],
} as const satisfies Record<string, readonly [number, number]>

export type BeatName = keyof typeof BEATS

export const beatAt = (progress: number): BeatName =>
  progress < BEATS.problem[0] ? 'intro' : progress < BEATS.scan[0] ? 'problem' : progress < BEATS.match[0] ? 'scan' : 'match'
