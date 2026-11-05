import { cookies } from 'next/headers'
import Link from 'next/link'
import { BRIEF_COOKIE, parseRememberedBrief } from '@/lib/fitting/remembered-brief'
import { setTier } from '@/app/actions'
import { ActivatePro } from './activate'

const PRO_FEATURES = [
  'Unlimited vision checks — sole wear, keyframe review',
  'Unlimited brief parsing and surface guesses',
  'AI try-on renders',
  'Full movement history — every baseline, not just the latest',
]

/** Forma Pro — the metered, hosted-AI tier. Payment provider hooks in via env. */
export default async function UpgradePage() {
  const store = await cookies()
  const tier = parseRememberedBrief(store.get(BRIEF_COOKIE)?.value)?.tier ?? 'free'
  const paymentUrl = process.env.NEXT_PUBLIC_PAYPAL_PRO_LINK ?? null

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-start justify-center gap-6 px-6 py-16 font-mono">
      <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">vertiqal · forma</p>
      <h1 className="text-balance text-4xl font-semibold text-foreground md:text-5xl">FORMA PRO</h1>
      <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
        The on-device measurement stays free — always. Pro unlocks the hosted parts:
        the vision checks, the parses, the renders, and your full movement history.
      </p>
      <ul className="flex flex-col gap-2 text-sm text-foreground">
        {PRO_FEATURES.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <span className="led mt-1.5" data-state="on" aria-hidden />
            {feature}
          </li>
        ))}
      </ul>
      {tier === 'pro' ? (
        <p className="rounded border border-primary/50 px-4 py-2 text-sm text-primary">
          Pro is active on this browser — thank you.
        </p>
      ) : paymentUrl ? (
        <a href={paymentUrl} className="rounded-sm border-2 border-foreground bg-foreground px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-background transition-transform hover:scale-[1.02]">
          Pay with PayPal
        </a>
      ) : (
        <ActivatePro activate={setTier} />
      )}
      <Link href="/" className="text-xs uppercase tracking-[0.2em] text-muted-foreground underline underline-offset-4 hover:text-foreground">
        Back to the fitting
      </Link>
    </main>
  )
}
