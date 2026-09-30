import { ArrowRight } from 'lucide-react'
import type { NextStep as NextStepState } from '@/lib/fitting/session'
import { Button } from '@/components/ui/button'

export function NextStep({ step, onAction }: { step: NextStepState; onAction: () => void }) {
  return (
    <section aria-label="Next step" aria-live="polite" className="housing flex flex-col gap-3 rounded-2xl px-5 py-4 md:flex-row md:items-center md:justify-between md:px-7">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground engraved">{step.eyebrow}</p>
        <p className="text-base font-semibold leading-tight text-foreground">{step.title}</p>
        <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
      </div>
      {step.action && (
        <Button variant="outline" size="lg" className="h-10 w-fit shrink-0 whitespace-nowrap px-4" onClick={onAction}>
          {step.action.label}
          <ArrowRight aria-hidden />
        </Button>
      )}
    </section>
  )
}
