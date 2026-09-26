import { timingSafeEqual } from 'node:crypto'
import { listConversations, pickFromTranscript, sendTemplate, transcriptOf } from '@/lib/wassist/client'

export const maxDuration = 60

const DAY_MS = 86_400_000
/** Roughly two weeks of wear before asking how the shoes feel. */
const CHECKIN_AFTER_DAYS = 12
const MAX_PER_RUN = 40
const CHECKIN_MARKER = 'vertiqal check-in'

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET
  const given = request.headers.get('authorization') ?? ''
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), expected)
}

/**
 * Daily Vercel Cron. Finds shoppers whose chat went quiet exactly CHECKIN_AFTER_DAYS ago (a one-day
 * slice, so each chat is picked up once without a database) and who chose a shoe in the app, then
 * sends the approved check-in template. Their 24-hour window has long closed, so a template is the
 * only thing WhatsApp allows.
 */
export async function GET(request: Request) {
  if (!authorised(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const template = process.env.WASSIST_CHECKIN_TEMPLATE
  if (!template) return Response.json({ skipped: 'WASSIST_CHECKIN_TEMPLATE is not set' })

  const now = Date.now()
  const filter = {
    lastMessageAfter: new Date(now - (CHECKIN_AFTER_DAYS + 1) * DAY_MS).toISOString(),
    lastMessageBefore: new Date(now - CHECKIN_AFTER_DAYS * DAY_MS).toISOString(),
  }

  let checked = 0
  let sent = 0
  const failures: string[] = []
  for await (const conversation of listConversations(filter)) {
    if (checked++ >= MAX_PER_RUN) break
    try {
      const transcript = await transcriptOf(conversation.id, 30)
      const pick = pickFromTranscript(transcript)
      if (!pick || transcript.includes(CHECKIN_MARKER)) continue
      await sendTemplate(conversation.id, template, [pick])
      sent++
    } catch (error) {
      failures.push(error instanceof Error ? error.message.slice(0, 160) : 'unknown error')
    }
  }
  return Response.json({ checked, sent, failures })
}
