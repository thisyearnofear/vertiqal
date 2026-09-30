import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GaitSnapshot, Side, Strike } from '../metrics/gait.ts'
import type { Pose } from './types.ts'
import {
  MAX_VALIDATION_FRAMES,
  VALIDATION_ALGORITHM_VERSION,
  compareValidationCapture,
  createValidationRecorder,
  parseValidationCapture,
  type ValidationAnnotations,
  type ValidationCapture,
  type ValidationContact,
} from './validation.ts'

const point = (x = 0.5, y = 0.5) => ({ x, y, score: 1 })
const visiblePose = (): Pose => ({ nose: point(), left_hip: point(), right_hip: point(), left_ankle: point(), right_ankle: point(), left_heel: point(), right_foot: point() })
const metadata = () => ({ captureId: 'synthetic-unit-test', sourceKind: 'synthetic' as const, providerId: 'synthetic-unit-test', heightCm: null })
const event = (timeSec: number, side: Side = 'left'): ValidationContact => ({ timeSec, side })
const strike = (timeSec: number, side: Side = 'left'): Strike => ({ ...event(timeSec, side), overstrideCm: 0, kneeAngle: 0, ankle: { x: 0.5, y: 0.5 }, hipX: 0.5 })
const snapshot = (timeSec: number, recentStrikes: Strike[] = []): GaitSnapshot => ({
  sport: 'running', timeSec, direction: 1, kneeAngle: {}, trunkLeanDeg: null, cadenceSpm: null,
  lastStrike: recentStrikes[0] ?? null, recentStrikes, totalStrikes: recentStrikes.length,
  framing: { person: false, hips: false, feet: false }, avgOverstrideCm: null, avgKneeAtStrike: null,
})
const capture = (contacts: ValidationContact[] = []): ValidationCapture => ({
  ...metadata(), schemaVersion: 1, sport: 'running', algorithmVersion: VALIDATION_ALGORITHM_VERSION,
  width: 1280, height: 720, frames: [0, 1, 2, 3, 4].map((timeSec) => ({ timeSec, pose: visiblePose() })),
  contacts, stopReason: 'user', truncated: false,
})
const annotations = (contacts: ValidationContact[] = []): ValidationAnnotations => ({
  schemaVersion: 1, captureId: 'synthetic-unit-test', source: 'manual', referenceNotes: 'Fabricated events for matcher unit testing only; not human motion validation.',
  complete: true, interval: { startSec: 0, endSec: 4 }, excludedIntervals: [], contacts,
})

test('comparison uses same-side one-to-one matches and explicit denominators', () => {
  const p = capture([event(0.52), event(1.04, 'right'), event(2.5)])
  const r = annotations([event(0.5), event(1, 'right'), event(3)])
  const report = compareValidationCapture(p, r, 50)
  assert.equal(report.detectedContacts, 3)
  assert.equal(report.referenceContacts, 3)
  assert.equal(report.matchedContacts, 2)
  assert.equal(report.precision, 2 / 3)
  assert.equal(report.recall, 2 / 3)
  assert.ok(Math.abs(report.meanAbsoluteTimingErrorMs! - 30) < 1e-9)
  assert.ok(Math.abs(report.maxAbsoluteTimingErrorMs! - 40) < 1e-9)
  assert.deepEqual(report.extraContacts, [event(2.5)])
  assert.deepEqual(report.missedContacts, [event(3)])
  assert.equal(report.dataBasis, 'debug-only')
  assert.equal('passed' in report, false)
})

test('left contacts never match right annotations even at identical timestamps', () => {
  const report = compareValidationCapture(capture([event(1, 'left')]), annotations([event(1, 'right')]), 100)
  assert.equal(report.matchedContacts, 0)
  assert.equal(report.precision, 0)
  assert.equal(report.recall, 0)
  assert.equal(report.meanAbsoluteTimingErrorMs, null)
})

test('matcher maximises cardinality before minimising error instead of greedy nearest assignment', () => {
  const report = compareValidationCapture(capture([event(0.1), event(0.3)]), annotations([event(0), event(0.2)]), 150)
  assert.equal(report.matchedContacts, 2)
  assert.deepEqual(report.matches.map((m) => [m.detectedTimeSec, m.referenceTimeSec]), [[0.1, 0], [0.3, 0.2]])
})

test('matcher agrees with an exhaustive independent assignment oracle on small synthetic sets', () => {
  const values = [0, 0.1, 0.2, 0.3]
  const subsets = Array.from({ length: 16 }, (_, mask) => values.filter((_, i) => mask & (1 << i)))
  const oracle = (predicted: number[], reference: number[]) => {
    let bestCount = -1
    let bestError = Infinity
    const walk = (at: number, used: Set<number>, count: number, error: number) => {
      if (at === predicted.length) {
        if (count > bestCount || (count === bestCount && error < bestError)) { bestCount = count; bestError = error }
        return
      }
      walk(at + 1, used, count, error)
      reference.forEach((timeSec, index) => {
        const delta = Math.abs(predicted[at] - timeSec) * 1000
        if (used.has(index) || delta > 150 + 1e-9) return
        const next = new Set(used)
        next.add(index)
        walk(at + 1, next, count + 1, error + delta)
      })
    }
    walk(0, new Set(), 0, 0)
    return { count: bestCount, error: bestError }
  }
  for (const p of subsets) {
    for (const r of subsets) {
      const expected = oracle(p, r)
      const actual = compareValidationCapture(capture(p.map((t) => event(t))), annotations(r.map((t) => event(t))), 150)
      assert.equal(actual.matchedContacts, expected.count)
      const error = actual.matches.reduce((sum, match) => sum + Math.abs(match.signedErrorMs), 0)
      assert.ok(Math.abs(error - expected.error) < 1e-9)
    }
  }
})

test('equal cardinality chooses lower total absolute timing error', () => {
  const report = compareValidationCapture(capture([event(0.09), event(0.12)]), annotations([event(0.1)]), 50)
  assert.equal(report.matches[0].detectedTimeSec, 0.09)
  assert.deepEqual(report.extraContacts, [event(0.12)])
})

test('matching tolerance is required, inclusive, and not an accuracy gate', () => {
  const p = capture([event(0.78)])
  const r = annotations([event(0.7)])
  assert.equal(compareValidationCapture(p, r, 80).matchedContacts, 1)
  assert.equal(compareValidationCapture(p, r, 79).matchedContacts, 0)
  for (const bad of [0, -1, NaN, Infinity]) assert.throws(() => compareValidationCapture(p, r, bad), /positive matching tolerance/)
})

test('empty contact denominators produce null rather than perfect scores', () => {
  const report = compareValidationCapture(capture(), annotations(), 50)
  assert.equal(report.precision, null)
  assert.equal(report.recall, null)
  assert.equal(report.meanAbsoluteTimingErrorMs, null)
  assert.equal(report.maxAbsoluteTimingErrorMs, null)
})

test('annotation interval and explicit exclusions control both denominators transparently', () => {
  const p = capture([event(0.2), event(0.6), event(1.1), event(3.5)])
  const r = { ...annotations([event(1.1)]), interval: { startSec: 0.5, endSec: 3 }, excludedIntervals: [{ startSec: 0.5, endSec: 0.7, reason: 'Unusable view in synthetic fixture' }] }
  const report = compareValidationCapture(p, r, 50)
  assert.equal(report.detectedContacts, 1)
  assert.equal(report.matchedContacts, 1)
  assert.equal(report.detectedOutsideInterval, 2)
  assert.equal(report.detectedInExcludedIntervals, 1)
  assert.equal(report.processedFrameCoverage.evaluatedFrames, 3)
  assert.throws(() => compareValidationCapture(p, { ...r, contacts: [event(0.6)] }, 50), /outside exclusions/)
})

test('rejects overlapping or invalid intervals, incomplete annotations and mismatched capture identity', () => {
  const p = capture()
  const r = annotations()
  assert.throws(() => compareValidationCapture(p, { ...r, captureId: 'another-clip' }, 50), /captureId/)
  assert.throws(() => compareValidationCapture(p, { ...r, complete: false }, 50))
  assert.throws(() => compareValidationCapture(p, { ...r, interval: { startSec: 2, endSec: 1 } }, 50), /interval/)
  assert.throws(() => compareValidationCapture(p, { ...r, interval: { startSec: 0, endSec: 5 } }, 50), /timeline/)
  assert.throws(() => compareValidationCapture(p, { ...r, excludedIntervals: [{ startSec: 0, endSec: 2, reason: 'a' }, { startSec: 1, endSec: 3, reason: 'b' }] }, 50), /overlap/)
  assert.throws(() => compareValidationCapture(p, { ...r, excludedIntervals: [{ startSec: 0, endSec: 4, reason: 'all excluded' }] }, 50), /No processed frames/)
})

test('capture validation rejects unsorted clocks, duplicate events and non-finite keypoints', () => {
  const p = capture()
  assert.throws(() => parseValidationCapture({ ...p, frames: [p.frames[1], p.frames[0]] }), /strictly increase/)
  assert.throws(() => parseValidationCapture({ ...p, contacts: [event(1), event(1)] }), /Duplicate/)
  assert.throws(() => compareValidationCapture(p, annotations([event(1), event(1)]), 50), /Duplicate/)
  assert.throws(() => parseValidationCapture({ ...p, contacts: [event(5)] }), /captured frame interval/)
  assert.throws(() => parseValidationCapture({ ...p, frames: [{ timeSec: 0, pose: { nose: point(NaN) } }] }))
  assert.throws(() => parseValidationCapture({ ...p, filename: 'private-name.mp4' }))
})

test('processed-frame coverage describes missing poses without interpreting it as elapsed-time coverage', () => {
  const p = capture()
  p.frames[2].pose = null
  const report = compareValidationCapture(p, annotations(), 50)
  assert.equal(report.processedFrameCoverage.evaluatedFrames, 5)
  assert.equal(report.processedFrameCoverage.personVisibleFrames, 4)
  assert.equal(report.processedFrameCoverage.hipsVisibleFrames, 4)
  assert.equal(report.processedFrameCoverage.feetVisibleFrames, 4)
  assert.equal(report.processedFrameCoverage.missingPoseFrames, 1)
  assert.match(report.processedFrameCoverage.note, /not elapsed-time coverage/)
  assert.equal(compareValidationCapture({ ...p, sourceKind: 'unclassified' }, annotations(), 50).dataBasis, 'debug-only')
  assert.equal(compareValidationCapture({ ...p, sourceKind: 'real-consented' }, annotations(), 50).dataBasis, 'declared-real-person')
})

test('recorder copies processed poses, deduplicates contacts and excludes pre-recording events', () => {
  const recorder = createValidationRecorder(metadata())
  const pose = visiblePose()
  recorder.record(1, pose, 1280, 720, snapshot(1, [strike(0.8)]))
  pose.left_hip!.x = 0.9
  recorder.record(1.1, null, 1280, 720, snapshot(1.1, [strike(1), strike(1, 'right')]))
  recorder.record(1.2, null, 1280, 720, snapshot(1.2, [strike(1), strike(1, 'right')]))
  const p = recorder.finish()!
  assert.equal(p.frames[0].pose!.left_hip!.x, 0.5)
  assert.deepEqual(p.contacts, [event(1), event(1, 'right')])
  assert.equal(p.stopReason, 'user')
  assert.equal(p.truncated, false)
  assert.equal('filename' in p, false)
  assert.equal('images' in p, false)
  assert.equal('sourceUrl' in p, false)
})

test('recorder stops on the first rewind and never appends a second pass', () => {
  const recorder = createValidationRecorder(metadata())
  recorder.record(0, null, 1280, 720, snapshot(0))
  recorder.record(1, null, 1280, 720, snapshot(1, [strike(0.5)]))
  recorder.record(0, null, 1280, 720, snapshot(0))
  recorder.record(2, null, 1280, 720, snapshot(2))
  const p = recorder.finish()!
  assert.equal(p.stopReason, 'rewind')
  assert.equal(p.frames.length, 2)
  assert.deepEqual(p.contacts, [event(0.5)])
  assert.equal(p.truncated, false)
})

test('recorder stops on dimensions change and ignores repeated timestamps', () => {
  const recorder = createValidationRecorder(metadata())
  recorder.record(0, null, 1280, 720, snapshot(0))
  recorder.record(0, null, 1280, 720, snapshot(0))
  assert.equal(recorder.frameCount, 1)
  recorder.record(1, null, 640, 480, snapshot(1))
  const p = recorder.finish()!
  assert.equal(p.stopReason, 'dimensions-changed')
  assert.equal(p.frames.length, 1)
  assert.equal(p.width, 1280)
  assert.equal(p.height, 720)
})

test('empty recorder cannot export, invalid metadata is refused', () => {
  assert.equal(createValidationRecorder(metadata()).finish(), null)
  assert.throws(() => createValidationRecorder({ ...metadata(), heightCm: 500 }))
})

test('resource-limited captures are marked truncated and cannot be scored', () => {
  const recorder = createValidationRecorder(metadata())
  for (let i = 0; i <= MAX_VALIDATION_FRAMES; i++) recorder.record(i, null, 1280, 720, snapshot(i))
  const p = recorder.finish()!
  assert.equal(p.frames.length, MAX_VALIDATION_FRAMES)
  assert.equal(p.stopReason, 'limit')
  assert.equal(p.truncated, true)
  assert.throws(() => compareValidationCapture(p, annotations(), 50), /Truncated capture/)
})
