import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { OutcomeForm } from '@/components/outcome/outcome-form'
import { readOutcomeToken } from '@/lib/outcome/token'
import { MissingSecretError } from '@/lib/secrets'

export const metadata: Metadata = {
  title: 'How did they fit? · vertiqal',
  robots: { index: false, follow: false },
}

/** The follow-up page a shopper opens weeks after clicking out. The link is its own proof of which shoe it is about. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let context
  try {
    context = readOutcomeToken(decodeURIComponent(token))
  } catch (error) {
    if (error instanceof MissingSecretError) notFound()
    throw error
  }
  if (!context) notFound()
  return <OutcomeForm token={decodeURIComponent(token)} sport={context.sport} name={context.name} retailer={context.retailer} size={context.size} />
}
