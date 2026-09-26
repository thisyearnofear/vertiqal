import { cookies } from 'next/headers'
import { LandingStory } from '@/components/landing/landing-story'
import { StrideLab } from '@/components/stride-lab/stride-lab'
import { readMember, viewOf } from '@/lib/member/cookie'
import { PERSONA_COOKIE, parsePersona } from '@/lib/persona'

export default async function Page() {
  const store = await cookies()
  const member = viewOf(await readMember())
  return (
    <>
      <LandingStory />
      <div id="fitting">
        <StrideLab initialPersona={parsePersona(store.get(PERSONA_COOKIE)?.value)} initialMember={member} />
      </div>
    </>
  )
}
