import type { Sport, MetricReading } from '@/lib/metrics/readout'

export interface HeroCaption {
  sport: Sport
  /** The emotional headline — short, provocative identity statement. */
  headline: string
  /** Contextual body — one sentence explaining the narrative. */
  body: string
  /** The single metric that defines this user's movement. Big on the card. */
  standoutMetric: { value: string; unit: string; label: string; description: string }
  /** Detailed insights — only shown on the web page, never on the card. */
  insights: string[]
}

/**
 * Rule-based caption generator. Translates raw pose metrics into a shareable
 * narrative summary suitable for social cards. No LLM required — fast, free,
 * deterministic.
 *
 * Design principles:
 * - ONE standout metric per card. Not three. One.
 * - The headline is identity ("Long strides. Heavy steps."), not data.
 * - The body is context ("Your movement signature, captured in one clip.").
 * - Insights are hidden detail — proof for those who want it.
 */
export function generateHeroCaption(
  sport: Sport,
  metrics: MetricReading[],
  profile?: { summary?: string; category?: string },
): HeroCaption {
  const insights: string[] = []
  let headline = ''
  let body = ''
  let standoutMetric: HeroCaption['standoutMetric'] = { value: '', unit: '', label: '', description: '' }

  const get = (sub: string) =>
    metrics.find(m => m.label.toLowerCase().includes(sub.toLowerCase())) ?? null

  if (sport === 'running') {
    const cadence = get('cadence')
    const overstride = get('overstride')
    const strike = get('strike') || get('heel')

    if (!cadence) {
      headline = 'Motion captured.'
      body = profile?.summary ?? 'No readings yet — upload a clip to see your movement signature.'
    }

    if (cadence && cadence.value !== null) {
      if (cadence.value < 160) {
        headline = 'Long strides. Heavy steps.'
        standoutMetric = {
          value: cadence.value.toFixed(0),
          unit: 'spm',
          label: 'cadence',
          description: 'Heavier landing, longer braking phase',
        }
        insights.push(`Cadence ${cadence.value.toFixed(0)} spm — heavier landing, longer braking phase`)
      } else if (cadence.value <= 175) {
        headline = 'Even rhythm. Efficient motion.'
        standoutMetric = {
          value: cadence.value.toFixed(0),
          unit: 'spm',
          label: 'cadence',
          description: 'Balanced stride pattern',
        }
        insights.push(`Cadence ${cadence.value.toFixed(0)} spm — balanced stride pattern`)
      } else {
        headline = 'Quick. Light feet.'
        standoutMetric = {
          value: cadence.value.toFixed(0),
          unit: 'spm',
          label: 'cadence',
          description: 'Faster turnover, lower impact',
        }
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

    if (!insights.length) {
      insights.push('Running dynamics tracked — ready to match your stride.')
      standoutMetric = { value: '?', unit: '', label: 'cadence', description: 'no readings captured' }
    }
    body = profile?.summary ?? 'Your movement signature, captured in one clip.'

  } else {
    // climbing
    const toeDown = get('toe-down') || get('toe') || get('angle')
    const hipToWall = get('hip-to-wall') || get('hip') || get('wall')
    const settle = get('settle')

    if (!toeDown) {
      headline = 'Motion captured.'
      body = profile?.summary ?? 'No readings yet — upload a clip to see your climbing style.'
    }

    if (toeDown && toeDown.value !== null) {
      if (toeDown.value > 25) {
        headline = 'Steep foot. High tension.'
        standoutMetric = {
          value: toeDown.value.toFixed(0),
          unit: '°',
          label: 'toe-down',
          description: 'Aggressive edging stance',
        }
        insights.push(`Toe-down ${toeDown.value.toFixed(0)}° — aggressive edging stance`)
      } else if (toeDown.value > 10) {
        headline = 'Balanced placement. Controlled reach.'
        standoutMetric = {
          value: toeDown.value.toFixed(0),
          unit: '°',
          label: 'toe-down',
          description: 'Precise foot readjustment',
        }
        insights.push(`Toe-down ${toeDown.value.toFixed(0)}° — precise foot readjustment`)
      } else {
        headline = 'Flat-footed. Efficient power.'
        standoutMetric = {
          value: toeDown.value.toFixed(0),
          unit: '°',
          label: 'toe-down',
          description: 'Smearing and flat traction',
        }
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

    if (!insights.length) {
      insights.push('Climbing dynamics tracked — ready to match your style.')
      standoutMetric = { value: '?', unit: '', label: 'toe-down', description: 'no readings captured' }
    }
    body = profile?.summary ?? 'Your climbing mechanics, captured in one clip.'
  }

  return { sport, headline, body, standoutMetric, insights }
}

/** Convert a caption to a single spoken sentence (strips metric details for audio flow). */
export function captionToSpeech(caption: HeroCaption): string {
  return `${caption.headline} ${caption.body}`
}
