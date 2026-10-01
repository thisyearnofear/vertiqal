import type { PoseSession } from './types'

export interface OwnedSessionLoader {
  dispose: () => void
}

export function createOwnedSessionLoader(
  load: () => Promise<PoseSession>,
  onReady: (session: PoseSession) => void,
  onFail: () => void,
): OwnedSessionLoader {
  let cancelled = false
  let owned: PoseSession | null = null
  load()
    .then((session) => {
      if (cancelled) {
        session.dispose()
        return
      }
      owned = session
      onReady(session)
    })
    .catch(() => {
      if (!cancelled) onFail()
    })
  return {
    dispose() {
      cancelled = true
      owned?.dispose()
      owned = null
    },
  }
}
