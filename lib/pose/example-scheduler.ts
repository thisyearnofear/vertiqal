export interface TrackerLoopOptions {
  requestFrame: (callback: () => void) => number
  cancelFrame: (handle: number) => void
  canRun: () => boolean
  minIntervalMs: number
  onInfer: () => void
  onError?: () => void
  now?: () => number
}

export function createTrackerLoop({ requestFrame, cancelFrame, canRun, minIntervalMs, onInfer, onError, now = () => performance.now() }: TrackerLoopOptions) {
  let handle: number | null = null
  let token: object | null = null
  let lastInfer = -Infinity
  let disposed = false

  const schedule = () => {
    const scheduled = {}
    token = scheduled
    handle = requestFrame(() => {
      if (token !== scheduled) return
      handle = null
      token = null
      tick()
    })
  }

  const tick = () => {
    if (disposed || !canRun()) return
    const time = now()
    if (time - lastInfer >= minIntervalMs) {
      lastInfer = time
      try {
        onInfer()
      } catch {
        disposed = true
        onError?.()
        return
      }
      if (disposed || !canRun() || handle !== null) return
    }
    schedule()
  }

  const clear = () => {
    token = null
    if (handle !== null) {
      cancelFrame(handle)
      handle = null
    }
  }

  return {
    sync() {
      if (disposed) return
      if (canRun()) {
        if (handle === null) schedule()
      } else {
        clear()
      }
    },
    dispose() {
      disposed = true
      clear()
    },
    get pending() {
      return handle !== null
    },
  }
}
