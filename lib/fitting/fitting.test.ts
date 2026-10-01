import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
  visibilityFor,
} from './session.ts'
import { EXAMPLE_FOOTAGE, EXAMPLE_SCRIPTS, EXAMPLE_STEP_COUNT, exampleCompanion, exampleMetrics, nextStep } from './example.ts'
import { settleStream } from './camera.ts'
import { UK_SIZES, answeredCount, feetInches, isAnswered, nextQuestion, previousQuestion, stepHeight } from './brief-flow.ts'
import { choiceSnapshot, draftDiffers, lastCheckLabel, stockTargetFor } from './stock.ts'
import { draftFromRemembered, parseRememberedBrief, rememberBrief, type RememberedBrief } from './remembered-brief.ts'
import { applyParsedBrief, briefParseSchema } from './brief-parse.ts'
import { SAMPLE_BRIEFS, agentRequestSchema, briefToPrompt } from '../agent/brief.ts'
import { LINK_TTL_MS, isLinkCodeMessage, issueLinkToken, newLinkCode, readLinkToken, transcriptHasCode } from '../wassist/link.ts'
import { EMPTY_NOTES } from '../agent/fitting-notes.ts'
import { createRateLimiter, createStockCheckRunner, createTtlCache, extraStockHosts, requestClientKey, stockTargetKey, stockUrlAllowed } from '../agent/stock-policy.ts'
import { STOCK_TARGET_TTL_MS, issueStockToken, verifyStockToken } from '../agent/stock-token.ts'
import { guardedStockVerdict, inspectStockPage, type StockPageEvidence } from '../agent/stock-page.ts'
import { frameQuality, usableKeypoint } from '../pose/framing.ts'
import { GaitTracker, MIN_STRIKES_FOR_SIGNALS, cadenceFromStrikes } from '../metrics/gait.ts'
import { modelKey, shortlistProblem } from '../agent/picks.ts'
import { ClimbTracker } from '../metrics/climb.ts'
import { attractPose } from '../../components/stride-lab/attract-runner.ts'
import type { Pose } from '../pose/types.ts'

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
  assert.equal(nextStepFor({ ...base, stage: 'research' }).action, null, 'the results panel owns actions once searching')
  assert.equal(nextStepFor({ ...base, stage: 'choose' }).action, null)
  assert.match(nextStepFor({ ...base, stage: 'decision' }).title, /size is in stock/)
  assert.match(nextStepFor({ ...base, stage: 'decision', stockChecked: true }).title, /take it with you/)
})

test('visibility: each stage shows only what it needs', () => {
  const unchecked = { stockChecked: false }
  const invite = visibilityFor('invite', unchecked)
  assert.equal(invite.denseStage, false)
  assert.equal(invite.briefExtras, true)
  assert.equal(invite.readout, false)
  assert.equal(invite.takeAway, false)
  for (const stage of ['capture', 'confirm'] as const) {
    const v = visibilityFor(stage, unchecked)
    assert.equal(v.readout, true, `${stage} shows the readout`)
    assert.equal(v.validation, true)
    assert.equal(v.briefExtras, true)
  }
  for (const stage of ['research', 'choose', 'decision'] as const) {
    const v = visibilityFor(stage, unchecked)
    assert.equal(v.denseStage, true, `${stage} shrinks the screen`)
    assert.equal(v.briefExtras, false, `${stage} collapses the brief`)
    assert.equal(v.readout, false)
    assert.equal(v.validation, false)
    assert.equal(v.takeAway, false, `${stage} hides take-away extras before a size check`)
  }
  assert.equal(visibilityFor('decision', { stockChecked: true }).takeAway, true)
  assert.equal(visibilityFor('choose', { stockChecked: true }).takeAway, false, 'a stale check never leaks into choosing')
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
  assert.equal(EXAMPLE_FOOTAGE.kind, 'generated')
  assert.equal(EXAMPLE_FOOTAGE.credit.includes('Seedance 1.5 Pro'), true)
  assert.equal(EXAMPLE_FOOTAGE.heightKnown, false, 'a generated subject has no real-world height')
  assert.equal(EXAMPLE_FOOTAGE.src.startsWith('/examples/'), true, 'footage is served locally, never hotlinked')
  assert.equal(EXAMPLE_FOOTAGE.poster.startsWith('/examples/'), true, 'poster is served locally')
  assert.equal(EXAMPLE_FOOTAGE.provenanceUrl.startsWith('/examples/'), true, 'provenance is served locally')
  assert.equal(nextStep(0, 1), 1)
  assert.equal(nextStep(EXAMPLE_STEP_COUNT - 1, 1), EXAMPLE_STEP_COUNT - 1, 'no auto-advance past the last step')
  assert.equal(nextStep(0, -1), 0)
})

test('generated-runner provenance fixture is complete and carries no credentials', () => {
  const raw = readFileSync(new URL('../../public/examples/generated-runner-provenance.json', import.meta.url), 'utf8')
  const p = JSON.parse(raw)
  assert.equal(p.requestId, '01a0f44e-9bb4-7a13-a69c-8f0bd562c82b')
  assert.equal(p.endpointId, 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video')
  assert.equal(p.input.duration, '12')
  assert.equal(p.input.generate_audio, false)
  assert.equal(p.sourceMedia.audio, false)
  assert.doesNotMatch(raw, /"[^"]*(api[_-]?key|secret|credential|authorization|bearer)[^"]*":/i, 'provenance must not embed secret fields')
  assert.equal(p.usage.measurements.includes('not extracted from this generated clip'), true)
})

test('dock companion lines match the footage each sport actually shows', () => {
  assert.equal(exampleCompanion('running', 1), 'The runner is AI-generated; these measurements are illustrative.')
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

const kp = (x: number, y: number, score = 1) => ({ x, y, score })

test('usableKeypoint requires in-frame coordinates and bounded confidence', () => {
  assert.equal(usableKeypoint(kp(0.5, 0.5, 0.9)), true)
  assert.equal(usableKeypoint(kp(0.5, 0.5, 0.49)), false, 'below the existing confidence floor')
  assert.equal(usableKeypoint(kp(0.5, 0.5, 0.5)), true, 'the existing 0.5 floor is inclusive')
  assert.equal(usableKeypoint(kp(0, 1, 0.5)), true, 'frame edges are valid coordinates')
  assert.equal(usableKeypoint(kp(-1, 0.5, 1)), false, 'offscreen hip must not read as usable')
  assert.equal(usableKeypoint(kp(2, 0.5, 1)), false)
  assert.equal(usableKeypoint(kp(0.5, -0.2, 1)), false)
  assert.equal(usableKeypoint(kp(NaN, 0.5, 1)), false)
  assert.equal(usableKeypoint(kp(0.5, NaN, 1)), false)
  assert.equal(usableKeypoint(kp(0.5, 0.5, Infinity)), false, 'non-finite score is not confident')
  assert.equal(usableKeypoint(kp(0.5, 0.5, NaN)), false)
  assert.equal(usableKeypoint(undefined), false)
  const hipsOut = { left_hip: kp(-1, 0.5), right_hip: kp(2, 0.5) }
  assert.deepEqual(frameQuality(hipsOut), { person: false, hips: false, feet: false }, 'offscreen hips must fail framing')
})

const ATTRACT_OPTS = { centerX: 0.6, height: 0.55, groundY: 0.86, aspect: 9 / 16 }
const FRAME_W = 1280
const FRAME_H = 720
const runGait = (tracker: GaitTracker, startSec: number, seconds: number) => {
  let snap
  for (let i = 0; i <= Math.round(seconds * 30); i++) {
    const t = startSec + i / 30
    snap = tracker.update(t, attractPose(t, ATTRACT_OPTS), FRAME_W, FRAME_H)
  }
  return snap!
}

test('gait tracker: rewinding a looping clip clears accumulated strikes', () => {
  const tracker = new GaitTracker(178)
  const first = runGait(tracker, 0, 3)
  assert.ok(first.totalStrikes > 0, 'the synthetic runner must register strikes')
  const after = tracker.update(0, attractPose(0, ATTRACT_OPTS), FRAME_W, FRAME_H)
  assert.equal(after.totalStrikes, 0, 'rewind must reset accumulation, not keep prior events')
})

test('gait tracker: repeated short passes never reach the signal threshold', () => {
  const tracker = new GaitTracker(178)
  for (let pass = 0; pass < 3; pass++) runGait(tracker, 0, 0.5)
  const snap = tracker.update(0.02, attractPose(0.02, ATTRACT_OPTS), FRAME_W, FRAME_H)
  assert.ok(snap.totalStrikes < MIN_STRIKES_FOR_SIGNALS, 'three looping passes must not pool into one measurement')
})

test('gait tracker: a pose gap keeps past strikes but fabricates no contact', () => {
  const tracker = new GaitTracker(178)
  const first = runGait(tracker, 0, 3)
  const before = first.totalStrikes
  let snap = tracker.update(3.1, null, FRAME_W, FRAME_H)
  snap = tracker.update(3.15, null, FRAME_W, FRAME_H)
  assert.equal(snap.totalStrikes, before, 'missing poses must not erase legitimate events')
  assert.equal(snap.cadenceSpm, null, 'cadence window is empty after a gap')
  for (let i = 0; i < 4; i++) {
    const t = 3.2 + i / 30
    snap = tracker.update(t, attractPose(t, ATTRACT_OPTS), FRAME_W, FRAME_H)
  }
  assert.equal(snap.totalStrikes, before, 'no strike can be detected until ankle history refills')
})

test('shortlist guard: rejects the same model twice, accepts three different shoes', () => {
  const p = (name: string, url: string) => ({ name, url })
  assert.equal(modelKey("HOKA Speedgoat 6 Men's"), modelKey('Hoka Speedgoat 6'))
  assert.notEqual(modelKey('Hoka Speedgoat 6'), modelKey('Hoka Speedgoat 5'), 'versions are different models')
  const dup = [p('Hoka Speedgoat 6', 'https://a.example/1'), p('Brooks Cascadia 19', 'https://a.example/2'), p("Hoka Speedgoat 6 Men's", 'https://a.example/3')]
  assert.match(shortlistProblem(dup) ?? '', /same shoe/)
  const sameUrl = [p('Hoka Speedgoat 6', 'https://a.example/1'), p('Brooks Cascadia 19', 'https://a.example/1'), p('Saucony Xodus Ultra 3', 'https://a.example/3')]
  assert.ok(shortlistProblem(sameUrl), 'two picks cannot share a product page')
  const ok = [p('Hoka Speedgoat 6', 'https://a.example/1'), p('Brooks Cascadia 19', 'https://a.example/2'), p('Saucony Xodus Ultra 3', 'https://a.example/3')]
  assert.equal(shortlistProblem(ok), null)
})

test('cadence: robust to hidden far foot, doubled contacts and stray detections', () => {
  type S = { timeSec: number; side: 'left' | 'right' }
  const other = (side: S['side']): S['side'] => (side === 'left' ? 'right' : 'left')
  const alternating = (spm: number, n: number): S[] =>
    Array.from({ length: n }, (_, i) => ({ timeSec: (i * 60) / spm, side: (i % 2 ? 'right' : 'left') as S['side'] }))
  const oneFoot = (strideSpm: number, n: number): S[] =>
    Array.from({ length: n }, (_, i) => ({ timeSec: (i * 60) / strideSpm, side: 'left' as const }))
  const near = (value: number | null, expected: number) => value !== null && Math.abs(value - expected) < 1
  assert.ok(near(cadenceFromStrikes(alternating(170, 12)), 170), 'clean alternating contacts')
  assert.ok(near(cadenceFromStrikes(oneFoot(85, 6)), 170), 'only the near foot visible: each interval is a stride')
  const doubled = alternating(170, 10).flatMap((s): S[] => [s, { timeSec: s.timeSec + 0.04, side: other(s.side) }])
  assert.ok(near(cadenceFromStrikes(doubled), 170), 'left/right label swaps must not double cadence')
  const missed = alternating(180, 14).filter((_, i) => i !== 5)
  assert.ok(near(cadenceFromStrikes(missed), 180), 'one missed contact barely moves the median')
  assert.equal(cadenceFromStrikes(alternating(100, 10)), null, 'walking pace is not a running cadence')
  assert.equal(cadenceFromStrikes(alternating(59, 8)), null, 'an implausible 59 spm is reported as not measured')
  assert.equal(cadenceFromStrikes(alternating(320, 12)), null, 'an implausible 320 spm is reported as not measured')
  assert.equal(cadenceFromStrikes(alternating(170, 3)), null, 'too few contacts')
})

test('gait tracker: low-confidence hips clear the timing history without dropping events', () => {
  const tracker = new GaitTracker(178)
  const first = runGait(tracker, 0, 3)
  const before = first.totalStrikes
  let snap
  for (let i = 0; i < 4; i++) {
    const t = 3.1 + i / 30
    const dim: Pose = { ...attractPose(t, ATTRACT_OPTS), left_hip: kp(0.4, 0.3, 0.49), right_hip: kp(0.5, 0.3, 0.49) }
    snap = tracker.update(t, dim, FRAME_W, FRAME_H)
  }
  assert.equal(snap!.totalStrikes, before, 'a degraded frame keeps earlier strikes but detects nothing')
})

const climbPose = (footX: number, restX = 0.78): Pose => ({
  left_hip: kp(0.45, 0.3),
  right_hip: kp(0.55, 0.3),
  left_knee: kp(0.45, 0.55),
  right_knee: kp(0.55, 0.55),
  left_ankle: kp(footX, 0.8),
  right_ankle: kp(restX, 0.8),
})

test('climb tracker: rewinding clears placements and running means', () => {
  const tracker = new ClimbTracker(178)
  let snap
  for (let i = 0; i <= 6; i++) snap = tracker.update(i / 30, climbPose(0.4), FRAME_W, FRAME_H)
  for (let i = 0; i <= 12; i++) snap = tracker.update(0.23 + i / 30, climbPose(0.7), FRAME_W, FRAME_H)
  assert.ok(snap!.totalPlacements > 0, 'the synthetic foot move must settle into a placement')
  snap = tracker.update(0, climbPose(0.4), FRAME_W, FRAME_H)
  assert.equal(snap.totalPlacements, 0, 'rewind must reset accumulation')
  assert.equal(snap.avgToeDownDeg, null)
  assert.equal(snap.avgReachElbowDeg, null)
  assert.equal(snap.movingFoot, null, 'fresh limbs are not mid-move after a rewind')
})

test('climb tracker: a pose gap does not fabricate a placement', () => {
  const tracker = new ClimbTracker(178)
  let snap
  for (let i = 0; i <= 6; i++) snap = tracker.update(i / 30, climbPose(0.4), FRAME_W, FRAME_H)
  for (let i = 0; i <= 12; i++) snap = tracker.update(0.23 + i / 30, climbPose(0.7), FRAME_W, FRAME_H)
  const before = snap!.totalPlacements
  tracker.update(0.7, null, FRAME_W, FRAME_H)
  tracker.update(0.75, null, FRAME_W, FRAME_H)
  for (let i = 0; i <= 10; i++) snap = tracker.update(0.8 + i / 30, climbPose(0.55), FRAME_W, FRAME_H)
  assert.equal(snap!.totalPlacements, before, 'a still foot after a gap is not a new placement')
  assert.equal(snap!.movingFoot, null, 'lost tracking does not resume an old settle')
})

test('brief flow: asks required questions in order and skips what is answered or skipped', () => {
  const none = new Set<never>()
  assert.equal(nextQuestion({ draft: blank, notes: EMPTY_NOTES, skipped: none, heightOnScreen: false }), 'height')
  assert.equal(nextQuestion({ draft: blank, notes: EMPTY_NOTES, skipped: none, heightOnScreen: true }), 'goal', 'height is left to the stage screen')
  assert.equal(nextQuestion({ draft: { ...blank, heightCm: '178', goal: 'Easy miles' }, notes: EMPTY_NOTES, skipped: new Set(['surface'] as const), heightOnScreen: false }), 'size')
  assert.equal(nextQuestion({ draft: valid, notes: EMPTY_NOTES, skipped: none, heightOnScreen: false }), null)
  assert.equal(answeredCount(valid, EMPTY_NOTES), 5)
  assert.equal(answeredCount({ ...valid, heightCm: '90', budgetPounds: '0' }, EMPTY_NOTES), 3, 'invalid height and budget are not answers')
})

test('remembered brief: parse rejects garbage, oversized fields and invalid JSON', () => {
  assert.equal(parseRememberedBrief(undefined), null)
  assert.equal(parseRememberedBrief(''), null)
  assert.equal(parseRememberedBrief('not json{'), null)
  assert.equal(parseRememberedBrief('"a string"'), null)
  assert.equal(parseRememberedBrief(JSON.stringify({ size: 'UK 9' })), null, 'missing required fields')
  const oversized = {
    size: 'UK 9 with a very long trailing string',
    budgetPounds: '160',
    heightCm: '178',
    width: 'wide',
    bySport: {},
  }
  assert.equal(parseRememberedBrief(JSON.stringify(oversized)), null)
  assert.equal(
    parseRememberedBrief(JSON.stringify({ ...oversized, size: 'UK 9', width: 'enormous' })),
    null,
    'width must be a known foot width',
  )
  const good: RememberedBrief = {
    size: 'UK 9',
    budgetPounds: '160',
    heightCm: '178',
    width: '',
    bySport: { running: { goal: 'Easy miles', surface: 'Road' } },
  }
  assert.deepEqual(parseRememberedBrief(JSON.stringify(good)), good)
})

test('remembered brief: saves confirmed answers per sport and never stores niggles', () => {
  const previous: RememberedBrief = {
    size: 'UK 8',
    budgetPounds: '120',
    heightCm: '170',
    width: '',
    bySport: { climbing: { goal: 'Hard bouldering', surface: 'Indoor walls' } },
  }
  const draft: PrefDraft = { size: 'UK 9', budgetPounds: '160', heightCm: '178', goal: 'Easy miles', surface: 'Road' }
  const notes = { ...EMPTY_NOTES, width: 'wide' as const, niggles: 'sore shins', goal: 'Easy miles', surface: 'Road' }
  const next = rememberBrief(previous, draft, notes, 'running')
  assert.equal(next.size, 'UK 9')
  assert.equal(next.budgetPounds, '160')
  assert.equal(next.heightCm, '178')
  assert.equal(next.width, 'wide')
  assert.deepEqual(next.bySport.running, { goal: 'Easy miles', surface: 'Road' })
  assert.deepEqual(next.bySport.climbing, { goal: 'Hard bouldering', surface: 'Indoor walls' }, 'the other sport survives')
  assert.equal(JSON.stringify(next).includes('sore shins'), false, 'niggles are never persisted')
  assert.equal('niggles' in next, false)
})

test('remembered brief: drafts fall back to member size and blank goal/surface for an unremembered sport', () => {
  const brief: RememberedBrief = {
    size: '',
    budgetPounds: '160',
    heightCm: '178',
    width: 'narrow',
    bySport: { running: { goal: 'Easy miles', surface: 'Road' } },
  }
  const running = draftFromRemembered(brief, 'running', 'UK 10')
  assert.deepEqual(running, { size: 'UK 10', budgetPounds: '160', heightCm: '178', goal: 'Easy miles', surface: 'Road' })
  const climbing = draftFromRemembered(brief, 'climbing', 'UK 10')
  assert.deepEqual(climbing, { size: 'UK 10', budgetPounds: '160', heightCm: '178', goal: '', surface: '' })
  assert.deepEqual(draftFromRemembered(null, 'running', 'UK 10'), { size: 'UK 10', budgetPounds: '', heightCm: '', goal: '', surface: '' })
  assert.equal(draftFromRemembered(null, 'running', null).size, '')
})

test('brief parse: nulls change nothing and height is never touched', () => {
  const parsed = briefParseSchema('running').parse({
    size: null,
    budgetPounds: null,
    goal: null,
    surface: null,
    width: null,
    currentShoe: null,
    fitNote: null,
  })
  const applied = applyParsedBrief(valid, { ...EMPTY_NOTES, width: 'wide' }, parsed)
  assert.deepEqual(applied.draft, valid)
  assert.equal(applied.notes.width, 'wide')
  assert.deepEqual(applied.filled, [])
})

test('brief parse: bad size is rejected, budget becomes a string, current composes', () => {
  const parsed = briefParseSchema('running').parse({
    size: 'nine-ish',
    budgetPounds: 150,
    goal: 'Easy miles',
    surface: 'Road',
    width: 'wide',
    currentShoe: 'Pegasus 40',
    fitNote: 'tight in the toes',
  })
  const applied = applyParsedBrief(blank, EMPTY_NOTES, parsed)
  assert.equal(applied.draft.size, '', 'unrecognised size must not overwrite the draft')
  assert.equal(applied.draft.budgetPounds, '150')
  assert.equal(applied.draft.goal, 'Easy miles')
  assert.equal(applied.draft.surface, 'Road')
  assert.equal(applied.draft.heightCm, '', 'height is never set from text')
  assert.equal(applied.notes.width, 'wide')
  assert.equal(applied.notes.current, 'Pegasus 40 — tight in the toes')
  assert.deepEqual(applied.filled, ['budget', 'goal', 'surface', 'width'])

  const sizeOnly = applyParsedBrief(blank, EMPTY_NOTES, { ...parsed, size: 'UK 9.5', budgetPounds: null, goal: null, surface: null, width: null, currentShoe: null, fitNote: null })
  assert.equal(sizeOnly.draft.size, 'UK 9.5')
  assert.deepEqual(sizeOnly.filled, ['size'])
  assert.equal(sizeOnly.notes.current, '')

  const noteOnly = applyParsedBrief(blank, EMPTY_NOTES, { ...parsed, size: null, budgetPounds: null, goal: null, surface: null, width: null, currentShoe: 'Solution', fitNote: null })
  assert.equal(noteOnly.notes.current, 'Solution')
})

test('brief parse: schema rejects out-of-range budget and unlisted options', () => {
  const schema = briefParseSchema('climbing')
  const base = { size: null, budgetPounds: null, goal: null, surface: null, width: null, currentShoe: null, fitNote: null }
  assert.equal(schema.safeParse({ ...base, budgetPounds: 5000 }).success, false)
  assert.equal(schema.safeParse({ ...base, goal: 'Easy miles' }).success, false, 'running goal is not a climbing goal')
  assert.equal(schema.safeParse({ ...base, goal: 'Hard bouldering', surface: 'Indoor walls' }).success, true)
})

test('agent request schema accepts a real brief and prefs, rejects bad input', () => {
  const prefs = { size: 'UK 9', budget: '£160', heightCm: 178, voice: 'coach', depth: 'deep', notes: ['Goal: easy miles'] }
  const parsed = agentRequestSchema.safeParse({ brief: SAMPLE_BRIEFS.running, prefs })
  assert.equal(parsed.success, true)
  if (parsed.success) {
    assert.match(briefToPrompt(parsed.data.brief, parsed.data.prefs), /^Depth: deep$/m)
  }

  const ok = { brief: SAMPLE_BRIEFS.climbing, prefs }
  const reject = (patch: (body: Record<string, unknown>) => void, why: string) => {
    const body = JSON.parse(JSON.stringify(ok))
    patch(body)
    assert.equal(agentRequestSchema.safeParse(body).success, false, why)
  }
  reject((b) => { (b.brief as { events: number }).events = 2 }, 'events below MIN_EVENTS must be rejected')
  reject((b) => { (b.brief as { events: number }).events = 501 }, 'events above the cap must be rejected')
  reject((b) => { (b.prefs as { depth: string }).depth = 'max' }, 'unknown depth must be rejected')
  reject((b) => { (b.prefs as { budget: string }).budget = 'lots' }, 'non-£ budget must be rejected')
  reject((b) => { (b.prefs as { heightCm: number }).heightCm = 90 }, 'height below range must be rejected')
  reject((b) => { (b.prefs as { notes: string[] }).notes = Array(13).fill('note') }, 'more than 12 notes must be rejected')
  reject((b) => { (b.prefs as { notes: string[] }).notes = ['x'.repeat(1001)] }, 'oversized note must be rejected')
  reject((b) => { (b.brief as { metrics: unknown[] }).metrics = [] }, 'empty metrics must be rejected')
})

test('wassist link: codes use the unambiguous alphabet and a fixed shape', () => {
  const code = newLinkCode()
  assert.match(code, /^FORMA-[A-Z2-9]{6}$/)
  assert.doesNotMatch(code.slice(6), /[01IOL]/, 'code part uses only the unambiguous alphabet')
  let i = 0
  const fixed = newLinkCode(() => i++ % 32)
  assert.equal(fixed, 'FORMA-ABCDEF')
})

test('wassist link: token round-trips and rejects tampering, expiry and wrong keys', () => {
  const key = Buffer.from('test-key')
  const other = Buffer.from('other-key')
  const now = 1_700_000_000_000
  const token = issueLinkToken(key, { phone: '447700900123', code: 'FORMA-ABC123', now })
  assert.deepEqual(readLinkToken(key, token, now + 60_000), { phone: '447700900123', code: 'FORMA-ABC123' })
  assert.equal(readLinkToken(other, token, now + 60_000), null, 'wrong key must fail')
  assert.equal(readLinkToken(key, `${token.slice(0, -2)}xx`, now), null, 'tampered signature must fail')
  const [body] = token.split('.')
  const tampered = `${Buffer.from(JSON.stringify({ p: '449999999999', c: 'FORMA-ABC123', t: now })).toString('base64url')}.${token.split('.')[1]}`
  assert.equal(readLinkToken(key, tampered, now), null, 'tampered payload must fail')
  assert.equal(readLinkToken(key, `${body}.`, now), null, 'missing signature must fail')
  assert.equal(readLinkToken(key, 'not-a-token', now), null)
  assert.equal(readLinkToken(key, token, now + LINK_TTL_MS + 1), null, 'expired token must fail')
  assert.equal(readLinkToken(key, token, now - 120_000), null, 'future-dated token must fail')
})

test('wassist link: transcript matching needs a SHOPPER line and a whole token', () => {
  const code = 'FORMA-ABC123'
  assert.equal(transcriptHasCode(`SHOPPER: ${code}`, code), true)
  assert.equal(transcriptHasCode(`SHOPPER: here is ${code.toLowerCase()} thanks`, code), true)
  assert.equal(transcriptHasCode(`FORMA: send me ${code}`, code), false, 'FORMA lines must not count')
  assert.equal(transcriptHasCode(`SHOPPER: ${code}X`, code), false, 'a longer token must not match')
  assert.equal(transcriptHasCode(`SHOPPER: FORMA-ABC123\nFORMA: hi`, code), true)
  assert.equal(transcriptHasCode('SHOPPER: hello', code), false)
  assert.equal(isLinkCodeMessage('  forma-abc123 '), true)
  assert.equal(isLinkCodeMessage('my code is FORMA-ABC123'), false, 'extra words mean a real reply is needed')
  assert.equal(isLinkCodeMessage('FORMA-ABC12'), false)
})

test('brief flow: optional answers, back navigation and height helpers', () => {
  assert.equal(isAnswered('width', blank, { ...EMPTY_NOTES, width: 'wide' }), true)
  assert.equal(isAnswered('niggles', blank, { ...EMPTY_NOTES, niggles: '   ' }), false)
  assert.equal(previousQuestion('goal'), 'height')
  assert.equal(previousQuestion('height'), null)
  assert.equal(previousQuestion('width'), null)
  assert.equal(stepHeight('', 1), 176, 'stepping from empty starts at a typical height')
  assert.equal(stepHeight('220', 1), 220)
  assert.equal(stepHeight('120', -1), 120)
  assert.equal(feetInches(178), '5′10″')
  assert.equal(UK_SIZES[0], 'UK 3')
  assert.equal(UK_SIZES.at(-1), 'UK 13')
})
