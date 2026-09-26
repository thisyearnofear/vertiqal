import { forgetMember, readMember, viewOf, writeMember } from '@/lib/member/cookie'
import { GUEST, lastChoiceSchema } from '@/lib/member/schema'
import { shopperLines } from '@/lib/wassist/client'

/** The linked shopper, plus what they have said to Forma on WhatsApp since their last fitting. */
export async function GET() {
  const member = await readMember()
  if (!member) return Response.json(GUEST)
  const said = await shopperLines(member.phone).catch((error) => {
    console.error('[member] transcript unavailable', error)
    return []
  })
  return Response.json(viewOf(member, said))
}

/** Records a buying decision for a shopper who has already linked WhatsApp. Guests are not tracked. */
export async function POST(request: Request) {
  const member = await readMember()
  if (!member) return Response.json(GUEST)
  const parsed = lastChoiceSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid choice' }, { status: 400 })
  await writeMember({ ...member, last: parsed.data })
  return Response.json(viewOf({ ...member, last: parsed.data }))
}

export async function DELETE() {
  await forgetMember()
  return Response.json(GUEST)
}
