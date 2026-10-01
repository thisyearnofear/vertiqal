import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EXAMPLE_OBSERVATION_INTERVAL_MS,
  exampleObservationLine,
  exampleTrackingStatus,
  shouldRunExampleTracking,
} from './example-observation.ts'

const framing = { person: true, hips: true, feet: true }

test('example inference runs only for visible, playing media with an enabled ready session', () => {
  const ready = { playing: true, visible: true, enabled: true, sessionReady: true }
  assert.equal(shouldRunExampleTracking(ready), true)
  for (const field of ['playing', 'visible', 'enabled', 'sessionReady'] as const) {
    assert.equal(shouldRunExampleTracking({ ...ready, [field]: false }), false, field)
  }
  assert.equal(EXAMPLE_OBSERVATION_INTERVAL_MS, 1000 / 12)
})

test('exampleTrackingStatus reports a single status in priority order', () => {
  const base = { playing: true, visible: true, enabled: true, sessionReady: true, unavailable: false }
  assert.equal(exampleTrackingStatus(base), 'tracking')
  assert.equal(exampleTrackingStatus({ ...base, playing: false }), 'paused')
  assert.equal(exampleTrackingStatus({ ...base, sessionReady: false }), 'loading')
  assert.equal(exampleTrackingStatus({ ...base, visible: false }), 'hidden')
  assert.equal(exampleTrackingStatus({ ...base, enabled: false }), 'disabled')
  assert.equal(exampleTrackingStatus({ ...base, unavailable: true }), 'unavailable')
})

test('exampleTrackingStatus keeps higher-priority states when several apply', () => {
  const base = { playing: false, visible: false, enabled: false, sessionReady: false, unavailable: false }
  assert.equal(exampleTrackingStatus({ ...base, enabled: true, visible: true, sessionReady: true }), 'paused')
  assert.equal(exampleTrackingStatus({ ...base, enabled: true, visible: true }), 'loading')
  assert.equal(exampleTrackingStatus({ ...base, enabled: true }), 'hidden')
  assert.equal(exampleTrackingStatus(base), 'disabled')
  assert.equal(exampleTrackingStatus({ ...base, unavailable: true }), 'unavailable')
})

test('example commentary reports observed visibility, not gait or fit conclusions', () => {
  assert.equal(exampleObservationLine({ status: 'tracking', framing }), 'Hips and both feet are tracked in this generated scene.')
  assert.equal(exampleObservationLine({ status: 'tracking', framing: { ...framing, feet: false } }), 'Hips are tracked; both feet are not reliably visible.')
  assert.match(exampleObservationLine({ status: 'tracking', framing: { person: false, hips: false, feet: false } }), /Looking for visible landmarks/)
  assert.match(exampleObservationLine({ status: 'tracking', framing: { ...framing, hips: false } }), /occluded/)
  for (const status of ['loading', 'tracking', 'paused', 'hidden', 'disabled', 'unavailable'] as const) {
    const line = exampleObservationLine({ status, framing })
    assert.ok(line.length > 0)
    assert.doesNotMatch(line, /cadence|overstride|diagnos|shoe fits|in stock|confidence.*\d/i)
  }
})
