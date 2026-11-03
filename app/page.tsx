import { cookies } from 'next/headers'
import { StrideLab } from '@/components/stride-lab/stride-lab'
import { BRIEF_COOKIE, parseRememberedBrief } from '@/lib/fitting/remembered-brief'
import { PERSONA_COOKIE, parsePersona } from '@/lib/persona'

export default async function Page() {
  const store = await cookies()
  return (
    <div id="fitting">
      <StrideLab
        initialPersona={parsePersona(store.get(PERSONA_COOKIE)?.value)}
        initialBrief={parseRememberedBrief(store.get(BRIEF_COOKIE)?.value)}
      />
    </div>
  )
}
