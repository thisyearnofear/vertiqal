'use client'

import { cn } from '@/lib/utils'
import { FittingRationale } from '../fitting-rationale'
import type { AgentOutputs, ShoePick } from './outputs'

const EXTRAS = [
  ['Riders say', 'community'],
  ['Research', 'research'],
  ['Worn by', 'wornBy'],
] as const

const PICK_LABEL = (index: number) => (index === 0 ? 'Primary recommendation' : `Alternative ${index}`)

export function Shortlist({ outputs, closingLine, onChoose }: { outputs: AgentOutputs; closingLine: string; onChoose: (pick: ShoePick) => void }) {
  const { profile, picks } = outputs

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-xl uppercase leading-snug phosphor">{`> A starting point: a ${profile.category} shoe`}</p>
        <p className="max-w-2xl text-pretty font-sans text-base leading-relaxed opacity-85">{profile.summary}</p>
        <FittingRationale requirements={profile.requirements} />
      </div>

      <ol className="grid gap-3 md:grid-cols-2" aria-label="Forma's shortlist">
        {picks.map((p, i) => {
          const extras = EXTRAS.filter(([, field]) => p[field]?.trim())
          return (
            <li
              key={p.url}
              className={cn(
                'flex flex-col gap-3 rounded-md border p-4',
                i === 0 ? 'border-primary shadow-[0_0_24px_-6px_var(--primary)] md:col-span-2 md:p-5' : 'border-stage-foreground/30',
              )}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-base leading-none">
                <span className="uppercase opacity-60">{p.retailer}</span>
                <span
                  className={cn(
                    'rounded-sm px-1.5 py-0.5 sm:ml-auto',
                    i === 0 ? 'bg-primary text-primary-foreground' : 'border border-stage-foreground/40 opacity-80',
                  )}
                >
                  {PICK_LABEL(i).toUpperCase()}
                </span>
              </div>
              <p className={cn('text-pretty font-sans font-semibold leading-tight', i === 0 ? 'text-2xl md:text-3xl' : 'text-xl')}>{p.name}</p>
              <p className="font-sans text-lg leading-none tabular-nums opacity-90">{p.price}</p>
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
                  'mt-auto rounded-sm border-2 px-3 py-2 text-lg uppercase leading-none transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring',
                  i === 0
                    ? 'border-primary bg-primary text-primary-foreground hover:opacity-90'
                    : 'border-stage-foreground/70 hover:bg-stage-foreground hover:text-stage',
                )}
              >
                {'Check my size'}
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
