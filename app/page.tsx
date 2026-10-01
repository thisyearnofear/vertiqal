import { cookies } from 'next/headers'
import { StrideLab } from '@/components/stride-lab/stride-lab'
import { BRIEF_COOKIE, parseRememberedBrief } from '@/lib/fitting/remembered-brief'
import { readVerifiedMember, viewOf } from '@/lib/member/cookie'
import { PERSONA_COOKIE, parsePersona } from '@/lib/persona'

export default async function Page() {
  const store = await cookies()
  const member = viewOf(await readVerifiedMember())
  return (
    <div id="fitting">
      <StrideLab
        initialPersona={parsePersona(store.get(PERSONA_COOKIE)?.value)}
        initialMember={member}
        initialBrief={parseRememberedBrief(store.get(BRIEF_COOKIE)?.value)}
      />
    </div>
  )
}
