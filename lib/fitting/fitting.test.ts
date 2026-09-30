import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FALLBACK_HEIGHT_CM,
  analysisHeight,
  buildConfirmedPrefs,
  heightCalibrated,
  mergeDraftNotes,
  parseBudgetPounds,
  parseHeightCm,
  prefsValid,
  validatePrefs,
  type PrefDraft,
} from './prefs.ts'
import {
  canFindShoes,
  clearsBaseline,
  measurementInvalidated,
  nextStepFor,
  notesAfterReset,
  remeasurePlan,
  stageOf,
} from './session.ts'
import { EXAMPLE_FOOTAGE, EXAMPLE_SCRIPTS, EXAMPLE_STEP_COUNT, exampleCompanion, exampleMetrics, nextStep } from './example.ts'
import { settleStream } from './camera.ts'
import { choiceSnapshot, draftDiffers, lastCheckLabel, stockTargetFor } from './stock.ts'
import { EMPTY_NOTES } from '../agent/fitting-notes.ts'
import { createRateLimiter, createStockCheckRunner, createTtlCache, extraStockHosts, requestClientKey, stockTargetKey, stockUrlAllowed } from '../agent/stock-policy.ts'
import { STOCK_TARGET_TTL_MS, issueStockToken, verifyStockToken } from '../agent/stock-token.ts'
import { guardedStockVerdict, inspectStockPage, type StockPageEvidence } from '../agent/stock-page.ts'
import { frameQuality } from '../pose/framing.ts'

const valid: PrefDraft = { size: 'UK 9', budgetPounds: '160', heightCm: '178', goal: 'Easy miles', surface: 'Road' }
const blank: PrefDraft = { size: '', budgetPounds: '', heightCm: '', goal: '', surface: '' }

test('required fields: size, budget, height, goal and surface must all be present', () => {
  const errors = validatePrefs(blank)
  assert.deepEqual(Object.keys(errors).sort(), ['budget', 'goal', 'height', 'size', 'surface'])
  assert.equal(prefsValid(blank), false)
  assert.equal(prefsValid(valid), true)
})

test('height range is 120-220cm', () => {
  assert.equal(parseHeightCm('119'), null)
  assert.equal(parseHeightCm('120'), 120)
  assert.equal(parseHeightCm('220'), 220)
  assert.equal(parseHeightCm('221'), null)
  assert.equal(parseHeightCm('abc'), null)
  assert.equal(parseHeightCm(''), null)
  assert.equal(parseHeightCm(' 178 '), 178)
})

test('budget parses a plain pounds amount, rejects non-numeric and zero', () => {
  assert.equal(parseBudgetPounds('160'), 160)
  assert.equal(parseBudgetPounds('£140'), 140)
  assert.equal(parseBudgetPounds('0'), null)
  assert.equal(parseBudgetPounds('free'), null)
  assert.equal(parseBudgetPounds(''), null)
})

test('provisional height: fallback is flagged and can never submit', () => {
  const analysis = analysisHeight({ ...valid, heightCm: '' })
  assert.equal(analysis.heightCm, FALLBACK_HEIGHT_CM)
  assert.equal(analysis.provisional, true)
  assert.equal(analysisHeight(valid).provisional, false)

  const base = { example: false, liveActive: false, busy: false, prefsValid: true, measuredReady: true }
  assert.equal(canFindShoes({ ...base, heightCalibrated: false }), false, 'provisional/uncalibrated height blocks submit')
  assert.equal(heightCalibrated(null, 175), false)
  assert.equal(heightCalibrated(178, 175), false, 'edited height does not match calibration')
  assert.equal(heightCalibrated(178, 178), true)
  assert.equal(canFindShoes({ ...base, heightCalibrated: true }), true)
})

test('find shoes needs a ready measurement, finished capture, valid prefs and no example/busy', () => {
  const ready = { example: false, liveActive: false, busy: false, measuredReady: true, prefsValid: true, heightCalibrated: true }
  assert.equal(canFindShoes(ready), true)
  assert.equal(canFindShoes({ ...ready, measuredReady: false }), false, 'no measurement yet')
  assert.equal(canFindShoes({ ...ready, liveActive: true }), false, 'camera still running')
  assert.equal(canFindShoes({ ...ready, busy: true }), false)
  assert.equal(canFindShoes({ ...ready, prefsValid: false }), false)
  assert.equal(canFindShoes({ ...ready, example: true }), false, 'the example must never authorise a request')
})

test('height edit after a submitted search invalidates it until a calibrated re-measure', () => {
  const gate = { example: false, liveActive: false, busy: false, measuredReady: true, prefsValid: true }
  const sentGate = { ...gate, heightCalibrated: heightCalibrated(178, 178) }
  assert.equal(canFindShoes(sentGate), true, 'search was possible at the calibrated height')

  const entered = 182
  assert.equal(
    remeasurePlan({ enteredCm: entered, calibratedCm: 178, providerChanged: false, liveDone: false }),
    'reanalyse',
    'uploaded clip is re-analysed at the new height',
  )
  assert.equal(measurementInvalidated({ enteredCm: entered, calibratedCm: 178, providerMismatch: false }), true)
  assert.equal(
    canFindShoes({ ...gate, heightCalibrated: heightCalibrated(entered, 178) }),
    false,
    'submit stays disabled until the re-analysis produces a calibrated ready readout',
  )
  assert.equal(canFindShoes({ ...gate, heightCalibrated: heightCalibrated(entered, 182) }), true, 'new calibration unblocks')

  assert.equal(
    remeasurePlan({ enteredCm: entered, calibratedCm: 178, providerChanged: false, liveDone: true }),
    'recapture',
    'a finished live capture cannot be re-analysed — it must be re-filmed',
  )
  assert.equal(
    remeasurePlan({ enteredCm: 178, calibratedCm: 178, providerChanged: true, liveDone: true }),
    'recapture',
    'provider change on a finished live capture also needs recapture',
  )
  assert.equal(
    remeasurePlan({ enteredCm: 178, calibratedCm: 178, providerChanged: true, liveDone: false }),
    'reanalyse',
    'provider change re-analyses uploads',
  )
  assert.equal(measurementInvalidated({ enteredCm: 178, calibratedCm: 178, providerMismatch: true }), true)
  assert.equal(
    remeasurePlan({ enteredCm: 178, calibratedCm: 178, providerChanged: false, liveDone: false }),
    'none',
    'unchanged height and provider is a no-op',
  )
  assert.equal(
    remeasurePlan({ enteredCm: null, calibratedCm: 178, providerChanged: false, liveDone: false }),
    'none',
    'clearing height does not recalibrate — provisional state is already submit-blocked',
  )
})

test('stage machine: invite -> capture -> confirm -> research -> choose -> decision', () => {
  const base = { example: false, capturing: false, measuredReady: false, sent: false, hasOutputs: false, hasChoice: false }
  assert.equal(stageOf(base), 'invite')
  assert.equal(stageOf({ ...base, capturing: true }), 'capture')
  assert.equal(stageOf({ ...base, capturing: true, measuredReady: true }), 'confirm')
  assert.equal(stageOf({ ...base, measuredReady: true, sent: true }), 'research')
  assert.equal(stageOf({ ...base, measuredReady: true, sent: true, hasOutputs: true }), 'choose')
  assert.equal(stageOf({ ...base, measuredReady: true, sent: true, hasOutputs: true, hasChoice: true }), 'decision')
  assert.equal(stageOf({ ...base, example: true, sent: true, hasOutputs: true }), 'invite', 'example never leaves the invite stage')
})

test('next step follows the real fitting state without pretending the example is measured', () => {
  const base = { stage: 'invite' as const, example: false, capture: 'off' as const, events: 0, target: 6, eventLabel: 'footfalls', missingPrefs: 5, needsRecapture: false }
  assert.equal(nextStepFor(base).action?.kind, 'example')
  assert.equal(nextStepFor({ ...base, example: true }).action?.kind, 'upload-example')
  assert.equal(nextStepFor({ ...base, needsRecapture: true }).action?.kind, 'recapture')
  assert.equal(nextStepFor({ ...base, stage: 'capture', capture: 'recording', events: 2 }).action, null)
  assert.match(nextStepFor({ ...base, stage: 'capture', capture: 'recording', events: 2 }).detail, /4 more footfalls/)
  assert.deepEqual(nextStepFor({ ...base, stage: 'capture', capture: 'done', events: 2 }).action, { kind: 'recapture', label: 'Film again' })
  assert.match(nextStepFor({ ...base, stage: 'capture', capture: 'done', events: 2 }).detail, /Film again/)
  assert.deepEqual(nextStepFor({ ...base, stage: 'capture', capture: 'error' }).action, { kind: 'upload', label: 'Upload a clip' })
  assert.equal(nextStepFor({ ...base, stage: 'confirm', missingPrefs: 2 }).action?.kind, 'brief')
  assert.equal(nextStepFor({ ...base, stage: 'research' }).action?.kind, 'results')
  assert.equal(nextStepFor({ ...base, stage: 'decision' }).action?.label, 'Review stock check')
})

test('frame quality checks whether the person, hips and both feet are visible', () => {
  const point = { x: 0.5, y: 0.5, score: 0.9 }
  assert.deepEqual(frameQuality(null), { person: false, hips: false, feet: false })
  assert.deepEqual(
    frameQuality({
      nose: point,
      left_hip: point,
      right_hip: point,
      left_ankle: point,
      left_heel: point,
      right_ankle: point,
      right_foot: point,
    }),
    { person: true, hips: true, feet: true },
  )
  assert.equal(frameQuality({ nose: point, left_hip: point, right_hip: point }).feet, false)
})

test('sport change clears sport-specific goal/surface and vision findings, keeps the rest', () => {
  const notes = {
    ...EMPTY_NOTES,
    goal: 'Easy miles',
    surface: 'Road',
    width: 'wide' as const,
    niggles: 'sore shins',
    sole: { observations: [{ title: 'worn', detail: 'd' }], wearPattern: 'even' as const, shoeImplication: 's', confidence: 'low' as const },
  }
  const after = notesAfterReset('sport', notes)
  assert.equal(after.goal, '')
  assert.equal(after.surface, '')
  assert.equal(after.sole, null)
  assert.equal(after.width, 'wide')
  assert.equal(after.niggles, 'sore shins')

  const sameSport = notesAfterReset('new-clip', notes)
  assert.equal(sameSport.goal, 'Easy miles', 'same-sport new clip keeps preferences')
  assert.equal(sameSport.sole, null, 'vision findings describe the old clip')
  assert.equal(clearsBaseline('sport'), true)
  assert.equal(clearsBaseline('new-clip'), false)
})

test('example scripts: six stages per sport, synthetic fixture data, no product or stock claims', () => {
  for (const sport of ['running', 'climbing'] as const) {
    const script = EXAMPLE_SCRIPTS[sport]
    assert.equal(script.steps.length, EXAMPLE_STEP_COUNT)
    assert.equal(exampleMetrics(sport).length > 0, true)
    assert.match(script.steps[3].body, /illustrative direction, not a verified product recommendation/i)
    const blob = JSON.stringify(script)
    assert.doesNotMatch(blob, /in stock|out of stock|£\d+ available|https?:\/\//, 'concepts carry no product, price or stock claims')
    assert.equal(script.concepts.length, 3)
    for (const c of script.concepts) assert.ok(c.tradeoff.length > 0)
    assert.doesNotMatch(script.brief.height, /\d{3}\s*cm/, 'no invented height for example footage')
  }
  assert.equal(EXAMPLE_FOOTAGE.credit.includes('Orientation to Physical Efficiency Battery'), true)
  assert.equal(EXAMPLE_FOOTAGE.heightKnown, false, 'the archival runner height is unknown')
  assert.equal(EXAMPLE_FOOTAGE.src.startsWith('/examples/'), true, 'footage is served locally, never hotlinked')
  assert.equal(nextStep(0, 1), 1)
  assert.equal(nextStep(EXAMPLE_STEP_COUNT - 1, 1), EXAMPLE_STEP_COUNT - 1, 'no auto-advance past the last step')
  assert.equal(nextStep(0, -1), 0)
})

test('dock companion lines match the footage each sport actually shows', () => {
  assert.equal(exampleCompanion('running', 1), 'The footage is archival; these measurements are illustrative.')
  assert.equal(exampleCompanion('climbing', 1), 'The movement and measurements are illustrative.')
  assert.doesNotMatch(exampleCompanion('climbing', 1), /archiv|footage/i, 'climbing has no archival clip to claim')
  for (let step = 0; step < EXAMPLE_STEP_COUNT; step++) {
    assert.ok(exampleCompanion('running', step).length > 0)
    assert.ok(exampleCompanion('climbing', step).length > 0)
  }
})

test('stock target: draft edits never authorise a request and picks carry a server-issued token', () => {
  const stockToken = issueStockToken({ productName: 'Test Shoe', productUrl: 'https://example.test/p' }, 'test-secret', 1_000)
  const pick = { name: 'Test Shoe', url: 'https://example.test/p', stockToken }
  assert.equal(stockTargetFor(pick, null), null)
  assert.equal(stockTargetFor(pick, '  '), null)
  assert.equal(stockTargetFor({ ...pick, stockToken: '' }, 'UK 9')?.stockToken, '', 'a missing token still reaches the server so it can return an explicit refusal')
  assert.deepEqual(stockTargetFor(pick, 'UK 9'), { productName: 'Test Shoe', productUrl: pick.url, size: 'UK 9', stockToken })

  const target = { productName: pick.name, productUrl: pick.url }
  assert.equal(verifyStockToken(target, stockToken, 'test-secret', 2_000), true)
  assert.equal(verifyStockToken({ ...target, productUrl: 'https://example.test/other' }, stockToken, 'test-secret', 2_000), false)
  assert.equal(verifyStockToken(target, stockToken, 'test-secret', 1_000 + STOCK_TARGET_TTL_MS + 1), false, 'expired target tokens fail')
  assert.equal(verifyStockToken(target, stockToken, 'other-secret', 2_000), false)

  assert.equal(draftDiffers('UK 9', 'UK 9'), false)
  assert.equal(draftDiffers('UK 9', 'UK 10'), true, 'new draft cannot show the old verdict as its own')
  assert.equal(lastCheckLabel('UK 9'), 'Last check: UK 9')
})

test('stock policy: approved retailer URLs are limited, canonicalised and cacheable', () => {
  assert.equal(stockUrlAllowed('https://www.sportsshoes.com/product/shoe'), true)
  assert.equal(stockUrlAllowed('https://sportsshoes.com.evil.example/product'), false)
  assert.equal(stockUrlAllowed('http://sportsshoes.com/product'), false)
  assert.equal(stockUrlAllowed('https://user:pass@sportsshoes.com/product'), false)
  assert.equal(stockUrlAllowed('https://example.com/product', ['example.com']), true)
  assert.deepEqual(extraStockHosts('one.example, two.example'), ['one.example', 'two.example'])

  assert.equal(
    stockTargetKey('https://www.sportsshoes.com/product/?utm_source=x&colour=blue#details', ' uk 9 '),
    'sportsshoes.com/product?colour=blue#UK 9',
  )
  assert.equal(requestClientKey(new Request('https://vertiqal.test', { headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' } })), '203.0.113.1')

  const limiter = createRateLimiter({ limit: 2, windowMs: 1_000 })
  assert.equal(limiter('client', 100).allowed, true)
  assert.equal(limiter('client', 200).allowed, true)
  const blocked = limiter('client', 300)
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.retryAfterSec, 1)
  assert.equal(limiter('client', 1_101).allowed, true, 'a new window admits the client again')

  const cache = createTtlCache<string>(1_000)
  cache.set('target', 'result', 100)
  assert.equal(cache.get('target', 999)?.value, 'result')
  assert.equal(cache.get('target', 1_100), null, 'expired checks are not served')
})

test('stock runner: dedupes live checks, serves cache, and only bypasses on fresh requests', async () => {
  const target = { productName: 'Test Shoe', productUrl: 'https://sportsshoes.com/product?utm_source=test', size: 'UK 9' }
  const calls: string[] = []
  const releases: Array<() => void> = []
  const runner = createStockCheckRunner({
    maxActive: 1,
    check: (input) =>
      new Promise<{ verdict: string; size: string }>((resolve) => {
        calls.push(input.size)
        releases.push(() => resolve({ verdict: 'in_stock', size: input.size }))
      }),
  })

  const first = runner(target)
  const shared = runner(target)
  const busy = await runner({ ...target, size: 'UK 10' })
  assert.equal(busy.status, 'busy', 'the concurrency cap protects a second live target')
  releases[0]?.()
  const firstResult = await first
  const sharedResult = await shared
  if (firstResult.status !== 'ok' || sharedResult.status !== 'ok') assert.fail('live check did not complete')
  assert.equal(firstResult.source, 'live')
  assert.equal(sharedResult.source, 'shared')
  assert.equal(calls.length, 1)

  const cached = await runner(target)
  if (cached.status !== 'ok') assert.fail('cached check did not complete')
  assert.equal(cached.source, 'cache')
  assert.equal(calls.length, 1, 'the TTL cache avoids a second Solari session')

  const fresh = runner(target, { fresh: true })
  await Promise.resolve()
  releases[1]?.()
  const freshResult = await fresh
  if (freshResult.status !== 'ok') assert.fail('fresh check did not complete')
  assert.equal(freshResult.source, 'live')
  assert.equal(calls.length, 2, 'check again deliberately bypasses the cache')
})

test('stock runner: blocked results are not cached', async () => {
  let calls = 0
  const runner = createStockCheckRunner({
    check: async () => {
      calls += 1
      return { verdict: 'blocked' }
    },
  })
  const target = { productName: 'Test Shoe', productUrl: 'https://sportsshoes.com/product', size: 'UK 9' }
  await runner(target)
  await runner(target)
  assert.equal(calls, 2)
})

test('choice snapshot: UK 9 verified, draft UK 10 saves UK 10 unchecked, blank saves nothing', () => {
  const verified = { draft: 'UK 9', submitted: 'UK 9', verdict: 'In stock · UK 9 · £95' }
  assert.deepEqual(choiceSnapshot(verified), { size: 'UK 9', stock: 'In stock · UK 9 · £95' })

  const changed = choiceSnapshot({ draft: 'UK 10', submitted: 'UK 9', verdict: 'In stock · UK 9 · £95' })
  assert.deepEqual(changed, { size: 'UK 10', stock: 'Not checked for UK 10' }, 'edited size must not inherit the old verdict')

  assert.equal(choiceSnapshot({ draft: '', submitted: 'UK 9', verdict: 'In stock · UK 9 · £95' }), null, 'blank draft blocks the write')
  assert.deepEqual(choiceSnapshot({ draft: 'UK 9', submitted: 'UK 9', verdict: null }), { size: 'UK 9', stock: 'Not checked for UK 9' })
})

test('confirmed prefs carry the shopper fields verbatim: size, budget, height plus notes lines', () => {
  const draft: PrefDraft = { ...valid, size: 'UK 9', budgetPounds: '160', heightCm: '178' }
  const notes = { ...EMPTY_NOTES, width: 'wide' as const, niggles: 'sore shins', goal: 'stale-goal', surface: 'Trail' }
  const prefs = buildConfirmedPrefs({
    draft,
    notes,
    sport: 'running',
    voice: 'coach',
    depth: 'considered',
    memberLines: ['Previous running fitting: chose Old Shoe'],
  })
  assert.ok(prefs)
  assert.equal(prefs.size, 'UK 9')
  assert.equal(prefs.budget, '£160')
  assert.equal(prefs.heightCm, 178)
  assert.equal(prefs.depth, 'considered')
  assert.deepEqual(
    prefs.notes,
    ['Goal: Easy miles', 'Surface: Road', 'Foot width: wide', 'Niggles or past issues: sore shins', 'Previous running fitting: chose Old Shoe'],
    'goal/surface come from the draft (single source), not stale notes fields',
  )

  const merged = mergeDraftNotes(draft, notes)
  assert.equal(merged.goal, 'Easy miles')
  assert.equal(merged.surface, 'Road')
  assert.equal(merged.width, 'wide')

  assert.equal(buildConfirmedPrefs({ draft: blank, notes: EMPTY_NOTES, sport: 'running', voice: 'coach', depth: 'quick', memberLines: [] }), null)
})

test('a stale getUserMedia resolution releases its tracks instead of starting capture', async () => {
  const stops: string[] = []
  const fake = { getTracks: () => [{ stop: () => stops.push('stopped') }] } as unknown as MediaStream
  const stale = await settleStream(Promise.resolve(fake), () => true)
  assert.equal(stale, null)
  assert.deepEqual(stops, ['stopped'])

  const live = await settleStream(Promise.resolve(fake), () => false)
  assert.equal(live, fake)
})

const pageFixture = (over: Partial<StockPageEvidence> = {}): StockPageEvidence => ({
  finalUrl: 'https://www.sportsshoes.com/product/nike-pegasus-41',
  httpStatus: 200,
  title: "NIKE Men's Pegasus 41 Running Shoes | SportsShoes",
  headings: ["NIKE Men's Pegasus 41 Running Shoes"],
  productNames: [],
  sizes: ['UK 8', 'UK 9', 'UK 10'],
  blocked: false,
  ...over,
})

test('stock page gate: matching h1 verifies the page for judging', () => {
  assert.equal(inspectStockPage('Nike Pegasus 41', pageFixture()).status, 'verified')
})

test('stock page gate: structured Product name works without an h1', () => {
  const page = pageFixture({ headings: [], productNames: ['Nike Pegasus 41 Road Running Shoes'] })
  assert.equal(inspectStockPage('Nike Pegasus 41', page).status, 'verified')
})

test('stock page gate: soft error and login pages are unclear even with stale Product schema', () => {
  const stale = { productNames: ['Nike Pegasus 41 Road Running Shoes'], sizes: ['UK 9'] }
  for (const heading of ['Page not found', '404', 'Something went wrong', 'Sign in to your account', 'Log in']) {
    assert.equal(inspectStockPage('Nike Pegasus 41', pageFixture({ ...stale, headings: [heading] })).status, 'unclear', heading)
  }
  assert.equal(inspectStockPage('Nike Pegasus 41', pageFixture({ ...stale, headings: [], title: 'Page not found' })).status, 'unclear')
  assert.equal(
    inspectStockPage('Nike Pegasus 41', pageFixture({ headings: ["NIKE Men's Pegasus 41 Running Shoes"], title: 'Nike Pegasus 41 | SportsShoes' })).status,
    'verified',
    'a valid product title does not trip the soft-error check',
  )
})

test('stock page gate: title alone or a generic homepage heading is unclear', () => {
  assert.equal(inspectStockPage('Nike Pegasus 41', pageFixture({ headings: [] })).status, 'unclear')
  assert.equal(inspectStockPage('Nike Pegasus 41', pageFixture({ headings: ['SportsShoes.com — running shoes for everyone'] })).status, 'unclear')
})

test('stock page gate: same brand different model or version is unclear', () => {
  assert.equal(
    inspectStockPage('Nike Pegasus 41', pageFixture({ headings: ['Nike Vomero 18 Running Shoes'] })).status,
    'unclear',
  )
  assert.equal(
    inspectStockPage('Nike Pegasus 41', pageFixture({ headings: ['Nike Pegasus 40 Running Shoes'] })).status,
    'unclear',
  )
})

test('stock page gate: numeric-only product names cannot verify identity', () => {
  assert.equal(inspectStockPage('41', pageFixture()).status, 'unclear')
})

test('stock page gate: allowed redirect verifies, disallowed or malformed final URLs are blocked', () => {
  assert.equal(inspectStockPage('Nike Pegasus 41', pageFixture({ finalUrl: 'https://sportsshoes.com/p/redirected' })).status, 'verified')
  assert.equal(
    inspectStockPage('Nike Pegasus 41', pageFixture({ finalUrl: 'https://sportsshoes.com.evil.example/p' })).status,
    'blocked',
  )
  assert.equal(inspectStockPage('Nike Pegasus 41', pageFixture({ finalUrl: 'http://sportsshoes.com/p' })).status, 'blocked')
  assert.equal(
    inspectStockPage('Nike Pegasus 41', pageFixture({ finalUrl: 'https://user:pass@sportsshoes.com/p' })).status,
    'blocked',
  )
})

test('stock page gate: missing or error HTTP responses are blocked', () => {
  assert.equal(inspectStockPage('Nike Pegasus 41', pageFixture({ httpStatus: null })).status, 'blocked')
  assert.equal(inspectStockPage('Nike Pegasus 41', pageFixture({ httpStatus: 404 })).status, 'blocked')
  assert.equal(inspectStockPage('Nike Pegasus 41', pageFixture({ httpStatus: 500 })).status, 'blocked')
})

test('stock page gate: error and login headings never verify identity', () => {
  assert.equal(inspectStockPage('Nike Pegasus 41', pageFixture({ headings: ['Page not found'] })).status, 'unclear')
  assert.equal(inspectStockPage('Nike Pegasus 41', pageFixture({ headings: ['Sign in to your account'] })).status, 'unclear')
})

test('stock page gate: matched identity with no size controls is unclear, bot wall is blocked', () => {
  assert.equal(inspectStockPage('Nike Pegasus 41', pageFixture({ sizes: [] })).status, 'unclear')
  assert.equal(inspectStockPage('Nike Pegasus 41', pageFixture({ blocked: true })).status, 'blocked')
})

test('guarded stock verdict: the judge only runs on a verified page', { timeout: 2_000 }, async () => {
  let calls = 0
  const judge = async () => {
    calls += 1
    return { verdict: 'in_stock', sizeFound: 'UK 9', price: '£95', evidence: 'judge saw it' }
  }

  const blocked = await guardedStockVerdict('Nike Pegasus 41', pageFixture({ blocked: true }), judge)
  assert.equal(blocked.verdict, 'blocked')
  assert.equal(blocked.sizeFound, '')

  const unclear = await guardedStockVerdict('Nike Pegasus 41', pageFixture({ headings: [] }), judge)
  assert.equal(unclear.verdict, 'unclear')

  const staleSchema = await guardedStockVerdict(
    'Nike Pegasus 41',
    pageFixture({ headings: ['Sign in'], productNames: ['Nike Pegasus 41 Road Running Shoes'] }),
    judge,
  )
  assert.equal(staleSchema.verdict, 'unclear')
  assert.equal(calls, 0)

  const verdicts = ['in_stock', 'out_of_stock', 'size_not_listed', 'unclear'] as const
  for (const verdict of verdicts) {
    const result = await guardedStockVerdict('Nike Pegasus 41', pageFixture(), async () => {
      calls += 1
      return { verdict, sizeFound: 'UK 9', price: '£95', evidence: 'judge saw it' }
    })
    assert.equal(result.verdict, verdict)
    assert.equal(result.evidence, 'judge saw it')
  }
  assert.equal(calls, 4)
})
