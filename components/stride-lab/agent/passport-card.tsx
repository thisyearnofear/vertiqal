'use client'

import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import { Bot, Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FitVerdict, IssuedPassport, Passport } from '@/lib/passport/schema'
import { cn } from '@/lib/utils'

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Request failed')
  return json
}

/** Issues (and caches) a signed passport; shared by the card and the WhatsApp handoff. */
export function usePassport(passport: Passport | null) {
  const key = passport ? ['passport', JSON.stringify(passport)] : null
  return useSWR(key, ([, body]) => postJson<IssuedPassport>('/api/passport', JSON.parse(body)), {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  })
}

const VERDICT_LABEL: Record<FitVerdict['verdict'], string> = {
  'great-fit': 'GREAT FIT',
  workable: 'WORKABLE',
  'poor-fit': 'POOR FIT',
}

export function PassportCard({ passport }: { passport: Passport }) {
  const { data: issued, error } = usePassport(passport)
  const [copied, setCopied] = useState(false)
  const [product, setProduct] = useState('')
  const check = useSWRMutation(issued ? `${issued.url}/fit` : null, (url: string, { arg }: { arg: string }) =>
    postJson<FitVerdict & { product: string }>(url, { product: arg }),
  )

  const copy = async () => {
    if (!issued) return
    await navigator.clipboard.writeText(issued.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (product.trim().length >= 2) void check.trigger(product.trim())
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-stage-foreground/30 p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xl leading-snug phosphor">{'> FIT PASSPORT ISSUED'}</p>
        <p className="text-2xl leading-none tabular-nums phosphor">{issued?.id ?? (error ? 'ERROR' : 'SIGNING…')}</p>
      </div>
      <p className="max-w-2xl font-sans text-base leading-relaxed opacity-80">
        A signed, machine-readable record of how you move. Hand it to any retailer bot or shopping agent and it
        can check fit against your body instead of guessing from keywords.
      </p>
      {error && (
        <p role="alert" className="text-lg text-primary phosphor">{`! ${error.message.toUpperCase()}`}</p>
      )}
      {issued && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" variant="outline" className="h-10 px-4" onClick={copy}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? 'Copied' : 'Copy passport link'}
            </Button>
            <a
              href={issued.url}
              target="_blank"
              rel="noreferrer"
              className="text-lg leading-none underline decoration-dotted underline-offset-4 hover:text-primary"
            >
              {'VIEW JSON'}
            </a>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-2 border-t border-dashed border-stage-foreground/30 pt-4">
            <label htmlFor="fit-check" className="flex items-center gap-2 text-lg leading-none opacity-80">
              <Bot className="size-4" aria-hidden />
              {'SIMULATE A RETAILER BOT · ASK IF A SHOE FITS YOU'}
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="fit-check"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder={passport.sport === 'running' ? 'Hoka Clifton 10' : 'La Sportiva Solution Comp'}
                className="h-10 w-72 max-w-full rounded-sm border border-stage-foreground/50 bg-transparent px-3 text-2xl text-stage-foreground outline-none placeholder:text-stage-foreground/35 focus-visible:border-stage-foreground focus-visible:shadow-[0_0_16px_-4px_var(--stage-foreground)]"
              />
              <Button type="submit" size="lg" className="h-10 px-4" disabled={check.isMutating || product.trim().length < 2}>
                {check.isMutating ? 'Checking' : 'Check fit'}
              </Button>
            </div>
            {check.error && (
              <p role="alert" className="text-lg text-primary phosphor">{`! ${check.error.message.toUpperCase()}`}</p>
            )}
            {check.data && (
              <div className="flex flex-col gap-2 pt-2" aria-live="polite">
                <p className="flex flex-wrap items-baseline gap-x-3 text-2xl leading-tight">
                  <span className={cn('rounded-sm px-1.5', check.data.verdict === 'great-fit' ? 'bg-primary text-primary-foreground' : 'border border-stage-foreground/50')}>
                    {VERDICT_LABEL[check.data.verdict]}
                  </span>
                  <span className="tabular-nums phosphor">{`${check.data.score}/100`}</span>
                  <span className="text-lg opacity-70">{check.data.product}</span>
                </p>
                <ul className="flex flex-col gap-1 font-sans text-sm leading-relaxed opacity-85">
                  {check.data.reasons.map((reason) => (
                    <li key={reason}>{`— ${reason}`}</li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        </>
      )}
    </div>
  )
}
