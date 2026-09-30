import { z } from 'zod'
import { KEYPOINT_NAMES, type KeypointName, type Pose } from './types.ts'
import { frameQuality } from './framing.ts'
import type { GaitSnapshot, Side } from '../metrics/gait.ts'

export const MAX_VALIDATION_FRAMES = 18_000
export const MAX_VALIDATION_CONTACTS = 2_000
export const VALIDATION_ALGORITHM_VERSION = 'forma-2d-running-events/1'
export type ValidationSource = 'unclassified' | 'real-consented' | 'synthetic'
export type ValidationStopReason = 'user' | 'rewind' | 'limit' | 'dimensions-changed'
export interface ValidationContact { timeSec: number; side: Side }
export interface ValidationFrame { timeSec: number; pose: Pose | null }
export interface ValidationMetadata {
  captureId: string
  sourceKind: ValidationSource
  providerId: string
  heightCm: number | null
}
export interface ValidationCapture extends ValidationMetadata {
  schemaVersion: 1
  sport: 'running'
  algorithmVersion: string
  width: number
  height: number
  frames: ValidationFrame[]
  contacts: ValidationContact[]
  stopReason: ValidationStopReason
  truncated: boolean
}

const time = z.number().finite().nonnegative()
const contactSchema = z.object({ timeSec: time, side: z.enum(['left', 'right']) }).strict()
const keypointSchema = z.object({ x: z.number().finite(), y: z.number().finite(), score: z.number().finite().min(0).max(1) }).strict()
const poseShape = Object.fromEntries(KEYPOINT_NAMES.map((name) => [name, keypointSchema.optional()])) as Record<KeypointName, z.ZodOptional<typeof keypointSchema>>
const metadataSchema = z.object({
  captureId: z.string().min(1).max(100),
  sourceKind: z.enum(['unclassified', 'real-consented', 'synthetic']),
  providerId: z.string().min(1).max(100),
  heightCm: z.number().finite().min(120).max(220).nullable(),
}).strict()
const captureSchema = metadataSchema.extend({
  schemaVersion: z.literal(1),
  sport: z.literal('running'),
  algorithmVersion: z.string().min(1).max(100),
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
  frames: z.array(z.object({ timeSec: time, pose: z.object(poseShape).strict().nullable() }).strict()).min(1).max(MAX_VALIDATION_FRAMES),
  contacts: z.array(contactSchema).max(MAX_VALIDATION_CONTACTS),
  stopReason: z.enum(['user', 'rewind', 'limit', 'dimensions-changed']),
  truncated: z.boolean(),
}).strict()
const intervalSchema = z.object({ startSec: time, endSec: time }).strict()
const annotationSchema = z.object({
  schemaVersion: z.literal(1),
  captureId: z.string().min(1).max(100),
  source: z.enum(['manual', 'calibrated-multicamera']),
  referenceNotes: z.string().min(1).max(2_000),
  complete: z.literal(true),
  interval: intervalSchema,
  excludedIntervals: z.array(intervalSchema.extend({ reason: z.string().min(1).max(300) }).strict()).max(1_000),
  contacts: z.array(contactSchema).max(MAX_VALIDATION_CONTACTS),
}).strict()
export type ValidationAnnotations = z.infer<typeof annotationSchema>

const inInterval = (t: number, interval: { startSec: number; endSec: number }) => t >= interval.startSec && t <= interval.endSec
const contactKey = (event: ValidationContact) => `${event.side}:${event.timeSec}`

function assertContacts(contacts: ValidationContact[]) {
  const seen = new Set<string>()
  for (const event of contacts) {
    const key = contactKey(event)
    if (seen.has(key)) throw new Error(`Duplicate ${event.side} contact at ${event.timeSec}s`)
    seen.add(key)
  }
}

export function parseValidationCapture(input: unknown): ValidationCapture {
  const capture = captureSchema.parse(input)
  for (let i = 1; i < capture.frames.length; i++) {
    if (capture.frames[i].timeSec <= capture.frames[i - 1].timeSec) throw new Error('Capture timestamps must strictly increase; export one continuous pass')
  }
  const interval = { startSec: capture.frames[0].timeSec, endSec: capture.frames.at(-1)!.timeSec }
  if (capture.contacts.some((event) => !inInterval(event.timeSec, interval))) throw new Error('Detected contacts must fall within the captured frame interval')
  assertContacts(capture.contacts)
  return capture
}

export function createValidationRecorder(metadata: ValidationMetadata) {
  metadataSchema.parse(metadata)
  const frames: ValidationFrame[] = []
  const contacts = new Map<string, ValidationContact>()
  let width = 0
  let height = 0
  let stopped: ValidationStopReason | null = null
  const stop = (reason: ValidationStopReason) => { stopped ??= reason }
  return {
    get frameCount() { return frames.length },
    get stopReason() { return stopped },
    record(timeSec: number, pose: Pose | null, frameWidth: number, frameHeight: number, snapshot: GaitSnapshot) {
      if (stopped) return
      if (!Number.isFinite(timeSec) || timeSec < 0 || !Number.isInteger(frameWidth) || !Number.isInteger(frameHeight) || frameWidth <= 0 || frameHeight <= 0) return
      const previous = frames.at(-1)
      if (previous && timeSec < previous.timeSec) { stop('rewind'); return }
      if (previous && timeSec === previous.timeSec) return
      if (frames.length && (width !== frameWidth || height !== frameHeight)) { stop('dimensions-changed'); return }
      if (frames.length >= MAX_VALIDATION_FRAMES) { stop('limit'); return }
      width = frameWidth
      height = frameHeight
      const saved: Pose = {}
      if (pose) {
        for (const name of KEYPOINT_NAMES) {
          const point = pose[name]
          if (point && keypointSchema.safeParse(point).success) saved[name] = { x: point.x, y: point.y, score: point.score }
        }
      }
      frames.push({ timeSec, pose: Object.keys(saved).length ? saved : null })
      const start = frames[0].timeSec
      for (const event of snapshot.recentStrikes) {
        if (event.timeSec < start || event.timeSec > timeSec) continue
        const key = contactKey(event)
        if (!contacts.has(key) && contacts.size >= MAX_VALIDATION_CONTACTS) { stop('limit'); return }
        contacts.set(key, { timeSec: event.timeSec, side: event.side })
      }
    },
    finish(): ValidationCapture | null {
      stop('user')
      if (!frames.length) return null
      return parseValidationCapture({
        ...metadata,
        schemaVersion: 1,
        sport: 'running',
        algorithmVersion: VALIDATION_ALGORITHM_VERSION,
        width,
        height,
        frames: frames.map((frame) => ({ timeSec: frame.timeSec, pose: frame.pose ? structuredClone(frame.pose) : null })),
        contacts: Array.from(contacts.values()).sort((a, b) => a.timeSec - b.timeSec || a.side.localeCompare(b.side)),
        stopReason: stopped,
        truncated: stopped === 'limit',
      })
    },
  }
}

interface ContactMatch {
  side: Side
  referenceTimeSec: number
  detectedTimeSec: number
  signedErrorMs: number
}

function matchSide(predicted: ValidationContact[], reference: ValidationContact[], toleranceMs: number): ContactMatch[] {
  const p = [...predicted].sort((a, b) => a.timeSec - b.timeSec)
  const r = [...reference].sort((a, b) => a.timeSec - b.timeSec)
  const cols = r.length + 1
  const cells = (p.length + 1) * cols
  const counts = new Uint16Array(cells)
  const errors = new Float64Array(cells)
  const choices = new Uint8Array(cells)
  for (let i = 1; i <= p.length; i++) {
    for (let j = 1; j <= r.length; j++) {
      const at = i * cols + j
      const above = (i - 1) * cols + j
      const left = at - 1
      counts[at] = counts[above]
      errors[at] = errors[above]
      if (counts[left] > counts[at] || (counts[left] === counts[at] && errors[left] < errors[at])) {
        counts[at] = counts[left]
        errors[at] = errors[left]
        choices[at] = 1
      }
      const delta = Math.abs(p[i - 1].timeSec - r[j - 1].timeSec) * 1000
      if (delta <= toleranceMs + 1e-9) {
        const diagonal = above - 1
        const count = counts[diagonal] + 1
        const error = errors[diagonal] + delta
        if (count > counts[at] || (count === counts[at] && error <= errors[at])) {
          counts[at] = count
          errors[at] = error
          choices[at] = 2
        }
      }
    }
  }
  const matches: ContactMatch[] = []
  let i = p.length
  let j = r.length
  while (i && j) {
    const choice = choices[i * cols + j]
    if (choice === 2) {
      matches.push({ side: p[i - 1].side, referenceTimeSec: r[j - 1].timeSec, detectedTimeSec: p[i - 1].timeSec, signedErrorMs: (p[i - 1].timeSec - r[j - 1].timeSec) * 1000 })
      i--
      j--
    } else if (choice === 1) j--
    else i--
  }
  return matches.reverse()
}

export function compareValidationCapture(input: unknown, referenceInput: unknown, toleranceMs: number) {
  if (!Number.isFinite(toleranceMs) || toleranceMs <= 0) throw new Error('Supply a positive matching tolerance in milliseconds; it is not an accuracy acceptance threshold')
  const capture = parseValidationCapture(input)
  const reference = annotationSchema.parse(referenceInput)
  if (capture.truncated) throw new Error('Truncated capture: recapture a shorter complete segment before comparison')
  if (reference.captureId !== capture.captureId) throw new Error('Annotation captureId does not match the exported capture')
  const start = capture.frames[0].timeSec
  const end = capture.frames.at(-1)!.timeSec
  const interval = reference.interval
  if (interval.endSec <= interval.startSec || interval.startSec < start || interval.endSec > end) throw new Error('Annotation interval must be non-empty and within the captured timeline')
  const exclusions = [...reference.excludedIntervals].sort((a, b) => a.startSec - b.startSec)
  for (let i = 0; i < exclusions.length; i++) {
    const item = exclusions[i]
    if (item.endSec <= item.startSec || item.startSec < interval.startSec || item.endSec > interval.endSec) throw new Error('Excluded intervals must be non-empty and within the annotation interval')
    if (i && item.startSec <= exclusions[i - 1].endSec) throw new Error('Excluded intervals must not overlap or share endpoints')
  }
  const excluded = (t: number) => exclusions.some((item) => inInterval(t, item))
  assertContacts(reference.contacts)
  if (reference.contacts.some((event) => !inInterval(event.timeSec, interval) || excluded(event.timeSec))) throw new Error('Reference contacts must be inside the annotation interval and outside exclusions')
  const predicted = capture.contacts.filter((event) => inInterval(event.timeSec, interval) && !excluded(event.timeSec))
  const matches = (['left', 'right'] as const).flatMap((side) => matchSide(predicted.filter((event) => event.side === side), reference.contacts.filter((event) => event.side === side), toleranceMs)).sort((a, b) => a.referenceTimeSec - b.referenceTimeSec)
  const matchedPredicted = new Set(matches.map((item) => contactKey({ side: item.side, timeSec: item.detectedTimeSec })))
  const matchedReference = new Set(matches.map((item) => contactKey({ side: item.side, timeSec: item.referenceTimeSec })))
  const evaluatedFrames = capture.frames.filter((frame) => inInterval(frame.timeSec, interval) && !excluded(frame.timeSec))
  if (!evaluatedFrames.length) throw new Error('No processed frames remain in the annotation interval after exclusions')
  const quality = evaluatedFrames.map((frame) => frameQuality(frame.pose))
  const countQuality = (key: 'person' | 'hips' | 'feet') => quality.filter((frame) => frame[key]).length
  const absoluteErrors = matches.map((item) => Math.abs(item.signedErrorMs))
  return {
    schemaVersion: 1,
    captureId: capture.captureId,
    dataBasis: capture.sourceKind === 'real-consented' ? 'declared-real-person' : 'debug-only',
    sourceKind: capture.sourceKind,
    providerId: capture.providerId,
    algorithmVersion: capture.algorithmVersion,
    referenceSource: reference.source,
    referenceNotes: reference.referenceNotes,
    interval,
    excludedIntervals: exclusions,
    matchingToleranceMs: toleranceMs,
    detectedContacts: predicted.length,
    referenceContacts: reference.contacts.length,
    matchedContacts: matches.length,
    precision: predicted.length ? matches.length / predicted.length : null,
    recall: reference.contacts.length ? matches.length / reference.contacts.length : null,
    meanAbsoluteTimingErrorMs: absoluteErrors.length ? absoluteErrors.reduce((sum, value) => sum + value, 0) / absoluteErrors.length : null,
    maxAbsoluteTimingErrorMs: absoluteErrors.length ? Math.max(...absoluteErrors) : null,
    missedContacts: reference.contacts.filter((event) => !matchedReference.has(contactKey(event))),
    extraContacts: predicted.filter((event) => !matchedPredicted.has(contactKey(event))),
    matches,
    detectedOutsideInterval: capture.contacts.filter((event) => !inInterval(event.timeSec, interval)).length,
    detectedInExcludedIntervals: capture.contacts.filter((event) => inInterval(event.timeSec, interval) && excluded(event.timeSec)).length,
    processedFrameCoverage: {
      evaluatedFrames: evaluatedFrames.length,
      personVisibleFrames: countQuality('person'),
      hipsVisibleFrames: countQuality('hips'),
      feetVisibleFrames: countQuality('feet'),
      missingPoseFrames: evaluatedFrames.filter((frame) => frame.pose === null).length,
      note: 'Counts describe processed frames, not elapsed-time coverage or all source-video frames.',
    },
    limitations: 'Comparison against supplied event annotations only. Consent and reference quality are user-declared. No clinical validity, shoe-fit validity, 3D reconstruction, or accuracy pass/fail is established.',
  }
}
