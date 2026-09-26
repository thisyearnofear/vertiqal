import { cookies } from 'next/headers'
import { StrideLab } from '@/components/stride-lab/stride-lab'
import { PERSONA_COOKIE, parsePersona } from '@/lib/persona'

export default async function Page() {
  const store = await cookies()
  return <StrideLab initialPersona={parsePersona(store.get(PERSONA_COOKIE)?.value)} />
}
