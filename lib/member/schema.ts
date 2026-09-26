import { z } from 'zod'

export const lastChoiceSchema = z.object({
  sport: z.enum(['running', 'climbing']),
  name: z.string().max(120),
  retailer: z.string().max(80),
  price: z.string().max(40),
  size: z.string().max(20),
  at: z.string().max(40),
})

export type LastChoice = z.infer<typeof lastChoiceSchema>

/** What the browser is allowed to know about a WhatsApp-linked shopper. The full number stays server-side. */
export interface MemberView {
  linked: boolean
  phone: string | null
  last: LastChoice | null
  /** The shopper's most recent WhatsApp messages to Forma, oldest first. */
  said: string[]
}

export const GUEST: MemberView = { linked: false, phone: null, last: null, said: [] }

const when = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'recently' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Lines appended to the brief so a returning shopper's search builds on their history. */
export function memberContext(member: MemberView): string[] {
  const lines: string[] = []
  if (member.last) {
    const { sport, name, size, price, retailer, at } = member.last
    lines.push(`Previous ${sport} fitting (${when(at)}): I chose ${name} in ${size}, ${price} at ${retailer}.`)
  }
  if (member.said.length) {
    lines.push(`Since then I told Forma on WhatsApp: ${member.said.map((s) => `"${s}"`).join(' / ')}`)
  }
  return lines
}
