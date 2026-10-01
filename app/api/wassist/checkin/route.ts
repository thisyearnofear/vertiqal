import { timingSafeEqual } from 'node:crypto'
import { listConversations, pickFromTranscript, sendTemplate, transcriptOf } from '@/lib/wassist/client'

export const maxDuration = 60

const DAY_MS = 86_400_000
/** Roughly two weeks of wear before asking how the shoes feel. */
const CHECKIN_AFTER_DAYS = 12
/** Cap on messages sent per run; the checked cap is only a safety bound on listing. */
const MAX_SENT = 40
const MAX_CHECKED = 300
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
 * only thing WhatsApp allows. The window stays one day wide on purpose: we can't verify the
 * CHECKIN_MARKER survives Wassist's template text extraction without a live key, so a wider slice
 * could double-send to the same shopper.
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
  let skippedForCap = false
  const failures: string[] = []
  for await (const conversation of listConversations(filter)) {
    if (checked++ >= MAX_CHECKED) break
    try {
      const transcript = await transcriptOf(conversation.id, 30)
      const pick = pickFromTranscript(transcript)
      if (!pick || transcript.includes(CHECKIN_MARKER)) continue
      if (sent >= MAX_SENT) {
        skippedForCap = true
        break
      }
      await sendTemplate(conversation.id, template, [pick])
      sent++
    } catch (error) {
      failures.push(error instanceof Error ? error.message.slice(0, 160) : 'unknown error')
    }
  }
  return Response.json({ checked, sent, skippedForCap, failures })
}
