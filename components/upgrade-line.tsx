import Link from 'next/link'

/**
 * Error line that upgrades to an upsell when the API refused on tier quota —
 * the 402 response carries "Forma Pro" in its message.
 */
export function UpgradeLine({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null
  const pro = message.includes('Forma Pro')
  return (
    <p role="alert" className={className}>
      {message}
      {pro && (
        <>
          {' '}
          <Link href="/upgrade" className="font-semibold underline underline-offset-2">
            See Pro →
          </Link>
        </>
      )}
    </p>
  )
}
