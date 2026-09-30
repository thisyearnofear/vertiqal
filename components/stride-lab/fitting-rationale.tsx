interface RationaleRow {
  attribute: string
  target: string
  evidence: string
}

export function FittingRationale({ requirements }: { requirements: RationaleRow[] }) {
  return (
    <dl className="grid gap-px overflow-hidden rounded-md border border-stage-foreground/25 bg-stage-foreground/25 sm:grid-cols-2">
      {requirements.map((r) => (
        <div key={r.attribute} className="flex flex-col gap-1 bg-stage p-3">
          <dt className="text-base uppercase leading-none opacity-60">{r.attribute}</dt>
          <dd className="font-sans text-base font-medium leading-snug text-stage-foreground">{r.target}</dd>
          <dd className="font-sans text-sm leading-relaxed opacity-75">{r.evidence}</dd>
        </div>
      ))}
    </dl>
  )
}
