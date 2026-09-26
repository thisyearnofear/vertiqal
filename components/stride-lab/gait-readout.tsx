import { cn } from '@/lib/utils'
import { MIN_STRIKES_FOR_SIGNALS, deriveSignals, type GaitSnapshot } from '@/lib/metrics/gait'

function Metric({
  label,
  value,
  unit,
  hint,
}: {
  label: string
  value: string
  unit: string
  hint: string
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <dt className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">{value}</span>
        <span className="font-mono text-xs text-muted-foreground">{unit}</span>
      </dd>
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  )
}

const fmt = (value: number | null | undefined, digits = 0) =>
  value === null || value === undefined ? '—' : value.toFixed(digits)

export function GaitReadout({ snapshot }: { snapshot: GaitSnapshot | null }) {
  const signals = deriveSignals(snapshot)
  const strikes = snapshot?.totalStrikes ?? 0

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="readout-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="readout-heading" className="text-sm font-semibold text-foreground">
            Gait readout
          </h2>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {strikes} footfalls
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Metric label="Cadence" value={fmt(snapshot?.cadenceSpm)} unit="spm" hint="Target 170–180" />
          <Metric
            label="Overstride"
            value={fmt(snapshot?.avgOverstrideCm)}
            unit="cm"
            hint="Foot ahead of hips"
          />
          <Metric
            label="Knee at contact"
            value={fmt(snapshot?.avgKneeAtStrike)}
            unit="deg"
            hint="180 = locked straight"
          />
          <Metric
            label="Trunk lean"
            value={fmt(snapshot?.trunkLeanDeg)}
            unit="deg"
            hint="Forward from vertical"
          />
        </dl>
      </section>

      <section aria-labelledby="signals-heading" className="flex flex-col gap-3">
        <h2 id="signals-heading" className="text-sm font-semibold text-foreground">
          Signals for the shopping agent
        </h2>
        {signals.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {`Collecting footfalls (${Math.min(strikes, MIN_STRIKES_FOR_SIGNALS)}/${MIN_STRIKES_FOR_SIGNALS}) before drawing conclusions.`}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {signals.map((signal) => (
              <li key={signal.id} className="flex gap-3 rounded-md bg-muted p-3">
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    signal.flagged ? 'bg-primary' : 'bg-accent',
                  )}
                  aria-hidden
                />
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {signal.label}
                    <span className="sr-only">{signal.flagged ? ' (flagged)' : ' (ok)'}</span>
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{signal.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
