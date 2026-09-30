const STEPS = ['Observe', 'Confirm', 'Choose'] as const

export function HowItWorks() {
  return (
    <details className="group">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-sm text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        How it works
        <span aria-hidden className="transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="mt-3 flex max-w-xl flex-col gap-2">
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-foreground">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span className="well rounded-md px-2.5 py-1">
                {i + 1} · {step}
              </span>
              {i < STEPS.length - 1 && <span className="text-muted-foreground" aria-hidden>→</span>}
            </li>
          ))}
        </ol>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          The camera watches how you move — it cannot measure your shoe size, foot width or budget. You confirm those
          yourself before anything is searched, and every recommendation waits for your go-ahead.
        </p>
      </div>
    </details>
  )
}
