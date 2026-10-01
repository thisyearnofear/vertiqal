import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { PoseProvider } from '@/lib/pose/types'

interface ProviderPickerProps {
  providers: PoseProvider[]
  value: string
  onChange: (id: string) => void
  /** Live progress or fallback message for the selected provider. */
  status?: string | null
}

const HOSTED_LABEL: Record<string, string> = {
  vlmrun: 'Sends sampled frames to VLM Run',
}

export function ProviderPicker({ providers, value, onChange, status }: ProviderPickerProps) {
  const [pending, setPending] = useState<string | null>(null)
  const [consented, setConsented] = useState<Record<string, boolean>>({})

  const request = (id: string) => {
    setPending(null)
    if (!HOSTED_LABEL[id] || consented[id]) return onChange(id)
    setPending(id)
  }

  const confirm = (id: string) => {
    setConsented((current) => ({ ...current, [id]: true }))
    setPending(null)
    onChange(id)
  }

  return (
    <fieldset className="flex flex-col gap-2 border-t border-border pt-5">
      <legend className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-foreground engraved">
        Vision provider
      </legend>
      {providers.map((provider) => {
        const selected = provider.id === value
        const hosted = HOSTED_LABEL[provider.id]
        return (
          <div key={provider.id} className="flex flex-col gap-2">
            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md p-3 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                selected ? 'housing' : 'well',
                !provider.available && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                name="pose-provider"
                value={provider.id}
                checked={selected}
                disabled={!provider.available}
                onChange={() => request(provider.id)}
                className="sr-only"
              />
              <span className="led shrink-0" data-state={selected ? 'on' : 'off'} aria-hidden />
              <span className="flex flex-1 flex-col">
                <span className="text-sm font-semibold text-foreground">{provider.label}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {provider.available ? provider.detail : provider.unavailableReason}
                  {hosted && ` · ${hosted}`}
                </span>
                {selected && status && (
                  <span className="mt-1 font-mono text-xs leading-relaxed text-foreground" role="status">
                    {status}
                  </span>
                )}
              </span>
            </label>
            {pending === provider.id && (
              <div className="well flex flex-col gap-2 rounded-md p-3" role="group" aria-label={`Confirm ${provider.label}`}>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Up to 16 still frames from your uploaded clip leave this device for hosted keypoint analysis. Live camera stays on-device.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    autoFocus
                    onClick={() => confirm(provider.id)}
                    className="rounded-sm border-2 border-primary bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    Send frames to VLM Run
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className="rounded-sm px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </fieldset>
  )
}
