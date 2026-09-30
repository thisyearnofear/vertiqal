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
  notesAfterReset,
  remeasurePlan,
  stageOf,
} from './session.ts'
import { EXAMPLE_SCRIPTS, EXAMPLE_STEP_COUNT, exampleMetrics, nextStep } from './example.ts'
import { settleStream } from './camera.ts'
import { choiceSnapshot, draftDiffers, lastCheckLabel, stockTargetFor } from './stock.ts'
import { EMPTY_NOTES } from '../agent/fitting-notes.ts'

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

test('example scripts: three steps per sport, synthetic fixture metrics, no product claims', () => {
  for (const sport of ['running', 'climbing'] as const) {
    const script = EXAMPLE_SCRIPTS[sport]
    assert.equal(script.steps.length, EXAMPLE_STEP_COUNT)
    assert.equal(exampleMetrics(sport).length > 0, true)
    assert.match(script.steps[2].body, /illustrative direction, not a verified product recommendation/i)
  }
  assert.equal(nextStep(0, 1), 1)
  assert.equal(nextStep(2, 1), 2, 'no auto-advance past the last step')
  assert.equal(nextStep(0, -1), 0)
})

test('stock target: draft edits never authorise a request', () => {
  const pick = { name: 'Test Shoe', url: 'https://example.test/p' }
  assert.equal(stockTargetFor(pick, null), null)
  assert.equal(stockTargetFor(pick, '  '), null)
  assert.deepEqual(stockTargetFor(pick, 'UK 9'), { productName: 'Test Shoe', productUrl: pick.url, size: 'UK 9' })
  assert.equal(draftDiffers('UK 9', 'UK 9'), false)
  assert.equal(draftDiffers('UK 9', 'UK 10'), true, 'new draft cannot show the old verdict as its own')
  assert.equal(lastCheckLabel('UK 9'), 'Last check: UK 9')
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
