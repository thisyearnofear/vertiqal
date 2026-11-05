import type { Sport } from '@/lib/metrics/readout'
import { downloadBlob } from '@/lib/downloads'

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Builds and downloads a .ics reminder to film again and compare movement. */
export function downloadFilmReminder(sport: Sport, daysAhead = 30) {
  const start = new Date()
  start.setDate(start.getDate() + daysAhead)
  const end = new Date(start.getTime() + 3600000)
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Forma//EN',
    'BEGIN:VEVENT',
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    'SUMMARY:Film yourself again — Forma',
    `DESCRIPTION:Film a clip of your ${sport} and upload it to Forma to see how your movement has changed.`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  downloadBlob(`forma-film-reminder-${start.toISOString().split('T')[0]}.ics`, new Blob([ics], { type: 'text/calendar' }))
}
