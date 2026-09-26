'use client'

import useSWR from 'swr'
import type { MemberView } from '@/lib/member/schema'

export const MEMBER_KEY = '/api/member'

const fetchMember = (url: string) => fetch(url).then((r) => r.json() as Promise<MemberView>)

/** Starts from the cookie read on the server, then pulls recent WhatsApp messages for linked shoppers. */
export function useMember(initial: MemberView) {
  const { data, mutate } = useSWR(MEMBER_KEY, fetchMember, {
    fallbackData: initial,
    revalidateOnMount: initial.linked,
    revalidateOnFocus: false,
  })
  const forget = () => mutate(fetch(MEMBER_KEY, { method: 'DELETE' }).then((r) => r.json() as Promise<MemberView>), { revalidate: false })
  return { member: data ?? initial, forget }
}
