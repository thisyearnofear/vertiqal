import type { Sport } from '../metrics/readout'
import type { Mood } from '../persona'
import type { FittingStage } from './session'

/** Where the size check for the chosen shoe has got to. */
export type StockPhase = 'idle' | 'checking' | 'in_stock' | 'unavailable' | 'unsure' | 'error'

export type NarrationAction = 'buy' | 'open' | 'shortlist' | 'whatsapp'

export interface Narration {
  /** Two or three words for the strip heading. */
  title: string
  /** What Forma says: one sentence, two at most. */
  line: string
  mood: Mood
  action: { kind: NarrationAction; label: string } | null
}

export interface ResultsState {
  stage: FittingStage
  sport: Sport
  /** What the search is doing right now, e.g. "Searching live stock". */
  activity: string | null
  topPick: string | null
  choice: { name: string; retailer: string } | null
  size: string
  stock: { phase: StockPhase; price: string | null }
  /** The pick Forma moved away from because it was sold out, if any. */
  fallbackFrom: string | null
  /** The pick Forma will try next if this one is sold out (only before a fallback has happened). */
  nextPick: string | null
  /** The shopper went to the retailer, so Forma offers the phone handoff. */
  bought: boolean
}

/** "Hoka Speedgoat 6 Men's Trail Running Shoes" → "Hoka Speedgoat 6". */
export function shortShoeName(name: string) {
  const trimmed = name
    .replace(/\b(men'?s|women'?s|mens|womens|unisex)\b/gi, ' ')
    .replace(/\b(trail running|road running|running|climbing|trail|approach)\s+shoes?\b/gi, ' ')
    .replace(/\bshoes?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return trimmed.split(' ').slice(0, 5).join(' ') || name
}

/**
 * Forma's line for the results stages: authored, short, and specific to what just happened, so the
 * mascot leads with one thing at a time instead of the page listing every option at once.
 * Returns null outside the results stages.
 */
export function narrate(state: ResultsState): Narration | null {
  const verb = state.sport === 'running' ? 'run' : 'climb'

  if (state.stage === 'research') {
    return { title: 'Searching', line: `${state.activity ?? 'Reading your measurements'}…`, mood: 'searching', action: null }
  }

  if (state.stage === 'choose') {
    const top = state.topPick ? shortShoeName(state.topPick) : null
    return {
      title: 'Pick one',
      line: top
        ? `Three shoes for how you ${verb}. The ${top} is my best fit. Tap one and I'll check your size.`
        : `Three shoes for how you ${verb}. Tap one and I'll check your size.`,
      mood: 'pleased',
      action: null,
    }
  }

  if (state.stage !== 'decision' || !state.choice) return null
  const name = shortShoeName(state.choice.name)
  const { retailer } = state.choice
  const size = state.size.trim()

  switch (state.stock.phase) {
    case 'idle':
      return {
        title: 'Your size',
        line:
          state.sport === 'climbing'
            ? `Climbing shoes run small. Enter your size as ${retailer} lists it and I'll check it's in stock.`
            : `Tell me your size and I'll check the ${name} is in stock at ${retailer}.`,
        mood: 'asking',
        action: null,
      }
    case 'checking':
      return {
        title: 'Checking stock',
        line: state.fallbackFrom
          ? `${size} was gone for the ${shortShoeName(state.fallbackFrom)}. Checking the ${name} instead…`
          : `Checking ${size} is in stock at ${retailer}…`,
        mood: 'working',
        action: null,
      }
    case 'in_stock':
      return state.bought
        ? {
            title: 'Take it with you',
            line: "Want your fitting on your phone? I'll check in after a couple of weeks of wear.",
            mood: 'asking',
            action: { kind: 'whatsapp', label: 'Send to WhatsApp' },
          }
        : {
            title: 'In stock',
            line: `The ${name} in ${size}${state.stock.price ? `, ${state.stock.price}` : ''} at ${retailer}. It's yours if you want it.`,
            mood: 'pleased',
            action: { kind: 'buy', label: `Buy at ${retailer}` },
          }
    case 'unavailable':
      return state.nextPick
        ? {
            title: 'Sold out',
            line: `${size} is sold out for the ${name}. I'll try the ${shortShoeName(state.nextPick)} next.`,
            mood: 'sad',
            action: null,
          }
        : {
            title: 'Sold out',
            line: `${size} is sold out for the ${name} at ${retailer}. Want to pick another from the three?`,
            mood: 'sad',
            action: { kind: 'shortlist', label: 'Back to the three' },
          }
    case 'unsure':
      return {
        title: 'Not confirmed',
        line: `${retailer} wouldn't let me confirm ${size}. Worth a quick look on their site.`,
        mood: 'thinking',
        action: { kind: 'open', label: `Open ${retailer}` },
      }
    case 'error':
      return {
        title: 'Check failed',
        line: `I couldn't run the size check just now. You can still check ${size} at ${retailer}.`,
        mood: 'sad',
        action: { kind: 'open', label: `Open ${retailer}` },
      }
  }
}
