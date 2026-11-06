// Web counterpart of addToCalendar() in MainActivity.kt: hands a prefilled event to the phone's calendar.
// Android: Google Calendar's "new event" page (opens the app). iPhone and desktop: an .ics file.
import type { ReleaseFollow } from '../../../shared/model.ts'
import { followSeries } from '../../../shared/follows.ts'

export type CalendarEvent = { title: string; description: string; location: string; start: number; end: number; allDay?: boolean }

const pad = (n: number) => String(n).padStart(2, '0')
const utcStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const dayStamp = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` }
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

export function icsOf(e: CalendarEvent): string {
  const when = e.allDay ? [`DTSTART;VALUE=DATE:${dayStamp(e.start)}`, `DTEND;VALUE=DATE:${dayStamp(e.end)}`] : [`DTSTART:${utcStamp(e.start)}`, `DTEND:${utcStamp(e.end)}`]
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dueffe//StreamWise//IT', 'BEGIN:VEVENT',
    `UID:${e.start}-${encodeURIComponent(e.title)}@streamwise`, `DTSTAMP:${utcStamp(Date.now())}`, ...when,
    `SUMMARY:${icsText(e.title)}`, `DESCRIPTION:${icsText(e.description)}`, `LOCATION:${icsText(e.location)}`,
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
}

export function addToCalendar(e: CalendarEvent) {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) {
    const dates = e.allDay ? `${dayStamp(e.start)}/${dayStamp(e.end)}` : `${utcStamp(e.start)}/${utcStamp(e.end)}`
    const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, details: e.description, location: e.location, dates })
    window.open(`https://calendar.google.com/calendar/render?${q}`, '_blank', 'noopener')
    return
  }
  const ics = icsOf(e)
  // iOS (also as installed app) offers "Add to Calendar" when it navigates to a calendar data URL.
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    window.location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
    return
  }
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `${e.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 60) || 'evento'}.ics` })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** All-day event for a followed title's next episode or Italian release (date = yyyy-mm-dd). */
export function addReleaseToCalendar(f: ReleaseFollow, date: string) {
  const series = followSeries(f)
  const title = series
    ? `${f.media.title}${f.nextEpisode > 0 ? ` S${f.nextSeason}E${f.nextEpisode}` : ''}`
    : `${f.media.title} – ${f.releaseKind === 'cinema' ? 'al cinema' : f.releaseKind === 'digital' ? 'in digitale' : 'uscita'}`
  const start = Date.parse(`${date}T00:00:00Z`)
  addToCalendar({ title, description: series && f.nextName ? f.nextName : f.media.overview, location: '', start, end: start + 86_400_000, allDay: true })
}
