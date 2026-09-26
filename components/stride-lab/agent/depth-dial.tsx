'use client'

import { DEPTHS, DEPTH_ORDER, LAYERS, hasLayer, type Depth } from '@/lib/agent/depth'
import { cn } from '@/lib/utils'

interface DepthDialProps {
  value: Depth
  onChange: (depth: Depth) => void
  disabled?: boolean
}

export function DepthDial({ value, onChange, disabled }: DepthDialProps) {
  const plan = DEPTHS[value]
  return (
    <div className="well flex flex-col gap-4 rounded-xl p-4 lg:flex-row lg:items-center lg:gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <span id="depth-label" className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">
            Depth
          </span>
          <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground" aria-hidden>
            {'Faster  ·  More context'}
          </span>
        </div>
        <div role="radiogroup" aria-labelledby="depth-label" className="housing flex gap-1 rounded-lg p-1">
          {DEPTH_ORDER.map((depth) => {
            const selected = depth === value
            return (
              <label
                key={depth}
                className={cn(
                  'flex min-w-24 flex-1 cursor-pointer flex-col items-center gap-0.5 rounded-md px-3 py-1.5 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                  selected ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="radio"
                  name="fitting-depth"
                  value={depth}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onChange(depth)}
                  className="sr-only"
                />
                <span className="text-sm font-semibold">{DEPTHS[depth].label}</span>
                <span className="font-mono text-lg leading-none tabular-nums opacity-80">{`~${DEPTHS[depth].seconds}s`}</span>
              </label>
            )
          })}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label={`Layers in a ${plan.label} run`}>
          {LAYERS.map((layer) => {
            const on = hasLayer(value, layer.id)
            return (
              <li
                key={layer.id}
                title={layer.detail}
                className={cn(
                  'flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]',
                  on ? 'text-foreground' : 'text-muted-foreground line-through decoration-muted-foreground/50',
                )}
              >
                <span className="led" data-state={on ? 'on' : 'off'} aria-hidden />
                {layer.label}
                <span className="sr-only">{on ? ' (included)' : ' (skipped)'}</span>
              </li>
            )
          })}
        </ul>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground" aria-live="polite">
          {plan.blurb}
        </p>
      </div>
    </div>
  )
}
