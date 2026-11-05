'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Two-tap inline confirm for destructive actions — first tap arms (the control
 * should say what will be lost), second tap within the window confirms. Keeps
 * destructive choices in the design language instead of window.confirm.
 */
export function useInlineConfirm(timeoutMs = 4500) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<number | null>(null)

  const disarm = useCallback(() => {
    setArmed(false)
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const arm = useCallback(() => {
    setArmed(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setArmed(false), timeoutMs)
  }, [timeoutMs])

  /** True when the tap should proceed: either armed already or nothing to lose. */
  const confirm = useCallback(() => {
    if (armed) {
      disarm()
      return true
    }
    arm()
    return false
  }, [armed, arm, disarm])

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  return { armed, confirm, disarm }
}
