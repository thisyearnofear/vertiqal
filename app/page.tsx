import { cookies } from 'next/headers'
import { StrideLab } from '@/components/stride-lab/stride-lab'
import { BRIEF_COOKIE, parseRememberedBrief } from '@/lib/fitting/remembered-brief'
import { PERSONA_COOKIE, parsePersona } from '@/lib/persona'

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const store = await cookies()
  const params = await searchParams
  const requested = params.sport
  const shareRef = params.ref
  return (
    <div id="fitting">
      <StrideLab
        initialSport={requested === 'running' ? 'running' : 'climbing'}
        shareRef={typeof shareRef === 'string' ? shareRef : null}
        initialPersona={parsePersona(store.get(PERSONA_COOKIE)?.value)}
        initialBrief={parseRememberedBrief(store.get(BRIEF_COOKIE)?.value)}
      />
    </div>
  )
}
