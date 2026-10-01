import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTrackerLoop } from './example-scheduler.ts'
import { createOwnedSessionLoader } from './example-session.ts'
import type { PoseSession } from './types.ts'

function fakeClock() {
  const callbacks = new Map<number, () => void>()
  const cancelled: number[] = []
  let next = 0
  let time = 0
  return {
    callbacks,
    cancelled,
    now: () => time,
    set: (t: number) => {
      time = t
    },
    advance: (ms: number) => {
      time += ms
    },
    requestFrame: (cb: () => void) => {
      const handle = next++
      callbacks.set(handle, cb)
      return handle
    },
    cancelFrame: (h: number) => {
      cancelled.push(h)
      callbacks.delete(h)
    },
    step: () => {
      const entry = [...callbacks.entries()][0]
      assert.ok(entry, 'expected a pending frame callback')
      callbacks.delete(entry[0])
      entry[1]()
    },
    pendingCount: () => callbacks.size,
  }
}

test('paused state never schedules a frame callback', () => {
  const clock = fakeClock()
  const loop = createTrackerLoop({ ...clock, canRun: () => false, minIntervalMs: 0, onInfer: () => {} })
  loop.sync()
  assert.equal(clock.pendingCount(), 0)
})

test('running state schedules exactly one callback; repeated sync does not stack', () => {
  const clock = fakeClock()
  let inferred = 0
  const loop = createTrackerLoop({ ...clock, canRun: () => true, minIntervalMs: 0, onInfer: () => inferred++ })
  loop.sync()
  loop.sync()
  assert.equal(clock.pendingCount(), 1)
  clock.step()
  assert.equal(inferred, 1)
  assert.equal(clock.pendingCount(), 1)
})

test('the first eligible frame infers immediately, then minInterval is exact', () => {
  const clock = fakeClock()
  let inferred = 0
  const loop = createTrackerLoop({ ...clock, canRun: () => true, minIntervalMs: 100, onInfer: () => inferred++ })
  loop.sync()
  clock.step()
  assert.equal(inferred, 1)
  clock.set(99)
  clock.step()
  assert.equal(inferred, 1)
  clock.set(100)
  clock.step()
  assert.equal(inferred, 2)
  clock.set(199)
  clock.step()
  assert.equal(inferred, 2)
  clock.set(200)
  clock.step()
  assert.equal(inferred, 3)
  assert.ok(clock.pendingCount() <= 1)
})

test('pause cancels the outstanding handle and resume schedules inference when the interval elapsed', () => {
  const clock = fakeClock()
  let running = true
  let inferred = 0
  const loop = createTrackerLoop({ ...clock, canRun: () => running, minIntervalMs: 100, onInfer: () => inferred++ })
  loop.sync()
  clock.step()
  assert.equal(inferred, 1)
  running = false
  loop.sync()
  assert.equal(clock.cancelled.length, 1)
  assert.equal(clock.pendingCount(), 0)
  clock.set(500)
  running = true
  loop.sync()
  assert.equal(clock.pendingCount(), 1)
  clock.step()
  assert.equal(inferred, 2)
})

test('a stale captured callback after cancel and resume does not disturb the new pending handle', () => {
  const clock = fakeClock()
  let running = true
  let inferred = 0
  let captured: (() => void) | null = null
  const loop = createTrackerLoop({
    requestFrame: (cb) => {
      captured = cb
      return clock.requestFrame(cb)
    },
    cancelFrame: clock.cancelFrame,
    canRun: () => running,
    minIntervalMs: 0,
    onInfer: () => inferred++,
    now: clock.now,
  })
  loop.sync()
  running = false
  loop.sync()
  const stale: (() => void) | null = captured
  running = true
  loop.sync()
  assert.equal(clock.pendingCount(), 1)
  assert.notEqual(captured, stale)
  stale!()
  assert.equal(inferred, 0)
  assert.equal(loop.pending, true)
  assert.equal(clock.pendingCount(), 1)
  clock.step()
  assert.equal(inferred, 1)
})

test('a callback captured before dispose does nothing when invoked afterward', () => {
  const clock = fakeClock()
  let inferred = 0
  let captured: (() => void) | null = null
  const loop = createTrackerLoop({
    requestFrame: (cb) => {
      captured = cb
      return clock.requestFrame(cb)
    },
    cancelFrame: clock.cancelFrame,
    canRun: () => true,
    minIntervalMs: 0,
    onInfer: () => inferred++,
    now: clock.now,
  })
  loop.sync()
  loop.dispose()
  captured!()
  assert.equal(inferred, 0)
  assert.equal(loop.pending, false)
  assert.equal(clock.pendingCount(), 0)
})

test('dispose is idempotent', () => {
  const clock = fakeClock()
  const loop = createTrackerLoop({ ...clock, canRun: () => true, minIntervalMs: 0, onInfer: () => {} })
  loop.sync()
  loop.dispose()
  loop.dispose()
  assert.equal(clock.cancelled.length, 1)
  assert.equal(loop.pending, false)
})

test('an inference error marks the loop failed once and cancels scheduling', () => {
  const clock = fakeClock()
  let errors = 0
  const loop = createTrackerLoop({
    ...clock,
    canRun: () => true,
    minIntervalMs: 0,
    onInfer: () => {
      throw new Error('detector crashed')
    },
    onError: () => errors++,
  })
  loop.sync()
  clock.step()
  assert.equal(errors, 1)
  assert.equal(clock.pendingCount(), 0)
  loop.sync()
  assert.equal(clock.pendingCount(), 0)
  assert.equal(errors, 1)
})

test('onInfer disposing the loop prevents further scheduling', () => {
  const clock = fakeClock()
  let inferred = 0
  const loop = createTrackerLoop({
    ...clock,
    canRun: () => true,
    minIntervalMs: 0,
    onInfer: () => {
      inferred++
      loop.dispose()
    },
  })
  loop.sync()
  clock.step()
  assert.equal(inferred, 1)
  assert.equal(clock.pendingCount(), 0)
})

test('onInfer flipping canRun off or syncing stops without double scheduling', () => {
  const clock = fakeClock()
  let running = true
  let inferred = 0
  const loop = createTrackerLoop({
    ...clock,
    canRun: () => running,
    minIntervalMs: 0,
    onInfer: () => {
      inferred++
      running = false
      loop.sync()
    },
  })
  loop.sync()
  clock.step()
  assert.equal(inferred, 1)
  assert.equal(clock.pendingCount(), 0)
  running = true
  inferred = 0
  const doubling = createTrackerLoop({
    ...clock,
    canRun: () => running,
    minIntervalMs: 0,
    onInfer: () => {
      inferred++
      doubling.sync()
    },
  })
  doubling.sync()
  clock.step()
  assert.equal(inferred, 1)
  assert.equal(clock.pendingCount(), 1)
})

test('handle value 0 is treated as a pending callback', () => {
  const clock = fakeClock()
  let running = true
  const loop = createTrackerLoop({ ...clock, canRun: () => running, minIntervalMs: 0, onInfer: () => {} })
  loop.sync()
  assert.equal(clock.callbacks.has(0), true)
  running = false
  loop.sync()
  assert.equal(clock.cancelled[0], 0)
})

const fakeSession = (): PoseSession & { disposed: number } => {
  const counter = { disposed: 0 }
  return Object.assign(counter, { poseAt: () => null, dispose: () => { counter.disposed++ } })
}

test('disposing an owned loader disposes its own session only', async () => {
  const session = fakeSession()
  const borrowed = fakeSession()
  let ready: PoseSession | null = null
  const loader = createOwnedSessionLoader(async () => session, (s) => { ready = s }, () => {})
  await Promise.resolve()
  assert.equal(ready, session)
  loader.dispose()
  assert.equal(session.disposed, 1)
  assert.equal(borrowed.disposed, 0)
})

test('a load resolving after disposal is disposed without reporting ready', async () => {
  const session = fakeSession()
  let resolve!: (s: PoseSession) => void
  let readyCalled = false
  const loader = createOwnedSessionLoader(
    () => new Promise<PoseSession>((r) => { resolve = r }),
    () => { readyCalled = true },
    () => {},
  )
  loader.dispose()
  resolve(session)
  await Promise.resolve()
  assert.equal(readyCalled, false)
  assert.equal(session.disposed, 1)
})

test('a load rejecting after disposal does not call onFail', async () => {
  let reject!: (e: unknown) => void
  let failed = false
  const loader = createOwnedSessionLoader(
    () => new Promise<PoseSession>((_, r) => { reject = r }),
    () => {},
    () => { failed = true },
  )
  loader.dispose()
  reject(new Error('load failed'))
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(failed, false)
})
