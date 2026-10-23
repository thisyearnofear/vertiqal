import { createHmac, timingSafeEqual } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { passportSchema, type Passport } from './schema.ts'

export const DEMO_PASSPORTS: Record<'demo-running' | 'demo-climbing', Passport> = {
  'demo-running': {
    v: 1,
    sport: 'running',
    heightCm: 178,
    size: 'UK 9',
    voice: 'coach',
    metrics: [
      { label: 'Cadence', value: 164, unit: 'spm' },
      { label: 'Foot strike', value: -8, unit: 'deg' },
      { label: 'Overstride', value: 14, unit: 'cm' },
    ],
    signals: [
      'Sample demo fitting: heel-first contact at 164 spm with 14 cm overstride ahead of centre of mass',
      'Road daily trainer profile requiring rearfoot impact attenuation and smooth heel-to-toe transition',
    ],
    profile: {
      summary: 'Demo road runner at 164 spm with rearfoot strike and 14 cm overstride seeking cushioned daily mileage shoes.',
      category: 'neutral',
      requirements: [
        { attribute: 'Heel cushioning', target: 'High stack (35–40 mm), compliant rearfoot foam for 14 cm overstride' },
        { attribute: 'Heel-to-toe drop', target: '8–10 mm to ease Achilles load and smooth rearfoot-to-forefoot roll' },
        { attribute: 'Outsole geometry', target: 'Bevelled heel crash pad with durable road rubber' },
      ],
    },
    picks: [
      {
        name: 'Brooks Ghost 16',
        retailer: 'Runners Need',
        url: 'https://www.runnersneed.com/p/brooks-ghost-16',
        price: '£135',
      },
      {
        name: 'Nike Pegasus 41',
        retailer: 'Sports Direct',
        url: 'https://www.sportsdirect.com/nike-pegasus-41',
        price: '£130',
      },
      {
        name: 'Saucony Ride 17',
        retailer: 'Start Fitness',
        url: 'https://www.startfitness.co.uk/saucony-ride-17',
        price: '£125',
      },
    ],
  },
  'demo-climbing': {
    v: 1,
    sport: 'climbing',
    heightCm: 174,
    size: 'UK 7.5',
    voice: 'coach',
    metrics: [
      { label: 'Toe-down angle', value: 18, unit: 'deg' },
      { label: 'Hip-to-wall', value: 22, unit: 'cm' },
      { label: 'Placement settle', value: 1.4, unit: 'frames' },
    ],
    signals: [
      'Sample demo fitting: deliberate 18° toe-down edging placements on steep indoor bouldering walls',
      'Needs asymmetric downturn with sticky forefoot rubber and secure heel hook tension',
    ],
    profile: {
      summary: 'Demo indoor boulderer using 18° toe-down placements and close hip-to-wall tension.',
      category: 'aggressive',
      requirements: [
        { attribute: 'Downturn & asymmetry', target: 'Moderate-to-aggressive camber to hold tension on steep holds' },
        { attribute: 'Forefoot rubber', target: 'Soft 3.5–4 mm grip compound (e.g. Vibram XS Grip2) for indoor volumes' },
        { attribute: 'Closure & heel', target: 'Single-strap velcro with moulded 3D heel cup for heel hooks' },
      ],
    },
    picks: [
      {
        name: 'La Sportiva Solution Comp',
        retailer: 'BananaFingers',
        url: 'https://bananafingers.co.uk/la-sportiva-solution-comp',
        price: '£165',
      },
      {
        name: 'Scarpa Drago LV',
        retailer: 'Cotswold Outdoor',
        url: 'https://www.cotswoldoutdoor.com/p/scarpa-drago-lv',
        price: '£170',
      },
      {
        name: 'Tenaya Indalo',
        retailer: 'Ellis Brigham',
        url: 'https://www.ellis-brigham.com/tenaya-indalo',
        price: '£160',
      },
    ],
  },
}

/** Accepts a bare token or any passport URL issued by vertiqal. */
export function tokenFrom(input: string) {
  const trimmed = input.trim()
  const match = trimmed.match(/\/api\/passport\/([^/?#\s]+)/)
  return match ? match[1] : trimmed
}

/**
 * Passports are stateless: the (compressed) body travels in the URL and an HMAC proves
 * vertiqal issued it, so bots can trust it without a database lookup.
 */
function secret() {
  const key = process.env.PASSPORT_SECRET ?? process.env.WASSIST_API_KEY
  if (!key) throw new Error('No signing secret configured for fit passports')
  return createHmac('sha256', key).update('vertiqal-fit-passport').digest()
}

const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url').slice(0, 22)

export const passportId = (token: string) => {
  if (token === 'demo-running') return 'VQ-DEMO-RUN'
  if (token === 'demo-climbing') return 'VQ-DEMO-CLIMB'
  return `VQ-${Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('hex').slice(0, 6).toUpperCase()}`
}

export function issuePassport(passport: Passport) {
  const body = deflateRawSync(Buffer.from(JSON.stringify(passport))).toString('base64url')
  const token = `${body}.${sign(body)}`
  return { token, id: passportId(token) }
}

export function readPassport(token: string): Passport | null {
  if (token === 'demo-running' || token === 'demo-climbing') {
    return DEMO_PASSPORTS[token]
  }
  const [body, signature] = token.split('.')
  if (!body || !signature || token.length > 6000) return null
  let expected: Buffer
  try {
    expected = Buffer.from(sign(body))
  } catch {
    return null
  }
  const given = Buffer.from(signature)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    return passportSchema.parse(JSON.parse(inflateRawSync(Buffer.from(body, 'base64url')).toString()))
  } catch {
    return null
  }
}
