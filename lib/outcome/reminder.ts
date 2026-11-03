/**
 * A calendar reminder as a plain .ics file. It is how a shopper with no account gets back to their
 * follow-up link in a few weeks: the calendar they already use holds the reminder, not us.
 */

const CRLF = '\r\n'

const pad = (n: number) => String(n).padStart(2, '0')
const dateValue = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
const stampValue = (d: Date) => `${dateValue(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`

export const escapeIcsText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** RFC 5545 folds content lines at 75 octets; continuation lines start with one space. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const char of line) {
    const width = encoder.encode(char).length
    const limit = parts.length === 0 ? 75 : 74
    if (size + width > limit) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += char
    size += width
  }
  parts.push(current)
  return parts.join(`${CRLF} `)
}

export function reminderIcs(input: { uid: string; summary: string; description: string; url: string; on: Date; now?: Date }): string {
  const end = new Date(input.on.getTime() + 24 * 60 * 60_000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//vertiqal//fit follow-up//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}@vertiqal`,
    `DTSTAMP:${stampValue(input.now ?? new Date())}`,
    `DTSTART;VALUE=DATE:${dateValue(input.on)}`,
    `DTEND;VALUE=DATE:${dateValue(end)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
    `DESCRIPTION:${escapeIcsText(`${input.description}\n${input.url}`)}`,
    `URL:${input.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join(CRLF) + CRLF
}

/** Three weeks: long enough to have worn them in, short enough to still remember the purchase. */
export const FOLLOW_UP_DAYS = 21
