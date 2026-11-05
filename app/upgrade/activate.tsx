'use client'

import { useState } from 'react'

/**
 * Demo activation until a payment provider is configured — sets the tier
 * cookie without a checkout. When NEXT_PUBLIC_PAYPAL_PRO_LINK is set the
 * page shows a real PayPal button instead.
 */
export function ActivatePro({ activate }: { activate: (tier: 'free' | 'pro') => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={state !== 'idle'}
        onClick={async () => {
          setState('busy')
          await activate('pro')
          setState('done')
        }}
        className="w-fit rounded-sm border-2 border-foreground bg-foreground px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-background transition-transform hover:scale-[1.02] disabled:opacity-50"
      >
        {state === 'done' ? 'Pro active' : 'Activate Pro'}
      </button>
      <p className="text-xs leading-relaxed text-muted-foreground">
        No payment provider is configured yet — this activates Pro directly (demo flow).
      </p>
    </div>
  )
}
