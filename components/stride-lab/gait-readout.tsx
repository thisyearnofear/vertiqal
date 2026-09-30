import { cn } from '@/lib/utils'
import { MIN_EVENTS, SPORTS, compareMetric, type MetricReading, type Readout } from '@/lib/metrics/readout'

const fmt = (value: number | null | undefined, digits = 0) =>
  value === null || value === undefined ? '--' : value.toFixed(digits)

function Metric({ metric, baseline, locked, index }: { metric: MetricReading; baseline?: MetricReading; locked: boolean; index: number }) {
  const comparison = compareMetric(metric, baseline)
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground engraved">{metric.label}</dt>
      <dd className="screen flex items-baseline justify-between gap-1.5 rounded-lg px-3 py-1.5">
        <span
          key={locked ? 'locked' : 'live'}
          className={cn('inline-block font-mono text-4xl leading-none tabular-nums phosphor', locked && 'animate-roll-in')}
          style={locked ? { animationDelay: `${index * 90}ms` } : undefined}
        >
          {fmt(metric.value)}
        </span>
        <span className="font-mono text-lg leading-none opacity-70">{metric.unit}</span>
      </dd>
      {comparison ? (
        <p
          className={cn(
            'flex items-center gap-1.5 font-mono text-lg leading-none tabular-nums',
            comparison.verdict === 'better' ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <span className="led" data-state={comparison.verdict === 'better' ? 'on' : 'off'} aria-hidden />
          {`${comparison.delta >= 0 ? '+' : '−'}${Math.abs(comparison.delta).toFixed(0)} vs base`}
          <span className="sr-only">{`, ${comparison.verdict}`}</span>
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">{metric.hint}</p>
      )}
    </div>
  )
}

export function GaitReadout({ readout, baseline, provisionalHeight }: { readout: Readout; baseline: Readout | null; provisionalHeight?: boolean }) {
  const eventWord = SPORTS[readout.sport].events
  const baseMetrics = new Map(baseline?.metrics.map((m) => [m.id, m]))

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="readout-heading" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="readout-heading" className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground engraved">
            {readout.sport === 'running' ? 'Gait readout' : 'Movement readout'}
          </h2>
          <span className="font-mono text-lg leading-none tabular-nums text-muted-foreground">
            {`${String(readout.events).padStart(2, '0')} ${eventWord.toUpperCase()}`}
          </span>
        </div>
        {provisionalHeight && (
          <p className="rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Distance estimates need your height
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          {readout.metrics.map((metric, index) => (
            <Metric key={metric.id} metric={metric} baseline={baseMetrics.get(metric.id)} locked={readout.ready} index={index} />
          ))}
        </dl>
      </section>

      <section aria-labelledby="signals-heading" className="flex flex-col gap-3 border-t border-border pt-5">
        <h2 id="signals-heading" className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground engraved">
          Signals for Forma
        </h2>
        {readout.signals.length === 0 ? (
          <div className="flex flex-col gap-2">
            <div
              className="well flex h-3 gap-0.5 overflow-hidden rounded-sm p-0.5"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={MIN_EVENTS}
              aria-valuenow={Math.min(readout.events, MIN_EVENTS)}
              aria-label={`${eventWord} collected`}
            >
              {Array.from({ length: MIN_EVENTS }, (_, i) => (
                <span key={i} className={cn('flex-1 rounded-[1px]', i < readout.events ? 'bg-primary' : 'bg-transparent')} />
              ))}
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {`Collecting ${eventWord} (${Math.min(readout.events, MIN_EVENTS)}/${MIN_EVENTS}) before drawing conclusions.`}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {readout.signals.map((signal) => (
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
