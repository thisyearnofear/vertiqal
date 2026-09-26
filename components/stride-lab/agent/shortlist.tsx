'use client'

import { cn } from '@/lib/utils'
import type { AgentOutputs, ShoePick } from './outputs'

const EXTRAS = [
  ['Riders say', 'community'],
  ['Research', 'research'],
  ['Worn by', 'wornBy'],
] as const

export function Shortlist({ outputs, closingLine, onChoose }: { outputs: AgentOutputs; closingLine: string; onChoose: (pick: ShoePick) => void }) {
  const { profile, picks } = outputs

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xl uppercase leading-snug phosphor">{`> You need a ${profile.category} shoe`}</p>
        <p className="max-w-2xl text-pretty font-sans text-base leading-relaxed opacity-85">{profile.summary}</p>
        <details className="text-lg leading-snug">
          <summary className="w-fit cursor-pointer opacity-80 hover:text-primary">{'+ What Forma matched against'}</summary>
          <dl className="mt-3 grid gap-px overflow-hidden rounded-md border border-stage-foreground/25 bg-stage-foreground/25 sm:grid-cols-2">
            {profile.requirements.map((r) => (
              <div key={r.attribute} className="flex flex-col gap-1 bg-stage p-3">
                <dt className="text-lg uppercase leading-none opacity-60">{r.attribute}</dt>
                <dd className="text-2xl leading-tight phosphor">{r.target}</dd>
                <dd className="font-sans text-sm leading-relaxed opacity-75">{r.evidence}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>

      <ol className="grid gap-3 md:grid-cols-3" aria-label="Forma's shortlist">
        {picks.map((p, i) => {
          const extras = EXTRAS.filter(([, field]) => p[field]?.trim())
          return (
            <li
              key={p.url}
              className={cn(
                'flex flex-col gap-3 rounded-md border p-4',
                i === 0 ? 'border-primary shadow-[0_0_24px_-6px_var(--primary)]' : 'border-stage-foreground/30',
              )}
            >
              <div className="flex items-center justify-between gap-2 text-lg leading-none">
                <span className="truncate uppercase opacity-60">{p.retailer}</span>
                {i === 0 && <span className="shrink-0 rounded-sm bg-primary px-1.5 py-0.5 text-primary-foreground">BEST FIT</span>}
              </div>
              <p className="text-pretty text-2xl leading-tight phosphor">{p.name}</p>
              <p className="text-xl leading-none tabular-nums opacity-90">{p.price}</p>
              <p className="text-pretty font-sans text-sm leading-relaxed opacity-80">{p.why}</p>
              {extras.length > 0 && (
                <details className="text-lg leading-snug">
                  <summary className="w-fit cursor-pointer opacity-70 hover:text-primary">
                    {`+ ${extras.map(([label]) => label.toLowerCase()).join(', ')}`}
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                    {extras.map(([label, field]) => (
                      <p key={label} className="text-pretty font-sans text-sm leading-relaxed opacity-75">
                        <span className="font-mono text-base uppercase opacity-80">{`${label}: `}</span>
                        {p[field]}
                      </p>
                    ))}
                  </div>
                </details>
              )}
              <button
                type="button"
                onClick={() => onChoose(p)}
                className={cn(
                  'mt-auto rounded-sm border-2 px-3 py-2 text-xl uppercase leading-none transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring',
                  i === 0
                    ? 'border-primary bg-primary text-primary-foreground hover:opacity-90'
                    : 'border-stage-foreground/70 hover:bg-stage-foreground hover:text-stage',
                )}
              >
                {'Choose this'}
                <span className="sr-only">{`: ${p.name}`}</span>
              </button>
            </li>
          )
        })}
      </ol>

      {closingLine && (
        <p className="border-l-2 border-stage-foreground/40 pl-4 font-sans text-base leading-relaxed text-pretty opacity-85">{closingLine}</p>
      )}
    </div>
  )
}
