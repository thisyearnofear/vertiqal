'use client'

import { useState, type FormEvent } from 'react'
import { ArrowUpRight, Pin, RotateCcw } from 'lucide-react'
import { buttonVariants, Button } from '@/components/ui/button'
import type { Sport } from '@/lib/metrics/readout'
import type { MemberView } from '@/lib/member/schema'
import type { Passport } from '@/lib/passport/schema'
import { choiceSnapshot, draftDiffers, lastCheckLabel, stockTargetFor } from '@/lib/fitting/stock'
import { cn } from '@/lib/utils'
import type { Fitting } from '@/lib/wassist/fitting'
import type { ShoePick } from './outputs'
import { PassportCard } from './passport-card'
import { StockProof, stockLine, useStockCheck } from './stock-check'
import { WhatsAppHandoff } from './whatsapp-handoff'

const LINK = 'w-fit text-lg leading-none underline decoration-dotted underline-offset-4 opacity-70 hover:opacity-100 hover:text-primary'
const shortName = (name: string) => name.split(' ').slice(0, 3).join(' ')

interface DecisionPanelProps {
  pick: ShoePick
  picks: ShoePick[]
  sport: Sport
  size: string
  onSizeCommit: (size: string) => void
  onChoose: (pick: ShoePick | null) => void
  fitting: Fitting | null
  passport: Passport | null
  member: MemberView
  /** Pins today's measurements so a re-film in the new shoes shows what changed. Absent for sample runs. */
  onPinBaseline?: () => void
  baselinePinned: boolean
}

export function DecisionPanel({
  pick,
  picks,
  sport,
  size,
  onSizeCommit,
  onChoose,
  fitting,
  passport,
  member,
  onPinBaseline,
  baselinePinned,
}: DecisionPanelProps) {
  const [draft, setDraft] = useState(size)
  const [submitted, setSubmitted] = useState<string | null>(null)
  const stock = useStockCheck(stockTargetFor(pick, submitted))
  const mismatched = draftDiffers(submitted, draft)
  const checking = submitted !== null && (stock.isLoading || stock.isValidating)
  const checkedData = submitted && !checking && !stock.error ? stock.data : undefined
  const data = checkedData && !mismatched ? checkedData : undefined
  const available = data?.verdict === 'in_stock'
  const unavailable = data?.verdict === 'out_of_stock' || data?.verdict === 'size_not_listed'
  const index = picks.findIndex((p) => p.url === pick.url)
  const nextPick = picks.find((_, i) => i > index) ?? picks.find((p) => p.url !== pick.url)
  const price = data && submitted === draft.trim() ? data.price || pick.price : pick.price
  const snapshot = choiceSnapshot({
    draft,
    submitted,
    verdict: data && submitted ? stockLine(data, submitted) : null,
  })

  const commit = (e: FormEvent) => {
    e.preventDefault()
    const next = draft.trim()
    if (!next) return
    if (next === submitted) {
      void stock.mutate()
      return
    }
    setSubmitted(next)
    onSizeCommit(next)
  }

  const retry = () => {
    if (submitted) void stock.mutate()
  }

  const recordChoice = () => {
    if (!member.linked || !snapshot) return
    void fetch('/api/member', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sport, name: pick.name, retailer: pick.retailer, price, size: snapshot.size, at: new Date().toISOString() }),
    }).catch(() => {})
  }

  const passportCurrent = Boolean(draft.trim()) && passport?.size === draft.trim()
  const choiceFitting: Fitting | null =
    fitting && snapshot
      ? {
          ...fitting,
          passportUrl: passportCurrent ? fitting.passportUrl : undefined,
          choice: { name: pick.name, retailer: pick.retailer, url: pick.url, price, size: snapshot.size, stock: snapshot.stock },
        }
      : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-lg uppercase leading-none opacity-60">{`Your pick · ${pick.retailer}`}</p>
          <p className="text-pretty font-sans text-2xl font-semibold leading-tight md:text-3xl">{pick.name}</p>
          <p className="max-w-2xl text-pretty font-sans text-base leading-relaxed opacity-80">{pick.why}</p>
        </div>
        <button type="button" onClick={() => onChoose(null)} className={cn(LINK, 'shrink-0')}>
          {'[ BACK TO SHORTLIST ]'}
        </button>
      </div>

      <div className="flex flex-col gap-4 rounded-md border border-stage-foreground/30 p-4 md:p-5">
        <form onSubmit={commit} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="decision-size" className="text-lg uppercase leading-none opacity-70">
              {sport === 'climbing' ? 'Your size (as the shop lists it)' : 'Your size'}
            </label>
            <input
              id="decision-size"
              value={draft}
              maxLength={20}
              onChange={(e) => setDraft(e.target.value)}
              className="h-10 w-32 rounded-sm border border-stage-foreground/50 bg-transparent px-3 text-2xl text-stage-foreground outline-none focus-visible:border-stage-foreground focus-visible:shadow-[0_0_16px_-4px_var(--stage-foreground)]"
            />
          </div>
          {(!submitted || mismatched) && draft.trim() && (
            <button type="submit" className={cn(LINK, 'pb-2.5 opacity-100')}>
              {`[ CHECK ${draft.trim().toUpperCase()} ]`}
            </button>
          )}
          {submitted && !mismatched && !checking && (
            <button type="button" onClick={retry} className={cn(LINK, 'flex items-center gap-1.5 pb-2.5 opacity-100')}>
              <RotateCcw className="size-4" aria-hidden />
              {'[ CHECK AGAIN ]'}
            </button>
          )}
        </form>

        <div className="flex flex-col gap-2" aria-live="polite">
          {!submitted ? (
            <p className="text-xl uppercase leading-snug opacity-70">{'UNCHECKED · SUBMIT A SIZE TO CHECK AVAILABILITY'}</p>
          ) : checking ? (
            <p className="flex items-center gap-2 text-xl uppercase leading-snug opacity-85">
              <span className="led" data-state="busy" aria-hidden />
              {`Checking ${submitted} at ${pick.retailer} right now`}
              <span className="animate-blink" aria-hidden>
                {'█'}
              </span>
            </p>
          ) : stock.error ? (
            <p className="text-xl uppercase leading-snug text-primary phosphor">{`! Couldn't check stock: ${stock.error.message}`}</p>
          ) : data ? (
            <>
              <p className={cn('text-2xl uppercase leading-snug', available ? 'phosphor' : 'text-primary phosphor')}>
                {`${available ? '■' : '!'} ${stockLine(data, submitted)}`}
              </p>
              <StockProof data={data} productName={pick.name} />
            </>
          ) : null}
          {submitted && mismatched && !checking && (
            <>
              <p className="text-lg uppercase leading-snug opacity-70">
                {`${lastCheckLabel(submitted)} · ${(draft.trim() || '?').toUpperCase()} NOT CHECKED YET`}
              </p>
              {checkedData && <StockProof data={checkedData} productName={pick.name} />}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-dashed border-stage-foreground/30 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            {unavailable && nextPick && (
              <Button size="lg" className="h-11 px-5 text-base" onClick={() => onChoose(nextPick)}>
                {`Try ${shortName(nextPick.name)}`}
              </Button>
            )}
            <a
              href={pick.url}
              target="_blank"
              rel="noreferrer"
              onClick={recordChoice}
              className={cn(buttonVariants({ size: 'lg', variant: unavailable ? 'outline' : 'default' }), 'h-11 px-5 text-base')}
            >
              {`Buy at ${pick.retailer} · ${price}`}
              <ArrowUpRight aria-hidden />
            </a>
          </div>
          <p className="text-lg leading-snug opacity-60">
            {available
              ? `// ${submitted?.toUpperCase()} VERIFIED IN STOCK. THE RETAILER IS JUST THE TILL.`
              : `// AVAILABILITY ${submitted ? 'UNCERTAIN' : 'UNCHECKED'} — CONFIRM YOUR SIZE AT THE RETAILER BEFORE BUYING.`}
          </p>
        </div>
      </div>

      {choiceFitting && <WhatsAppHandoff fitting={choiceFitting} member={member} />}

      {onPinBaseline && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="max-w-xl text-pretty font-sans text-base leading-relaxed opacity-80">
            {`Film again after a few sessions in them and Forma compares your movement across the two clips — nothing says the shoes caused any change. This session only; nothing is stored.`}
          </p>
          <button type="button" onClick={onPinBaseline} disabled={baselinePinned} className={cn(LINK, 'shrink-0 disabled:no-underline')}>
            {baselinePinned ? '■ TODAY IS YOUR BASELINE' : (
              <span className="inline-flex items-center gap-1.5">
                <Pin className="size-4" aria-hidden />
                {'[ PIN TODAY AS MY BASELINE ]'}
              </span>
            )}
          </button>
        </div>
      )}

      {passport &&
        (passportCurrent ? (
          <details className="text-lg leading-snug">
            <summary className="w-fit cursor-pointer opacity-70 hover:text-primary">{'+ Your fit passport, for other shops and AI assistants'}</summary>
            <div className="mt-4">
              <PassportCard passport={passport} />
            </div>
          </details>
        ) : draft.trim() ? (
          <p className="text-lg leading-snug opacity-70">{'Check this size to update your fit passport.'}</p>
        ) : null)}
    </div>
  )
}
