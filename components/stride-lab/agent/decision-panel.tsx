'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUpRight, Pin, RotateCcw } from 'lucide-react'
import { buttonVariants, Button } from '@/components/ui/button'
import type { MovementBrief } from '@/lib/agent/brief'
import { trackStep } from '@/lib/funnel'
import type { Sport } from '@/lib/metrics/readout'
import type { MemberView } from '@/lib/member/schema'
import type { Passport } from '@/lib/passport/schema'
import { choiceSnapshot, draftDiffers, lastCheckLabel, stockTargetFor } from '@/lib/fitting/stock'
import { cn } from '@/lib/utils'
import type { Fitting } from '@/lib/wassist/fitting'
import { FitReceipt } from './fit-receipt'
import type { ShoePick } from './outputs'
import { PassportCard } from './passport-card'
import { StockProof, stockLine, useStockCheck } from './stock-check'
import { WhatsAppHandoff } from './whatsapp-handoff'

const LINK = 'w-fit text-lg leading-none underline decoration-dotted underline-offset-4 opacity-70 hover:opacity-100 hover:text-primary'
const shortName = (name: string) => name.split(' ').slice(0, 3).join(' ')

interface DecisionPanelProps {
  pick: ShoePick
  picks: ShoePick[]
  brief: MovementBrief
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
  /** Offer WhatsApp, baseline and passport (only once a size check has finished). */
  takeAway: boolean
  /** Reports whether a size check has finished, so the rest of the page can reveal what comes next. */
  onSettled: (settled: boolean) => void
}

export function DecisionPanel({
  pick,
  picks,
  brief,
  sport,
  size,
  onSizeCommit,
  onChoose,
  fitting,
  passport,
  member,
  onPinBaseline,
  baselinePinned,
  takeAway,
  onSettled,
}: DecisionPanelProps) {
  const [draft, setDraft] = useState(size)
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const stock = useStockCheck(stockTargetFor(pick, submitted), attempt)
  const mismatched = draftDiffers(submitted, draft)
  const checking = submitted !== null && (stock.isLoading || stock.isValidating)
  const checkedData = submitted && !checking && !stock.error ? stock.data : undefined
  const data = checkedData && !mismatched ? checkedData : undefined
  const available = data?.verdict === 'in_stock'
  const unavailable = data?.verdict === 'out_of_stock' || data?.verdict === 'size_not_listed'
  const index = picks.findIndex((p) => p.url === pick.url)
  const nextPick = picks.find((_, i) => i > index) ?? picks.find((p) => p.url !== pick.url)
  const price = data && submitted === draft.trim() ? data.price || pick.price : pick.price
  const settled = Boolean(submitted && !checking && (checkedData || stock.error))
  const resultRef = useRef<HTMLDivElement>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    onSettled(settled)
    if (settled) resultRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [settled, onSettled])

  // A visible clock while the browser check runs; it takes tens of seconds and gives no partial progress.
  useEffect(() => {
    if (!checking) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [checking])
  const elapsed = checking && startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0

  const snapshot = choiceSnapshot({
    draft,
    submitted,
    verdict: data && submitted ? stockLine(data, submitted) : null,
  })

  const commit = (e: FormEvent) => {
    e.preventDefault()
    const next = draft.trim()
    if (!next) return
    setStartedAt(Date.now())
    setNow(Date.now())
    if (next === submitted) {
      setAttempt((a) => a + 1)
      return
    }
    setAttempt(0)
    setSubmitted(next)
    onSizeCommit(next)
  }

  const retry = () => {
    if (!submitted) return
    setStartedAt(Date.now())
    setNow(Date.now())
    setAttempt((a) => a + 1)
  }

  const recordChoice = () => {
    trackStep('buy_clicked', { sport, retailer: pick.retailer, verified: available })
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
        <div className="flex min-w-0 animate-focus-in flex-col gap-2 motion-reduce:animate-none">
          <p className="text-lg uppercase leading-none opacity-60">{`Your pick · ${pick.retailer}`}</p>
          <p className="text-pretty font-sans text-2xl font-semibold leading-tight md:text-3xl">{pick.name}</p>
          <p className="max-w-2xl text-pretty font-sans text-base leading-relaxed opacity-80">{pick.why}</p>
        </div>
        <button type="button" onClick={() => onChoose(null)} className={cn(LINK, 'shrink-0')}>
          {'[ BACK TO SHORTLIST ]'}
        </button>
      </div>

      <FitReceipt brief={brief} />

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

        <div ref={resultRef} className="flex scroll-mt-6 flex-col gap-2" aria-live="polite">
          {!submitted ? (
            <p className="max-w-2xl text-pretty font-sans text-base leading-relaxed opacity-80">
              {`Forma opens ${pick.retailer} in a real browser from the UK, finds the ${draft.trim() || 'size'} button and reads whether it can be selected. It takes about 30–60 seconds, and nothing is bought.`}
            </p>
          ) : checking ? (
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-2 text-xl uppercase leading-snug opacity-85">
                <span className="led" data-state="busy" aria-hidden />
                {`Checking ${submitted} at ${pick.retailer} · ${elapsed}s`}
                <span className="animate-blink" aria-hidden>
                  {'█'}
                </span>
              </p>
              <p className="font-sans text-sm leading-relaxed opacity-70">
                A real browser is loading the product page, confirming it is this shoe and reading the size buttons. You&apos;ll get a screenshot of what it saw.
              </p>
            </div>
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

      {takeAway && (
        <div className="flex flex-col gap-6 border-t border-dashed border-stage-foreground/30 pt-5">
          <p className="text-xl uppercase leading-none phosphor">{'> TAKE IT WITH YOU'}</p>
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
      )}
    </div>
  )
}
