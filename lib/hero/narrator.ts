import type { Sport, MetricReading } from '@/lib/metrics/readout'

export interface HeroCaption {
  sport: Sport
  headline: string
  body: string
  insights: string[]
}

export interface NarratorOptions {
  /** Override default voice settings. Uses browser defaults when omitted. */
  voice?: SpeechSynthesisVoice | null
}

/**
 * Rule-based caption generator. Translates raw pose metrics into a narrative summary
 * suitable for sharing. No LLM required — fast, free, deterministic.
 *
 * Designed for the hero frame card. Each sport maps known thresholds to distinct
 * personality lines so the result feels authored, not templated.
 */
export function generateHeroCaption(
  sport: Sport,
  metrics: MetricReading[],
  profile?: { summary?: string; category?: string },
): HeroCaption {
  const insights: string[] = []
  let headline = ''
  let body = ''

  const get = (sub: string) =>
    metrics.find(m => m.label.toLowerCase().includes(sub.toLowerCase())) ?? null

  if (sport === 'running') {
    const cadence = get('cadence')
    const overstride = get('overstride')
    const strike = get('strike') || get('heel')

    if (cadence && cadence.value !== null) {
      if (cadence.value < 160) {
        headline = 'Long strides. Heavy steps.'
        insights.push(`Cadence ${cadence.value.toFixed(0)} spm — heavier landing, longer braking phase`)
      } else if (cadence.value <= 175) {
        headline = 'Even rhythm. Efficient motion.'
        insights.push(`Cadence ${cadence.value.toFixed(0)} spm — balanced stride pattern`)
      } else {
        headline = 'Quick. Light feet.'
        insights.push(`Cadence ${cadence.value.toFixed(0)} spm — faster turnover, lower impact`)
      }
    }

    if (overstride && overstride.value !== null) {
      if (overstride.value > 15) {
        insights.push(`Overstride ${overstride.value.toFixed(0)} cm — landing ahead of hips, high heel impact`)
      } else if (overstride.value > 8) {
        insights.push(`Overstride ${overstride.value.toFixed(0)} cm — moderate landing zone`)
      } else {
        insights.push(`Overstride ${overstride.value.toFixed(0)} cm — compact landing, efficient roll`)
      }
    }

    if (strike && strike.value !== null) {
      if (strike.value < -10) {
        insights.push(`Heel strike ${strike.value.toFixed(0)}° — impact absorption required`)
      } else if (strike.value <= 10) {
        insights.push(`Mid-foot strike ${strike.value.toFixed(0)}° — natural transition`)
      } else {
        insights.push(`Forefoot strike ${strike.value.toFixed(0)}° — shock-absorbing ankle position`)
      }
    }

    if (!insights.length) insights.push('Running dynamics tracked — ready to match your stride.')
    body = profile?.summary ?? 'Your movement signature, captured in one clip.'

  } else {
    // climbing
    const toeAngle = get('toe') && get('angle') ? get('toe') : null
    const hipWall = get('hip') && get('wall') ? get('hip') : null
    const settle = get('settle')

    // Fallback for climbing metric names that might vary
    const toeDown = get('toe-down') || toeAngle
    const hipToWall = get('hip-to-wall') || hipWall

    if (toeDown && toeDown.value !== null) {
      if (toeDown.value > 25) {
        headline = 'Steep foot. High tension.'
        insights.push(`Toe-down ${toeDown.value.toFixed(0)}° — aggressive edging stance`)
      } else if (toeDown.value > 10) {
        headline = 'Balanced placement. Controlled reach.'
        insights.push(`Toe-down ${toeDown.value.toFixed(0)}° — precise foot readjustment`)
      } else {
        headline = 'Flat-footed. Efficient power.'
        insights.push(`Toe-down ${toeDown.value.toFixed(0)}° — smearing and flat traction`)
      }
    }

    if (hipToWall && hipToWall.value !== null) {
      if (hipToWall.value > 30) {
        insights.push(`Hip-to-wall ${hipToWall.value.toFixed(0)} cm — high-hip climbing, less drag`)
      } else {
        insights.push(`Hip-to-wall ${hipToWall.value.toFixed(0)} cm — grounded, stable position`)
      }
    }

    if (settle && settle.value !== null) {
      if (settle.value > 2) {
        insights.push(`Settle time ${settle.value.toFixed(1)}s — careful, deliberate placement`)
      } else if (settle.value > 1) {
        insights.push(`Settle time ${settle.value.toFixed(1)}s — confident footwork`)
      }
    }

    if (!insights.length) insights.push('Climbing dynamics tracked — ready to match your style.')
    body = profile?.summary ?? 'Your climbing mechanics, captured in one clip.'
  }

  return { sport, headline, body, insights }
}

/** Convert a caption to a single spoken sentence (strips metrics that break audio flow). */
export function captionToSpeech(caption: HeroCaption): string {
  return `${caption.headline} ${caption.body}`
}
