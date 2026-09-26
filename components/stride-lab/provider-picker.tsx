import { cn } from '@/lib/utils'
import type { PoseProvider } from '@/lib/pose/types'

interface ProviderPickerProps {
  providers: PoseProvider[]
  value: string
  onChange: (id: string) => void
  /** Live progress or fallback message for the selected provider. */
  status?: string | null
}

export function ProviderPicker({ providers, value, onChange, status }: ProviderPickerProps) {
  return (
    <fieldset className="flex flex-col gap-2 border-t border-border pt-5">
      <legend className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-foreground engraved">
        Vision provider
      </legend>
      {providers.map((provider) => {
        const selected = provider.id === value
        return (
          <label
            key={provider.id}
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
              onChange={() => onChange(provider.id)}
              className="sr-only"
            />
            <span className="led shrink-0" data-state={selected ? 'on' : 'off'} aria-hidden />
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-semibold text-foreground">{provider.label}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                  {provider.available ? provider.detail : provider.unavailableReason}
                </span>
                {selected && status && (
                  <span className="mt-1 font-mono text-xs leading-relaxed text-foreground" role="status">
                    {status}
                  </span>
                )}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
