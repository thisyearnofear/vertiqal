import type { MovementBrief } from '@/lib/agent/brief'

const SHOE_WALL_SORTS = ['Colourway', 'Price', 'Bestseller']

const formatValue = (value: number | null, unit: string) =>
  value === null ? '--' : `${value}${unit === 'deg' ? '°' : ` ${unit}`}`

/** Contrasts how a shop would have ranked shoes with the numbers Forma actually used for this shopper. */
export function FitReceipt({ brief }: { brief: MovementBrief }) {
  const measured = brief.metrics.filter((m) => m.value !== null).slice(0, 3)
  if (measured.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-4 rounded-md border border-dashed border-stage-foreground/30 p-4 sm:grid-cols-2 md:p-5">
      <div className="flex flex-col gap-2">
        <p className="text-lg uppercase leading-none opacity-60">{'A shoe wall sorts by'}</p>
        <ul className="flex flex-col gap-1">
          {SHOE_WALL_SORTS.map((label) => (
            <li key={label} className="text-xl uppercase leading-snug line-through opacity-50">
              {label}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-lg uppercase leading-none opacity-60">{'Forma sorted by you'}</p>
        <ul className="flex flex-col gap-1">
          {measured.map((metric) => (
            <li key={metric.label} className="flex items-baseline justify-between gap-3 text-xl uppercase leading-snug">
              <span className="truncate">{metric.label}</span>
              <span className="shrink-0 tabular-nums phosphor">{formatValue(metric.value, metric.unit)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
