'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'

// AG Grid is heavy — keep it out of the initial bundle like MovementTwin.
const FitLab = dynamic(() => import('@/components/lab/fit-lab').then((m) => m.FitLab), {
  ssr: false,
  loading: () => <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Loading the lab…</p>,
})

export default function LabPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-2xl tracking-wider text-foreground engraved">forma</p>
        <h1 className="text-balance text-2xl font-semibold text-foreground">Fit lab</h1>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          Orders and fit verdicts side by side — did the measurement hold once the shoes arrived.
        </p>
        <Link href="/" className="w-fit font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          ← back to forma
        </Link>
      </header>
      <FitLab />
    </main>
  )
}
