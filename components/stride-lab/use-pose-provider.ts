'use client'

import { useEffect, useState } from 'react'
import { POSE_PROVIDERS, getPoseProvider } from '@/lib/pose/providers'
import type { PoseSession } from '@/lib/pose/types'

export type SessionState = { status: 'loading' } | { status: 'ready'; session: PoseSession } | { status: 'error'; message: string }

/**
 * Loads and owns the active pose-engine session. Reloads when providerId
 * changes; consumers set the loading status themselves in their change handler
 * so the status transition and the session swap stay in one place.
 */
export function usePoseProvider() {
  const [providerId, setProviderId] = useState(POSE_PROVIDERS[0].id)
  const [state, setState] = useState<SessionState>({ status: 'loading' })
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let session: PoseSession | null = null
    getPoseProvider(providerId)
      .load()
      .then((loaded) => {
        if (cancelled) return loaded.dispose()
        session = loaded
        loaded.onStatus?.(setStatus)
        setState({ status: 'ready', session: loaded })
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ status: 'error', message: error.message })
      })
    return () => {
      cancelled = true
      session?.dispose()
    }
  }, [providerId])

  const beginLoad = () => {
    setState({ status: 'loading' })
    setStatus(null)
  }

  return { providerId, setProviderId, state, status, beginLoad }
}
