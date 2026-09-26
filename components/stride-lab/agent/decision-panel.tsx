'use client'

import { useState, type FormEvent } from 'react'
import { ArrowUpRight, Pin } from 'lucide-react'
import { buttonVariants, Button } from '@/components/ui/button'
import type { Sport } from '@/lib/metrics/readout'
import type { MemberView } from '@/lib/member/schema'
import type { Passport } from '@/lib/passport/schema'
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
  onSizeChange: (size: string) => void
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
  onSizeChange,
  onChoose,
  fitting,
  passport,
  member,
  onPinBaseline,
  baselinePinned,
}: DecisionPanelProps) {
  const [draft, setDraft] = useState(size)
  const stock = useStockCheck({ productName: pick.name, productUrl: pick.url, size })
  const data = stock.data
  const available = data?.verdict === 'in_stock'
  const unavailable = data?.verdict === 'out_of_stock' || data?.verdict === 'size_not_listed'
  const settled = Boolean(data || stock.error)
  const index = picks.findIndex((p) => p.url === pick.url)
  const nextPick = picks.find((_, i) => i > index) ?? picks.find((p) => p.url !== pick.url)
  const price = data?.price || pick.price
  const stockText = data ? stockLine(data, size) : 'Size not verified'

  const commit = (e: FormEvent) => {
    e.preventDefault()
    const next = draft.trim()
    if (next && next !== size) onSizeChange(next)
  }

  const recordChoice = () => {
    if (!member.linked) return
    void fetch('/api/member', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sport, name: pick.name, retailer: pick.retailer, price, size, at: new Date().toISOString() }),
    }).catch(() => {})
  }

  const choiceFitting: Fitting | null = fitting
    ? { ...fitting, choice: { name: pick.name, retailer: pick.retailer, url: pick.url, price, size, stock: stockText } }
    : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-lg uppercase leading-none opacity-60">{`Your pick · ${pick.retailer}`}</p>
          <p className="text-pretty text-3xl leading-tight phosphor md:text-4xl">{pick.name}</p>
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
              onBlur={() => draft.trim() && draft.trim() !== size && onSizeChange(draft.trim())}
              className="h-10 w-32 rounded-sm border border-stage-foreground/50 bg-transparent px-3 text-2xl text-stage-foreground outline-none focus-visible:border-stage-foreground focus-visible:shadow-[0_0_16px_-4px_var(--stage-foreground)]"
            />
          </div>
          {draft.trim() && draft.trim() !== size && (
            <button type="submit" className={cn(LINK, 'pb-2.5 opacity-100')}>
              {`[ CHECK ${draft.trim().toUpperCase()} ]`}
            </button>
          )}
        </form>

        <div className="flex flex-col gap-2" aria-live="polite">
          {stock.isLoading ? (
            <p className="flex items-center gap-2 text-xl uppercase leading-snug opacity-85">
              <span className="led" data-state="busy" aria-hidden />
              {`Checking ${size} at ${pick.retailer} right now`}
              <span className="animate-blink" aria-hidden>
                {'█'}
              </span>
            </p>
          ) : stock.error ? (
            <p className="text-xl uppercase leading-snug text-primary phosphor">{`! Couldn't check stock: ${stock.error.message}`}</p>
          ) : (
            data && (
              <>
                <p className={cn('text-2xl uppercase leading-snug', available ? 'phosphor' : 'text-primary phosphor')}>
                  {`${available ? '■' : '!'} ${stockText}`}
                </p>
                <StockProof data={data} productName={pick.name} />
              </>
            )
          )}
        </div>

        {settled && (
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
                ? `// ${size} VERIFIED IN STOCK. THE RETAILER IS JUST THE TILL.`
                : '// NOT VERIFIED. CONFIRM YOUR SIZE AT CHECKOUT.'}
            </p>
          </div>
        )}
      </div>

      {settled && choiceFitting && <WhatsAppHandoff fitting={choiceFitting} member={member} />}

      {onPinBaseline && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="max-w-xl text-pretty font-sans text-base leading-relaxed opacity-80">
            {`Once you've ${sport === 'running' ? 'run' : 'climbed'} in them for a couple of weeks, film again. Forma compares against today and shows what the new shoes actually changed.`}
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

      {passport && (
        <details className="text-lg leading-snug">
          <summary className="w-fit cursor-pointer opacity-70 hover:text-primary">{'+ Your fit passport, for other shops and AI assistants'}</summary>
          <div className="mt-4">
            <PassportCard passport={passport} />
          </div>
        </details>
      )}
    </div>
  )
}
