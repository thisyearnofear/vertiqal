'use client'

import type { ReactNode } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { findingById } from '@/lib/agent/evidence'
import type { GearAgentUIMessage } from '@/lib/agent/gear-agent'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BasketRun } from './basket-run'

type Part = GearAgentUIMessage['parts'][number]
type ApprovalHandler = (response: { id: string; approved: boolean }) => void

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

type StepState = 'pending' | 'done' | 'wait' | 'halt'

const STATE_TAG: Record<StepState, string> = {
  pending: '[ .. ]',
  done: '[ OK ]',
  wait: '[ ?? ]',
  halt: '[ -- ]',
}

function Step({
  title,
  detail,
  state,
  children,
}: {
  title: string
  detail?: string
  state: StepState
  children?: ReactNode
}) {
  return (
    <li className="flex animate-in flex-col gap-3 fade-in slide-in-from-bottom-1 duration-300">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xl leading-snug">
        <span
          className={cn(
            'shrink-0 tabular-nums',
            state === 'pending' && 'animate-pulse opacity-70',
            state === 'wait' && 'text-primary phosphor',
            state === 'done' && 'phosphor',
            state === 'halt' && 'opacity-60',
          )}
        >
          {STATE_TAG[state]}
        </span>
        <span className="uppercase phosphor">{title}</span>
        {detail && <span className="min-w-0 truncate text-lg opacity-60">{detail}</span>}
      </div>
      {children && <div className="flex flex-col gap-3 md:pl-16">{children}</div>}
    </li>
  )
}

const isPending = (state: string) => state === 'input-streaming' || state === 'input-available'

function renderPart(part: Part, key: string, onApproval: ApprovalHandler) {
  switch (part.type) {
    case 'text':
      return part.text.trim() ? (
        <li
          key={key}
          className="border-l-2 border-stage-foreground/40 pl-4 font-sans text-base leading-relaxed text-pretty md:ml-16"
        >
          {part.text}
        </li>
      ) : null

    case 'tool-checkEvidence': {
      const output = part.state === 'output-available' ? part.output : null
      return (
        <Step
          key={key}
          title={
            output
              ? `Research check · ${output.findings.length} findings · ${output.papers.length} papers`
              : 'Checking the research'
          }
          detail={part.input?.question ? `"${part.input.question}"` : undefined}
          state={isPending(part.state) ? 'pending' : part.state === 'output-error' ? 'halt' : 'done'}
        >
          {output && (
            <>
              <ul className="flex flex-col gap-3" aria-label="Research findings">
                {output.findings.map((f) => (
                  <li key={f.id} className="flex flex-col gap-1">
                    <p className="font-sans text-sm leading-relaxed">
                      <span className="font-mono text-lg phosphor">{`${f.id} `}</span>
                      {f.finding}
                    </p>
                    <a
                      href={`https://doi.org/${f.doi}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-fit text-lg leading-tight underline decoration-dotted underline-offset-4 opacity-70 hover:text-primary"
                    >
                      {`↳ ${f.kind}${f.sample ? ` ${f.sample}` : ''} · ${f.citation}`}
                    </a>
                  </li>
                ))}
              </ul>
              {output.unsupported.length > 0 && (
                <p className="text-lg leading-snug opacity-70">
                  {`NO DIRECT RESEARCH FOR ${output.unsupported.join(', ').toUpperCase()}: TREATED AS RULE OF THUMB`}
                </p>
              )}
              {output.papers.length > 0 && (
                <details className="text-lg leading-snug">
                  <summary className="w-fit cursor-pointer opacity-80 hover:text-primary">
                    {`+ ${output.papers.length} papers from live literature search`}
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {output.papers.map((p) => (
                      <li key={p.url}>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-dotted underline-offset-4 opacity-70 hover:text-primary"
                        >
                          {`↳ ${hostOf(p.url)} · ${p.title}`}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </Step>
      )
    }

    case 'tool-checkAthletes': {
      const output = part.state === 'output-available' ? part.output : null
      return (
        <Step
          key={key}
          title={output ? 'Athlete check' : 'Looking for who wears them'}
          detail={part.input?.models?.filter(Boolean).join(' · ')}
          state={isPending(part.state) ? 'pending' : part.state === 'output-error' ? 'halt' : 'done'}
        >
          {output && (
            <ul className="flex flex-col gap-1" aria-label="Athlete sources">
              {output.athletes.map(({ model, results }) => (
                <li key={model} className="text-lg leading-tight">
                  {results[0] ? (
                    <a
                      href={results[0].url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-dotted underline-offset-4 opacity-80 hover:text-primary"
                    >
                      {`↳ ${model} · ${hostOf(results[0].url)}`}
                    </a>
                  ) : (
                    <span className="opacity-60">{`↳ ${model} · no coverage found`}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Step>
      )
    }

    case 'tool-buildGearProfile': {
      const profile = part.state === 'output-available' ? part.output : null
      return (
        <Step
          key={key}
          title={profile ? 'Gear profile built' : 'Reading your movement'}
          detail={profile ? `${profile.category} shoe` : undefined}
          state={isPending(part.state) ? 'pending' : 'done'}
        >
          {profile && (
            <>
              <p className="font-sans text-base leading-relaxed opacity-85">{profile.summary}</p>
              <dl className="grid gap-px overflow-hidden rounded-md border border-stage-foreground/25 bg-stage-foreground/25 sm:grid-cols-2">
                {profile.requirements.map((r) => {
                  const finding = r.researchRef ? findingById(r.researchRef) : undefined
                  return (
                    <div key={r.attribute} className="flex flex-col gap-1 bg-stage p-3">
                      <dt className="text-lg uppercase leading-none opacity-60">{r.attribute}</dt>
                      <dd className="text-2xl leading-tight phosphor">{r.target}</dd>
                      <dd className="font-sans text-sm leading-relaxed opacity-75">{r.evidence}</dd>
                      {finding && (
                        <dd>
                          <a
                            href={`https://doi.org/${finding.doi}`}
                            target="_blank"
                            rel="noreferrer"
                            title={finding.finding}
                            className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-stage-foreground/40 px-1.5 text-lg leading-snug hover:border-primary hover:text-primary"
                          >
                            {`${finding.id} · ${finding.kind}${finding.sample ? ` ${finding.sample}` : ''}`}
                            <span className="sr-only">{`: ${finding.citation}`}</span>
                          </a>
                        </dd>
                      )}
                    </div>
                  )
                })}
              </dl>
            </>
          )}
        </Step>
      )
    }

    case 'tool-searchProducts': {
      const output = part.state === 'output-available' ? part.output : null
      const query = part.input?.query
      return (
        <Step
          key={key}
          title={output ? `Live web search · ${output.results.length} hits` : 'Searching live stock'}
          detail={query ? `"${query}"` : undefined}
          state={isPending(part.state) ? 'pending' : 'done'}
        >
          {output && output.results.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-lg leading-none opacity-70" aria-label="Sources">
              {[...new Set(output.results.map((r) => hostOf(r.url)))].map((host) => (
                <li key={host}>{`↳ ${host}`}</li>
              ))}
            </ul>
          )}
        </Step>
      )
    }

    case 'tool-checkCommunity': {
      const output = part.state === 'output-available' ? part.output : null
      const models = part.input?.models?.filter((m): m is string => Boolean(m))
      return (
        <Step
          key={key}
          title={output ? `Community check · ${output.results.length} threads` : 'Reading what riders say'}
          detail={models?.length ? models.join(' · ') : undefined}
          state={isPending(part.state) ? 'pending' : part.state === 'output-error' ? 'halt' : 'done'}
        >
          {output && output.results.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="Community sources">
              {output.results.slice(0, 3).map((r) => (
                <li key={r.url} className="flex flex-col gap-0.5">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-fit text-lg leading-tight underline decoration-dotted underline-offset-4 opacity-80 hover:text-primary"
                  >
                    {`↳ ${hostOf(r.url)} · ${r.title}`}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Step>
      )
    }

    case 'tool-recommendProducts': {
      const picks = part.state === 'output-available' ? part.output.picks : null
      return (
        <Step
          key={key}
          title={picks ? 'Shortlisted three shoes' : 'Comparing options'}
          state={isPending(part.state) ? 'pending' : 'done'}
        >
          {picks && (
            <ol className="grid gap-3 md:grid-cols-3">
              {picks.map((p, i) => (
                <li
                  key={p.url}
                  className={cn(
                    'flex flex-col gap-2 rounded-md border p-4',
                    i === 0
                      ? 'border-primary shadow-[0_0_24px_-6px_var(--primary)]'
                      : 'border-stage-foreground/30',
                  )}
                >
                  <div className="flex items-center justify-between gap-2 text-lg leading-none">
                    <span className="uppercase opacity-60">{`${String(i + 1).padStart(2, '0')} · ${p.retailer}`}</span>
                    {i === 0 && (
                      <span className="rounded-sm bg-primary px-1.5 py-0.5 text-primary-foreground">BEST FIT</span>
                    )}
                  </div>
                  <p className="text-pretty text-2xl leading-tight phosphor">{p.name}</p>
                  <p className="text-xl leading-none tabular-nums opacity-90">{p.price}</p>
                  <p className="text-pretty font-sans text-sm leading-relaxed opacity-80">{p.why}</p>
                  {[
                    ['Riders say', p.community],
                    ['Research', p.research],
                    ['Worn by', p.wornBy],
                  ].map(([label, text]) =>
                    text?.trim() ? (
                      <p
                        key={label}
                        className="border-t border-dashed border-stage-foreground/25 pt-2 text-pretty font-sans text-sm leading-relaxed opacity-70"
                      >
                        <span className="font-mono text-base uppercase opacity-80">{`${label}: `}</span>
                        {text}
                      </p>
                    ) : null,
                  )}
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-auto inline-flex items-center gap-1 pt-1 text-lg leading-none underline decoration-dotted underline-offset-4 hover:text-primary"
                  >
                    {`OPEN ${hostOf(p.url).toUpperCase()}`}
                    <ArrowUpRight className="size-4" aria-hidden />
                  </a>
                </li>
              ))}
            </ol>
          )}
        </Step>
      )
    }

    case 'tool-addToBasket': {
      const input = part.state === 'input-streaming' ? null : part.input
      if (part.state === 'approval-requested' && !part.approval.isAutomatic && input) {
        return (
          <Step key={key} title="Awaiting your authorisation" state="wait">
            <div className="flex flex-col gap-4 rounded-md border-2 border-dashed border-primary p-4 md:p-5">
              <p className="text-pretty font-sans text-base leading-relaxed">
                {`Send a browser agent to ${hostOf(input.productUrl)} to add `}
                <span className="font-semibold text-primary">{input.productName}</span>
                {` in ${input.size} to your basket? It stops before checkout.`}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" className="h-10 px-5" onClick={() => onApproval({ id: part.approval.id, approved: true })}>
                  Authorise
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-10 px-4"
                  onClick={() => onApproval({ id: part.approval.id, approved: false })}
                >
                  <X aria-hidden />
                  Not now
                </Button>
              </div>
            </div>
          </Step>
        )
      }
      if (part.state === 'output-denied') {
        return <Step key={key} title="Basket run declined" state="halt" />
      }
      if (part.state === 'output-error') {
        return <Step key={key} title="Browser agent could not start" detail={part.errorText} state="halt" />
      }
      if (part.state === 'output-available') {
        return (
          <Step key={key} title="Browser agent at the retailer" detail={hostOf(part.output.productUrl)} state="done">
            <BasketRun runId={part.output.runId} productName={part.output.productName} size={part.output.size} />
          </Step>
        )
      }
      return <Step key={key} title="Preparing basket run" state="pending" />
    }

    default:
      return null
  }
}

export function AgentSteps({
  messages,
  onApproval,
}: {
  messages: GearAgentUIMessage[]
  onApproval: ApprovalHandler
}) {
  const parts = messages
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => m.parts.map((part, i) => ({ part, key: `${m.id}-${i}` })))

  return (
    <ol className="flex flex-col gap-6" aria-label="Agent activity">
      {parts.map(({ part, key }) => renderPart(part, key, onApproval))}
    </ol>
  )
}
