import { cn } from '@/lib/utils'
import type { PoseProvider } from '@/lib/pose/types'

interface ProviderPickerProps {
  providers: PoseProvider[]
  value: string
  onChange: (id: string) => void
}

export function ProviderPicker({ providers, value, onChange }: ProviderPickerProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold text-foreground">Vision provider</legend>
      {providers.map((provider) => {
        const selected = provider.id === value
        return (
          <label
            key={provider.id}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors',
              selected ? 'border-foreground bg-card' : 'border-border bg-transparent',
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
              className="size-4 accent-foreground"
            />
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-medium text-foreground">{provider.label}</span>
              <span className="text-xs text-muted-foreground">
                {provider.available ? provider.detail : provider.unavailableReason}
              </span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
