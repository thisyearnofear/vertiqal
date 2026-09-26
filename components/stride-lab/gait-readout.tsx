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
    <div className="flex flex-col gap-1.5">
      <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground engraved">{label}</dt>
      <dd className="screen flex items-baseline rounded-lg justify-between gap-1.5 px-3 py-1.5">
        <span className="font-mono text-4xl leading-none tabular-nums phosphor">{value}</span>
        <span className="font-mono text-lg leading-none opacity-70">{unit}</span>
      </dd>
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  )
}

const fmt = (value: number | null | undefined, digits = 0) =>
  value === null || value === undefined ? '--' : value.toFixed(digits)

export function GaitReadout({ snapshot }: { snapshot: GaitSnapshot | null }) {
  const signals = deriveSignals(snapshot)
  const strikes = snapshot?.totalStrikes ?? 0

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="readout-heading" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2
            id="readout-heading"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground engraved"
          >
            Gait readout
          </h2>
          <span className="font-mono text-lg leading-none tabular-nums text-muted-foreground">
            {`${String(strikes).padStart(2, '0')} FOOTFALLS`}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Metric label="Cadence" value={fmt(snapshot?.cadenceSpm)} unit="spm" hint="Target 170–180" />
          <Metric
            label="Overstride"
            value={fmt(snapshot?.avgOverstrideCm)}
            unit="cm"
            hint="Foot ahead of hips"
          />
          <Metric
            label="Knee @ contact"
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

      <section aria-labelledby="signals-heading" className="flex flex-col gap-3 border-t border-border pt-5">
        <h2
          id="signals-heading"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground engraved"
        >
          Signals for the agent
        </h2>
        {signals.length === 0 ? (
          <div className="flex flex-col gap-2">
            <div
              className="well flex h-3 gap-0.5 overflow-hidden rounded-sm p-0.5"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={MIN_STRIKES_FOR_SIGNALS}
              aria-valuenow={Math.min(strikes, MIN_STRIKES_FOR_SIGNALS)}
              aria-label="Footfalls collected"
            >
              {Array.from({ length: MIN_STRIKES_FOR_SIGNALS }, (_, i) => (
                <span
                  key={i}
                  className={cn('flex-1 rounded-[1px]', i < strikes ? 'bg-primary' : 'bg-transparent')}
                />
              ))}
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {`Collecting footfalls (${Math.min(strikes, MIN_STRIKES_FOR_SIGNALS)}/${MIN_STRIKES_FOR_SIGNALS}) before drawing conclusions.`}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {signals.map((signal) => (
              <li key={signal.id} className="flex gap-3">
                <span className="led mt-1.5 shrink-0" data-state={signal.flagged ? 'on' : 'off'} aria-hidden />
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-semibold text-foreground">
                    {signal.label}
                    <span className="sr-only">{signal.flagged ? ' (flagged)' : ' (ok)'}</span>
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{signal.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
