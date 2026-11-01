// java.time.LocalDate in the Europe/Rome zone, as the native app uses (TvGuideRepository.ROME).
// Dates are ISO strings "YYYY-MM-DD", compared as strings exactly like the native code does.

export const ROME = 'Europe/Rome'

export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
export const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
/** Monday first, like java.time.DayOfWeek. */
export const WEEKDAYS = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']
export const WEEKDAYS_SHORT = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']

const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ROME, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })

/** Wall clock in Rome for an instant: { date: 'YYYY-MM-DD', hour, minute }. */
export function romeClock(ms = Date.now()): { date: string; hour: number; minute: number; second: number } {
  const p: Record<string, string> = {}
  for (const part of parts.formatToParts(new Date(ms))) p[part.type] = part.value
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second) }
}

export const today = (ms = Date.now()) => romeClock(ms).date

function toUtc(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[3]) ? null : d
}

export const isDate = (iso: string) => toUtc(iso) != null

export function plusDays(iso: string, days: number): string {
  const d = toUtc(iso)
  if (!d) throw new Error('Invalid date ' + iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  const a = toUtc(from), b = toUtc(to)
  if (!a || !b) return 0
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function dateParts(iso: string): { year: number; month: number; day: number; weekday: number } {
  const d = toUtc(iso)
  if (!d) throw new Error('Invalid date ' + iso)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: (d.getUTCDay() + 6) % 7 }
}

/** DateTimeFormatter patterns used by the app, Locale.ITALIAN. */
export function formatDate(iso: string, pattern: 'EEEE d MMMM' | 'd MMMM yyyy' | 'd MMMM' | 'd MMM' | 'd MMM yyyy' | 'EEE d MMM' | 'EEEE d MMMM yyyy'): string {
  const { year, month, day, weekday } = dateParts(iso)
  switch (pattern) {
    case 'EEEE d MMMM': return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]}`
    case 'EEEE d MMMM yyyy': return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]} ${year}`
    case 'd MMMM yyyy': return `${day} ${MONTHS[month - 1]} ${year}`
    case 'd MMMM': return `${day} ${MONTHS[month - 1]}`
    case 'd MMM': return `${day} ${MONTHS_SHORT[month - 1]}`
    case 'd MMM yyyy': return `${day} ${MONTHS_SHORT[month - 1]} ${year}`
    case 'EEE d MMM': return `${WEEKDAYS_SHORT[weekday]} ${day} ${MONTHS_SHORT[month - 1]}`
  }
}

/** Start of a Rome day as epoch milliseconds (date.atStartOfDay(ROME)). */
export function romeStartOfDay(iso: string): number {
  const { year, month, day } = dateParts(iso)
  // Guess with the offset of noon that day, then correct once (DST changes happen at night).
  let guess = Date.UTC(year, month - 1, day, 0, 0, 0)
  for (let i = 0; i < 2; i++) {
    const c = romeClock(guess)
    const shown = Date.UTC(Number(c.date.slice(0, 4)), Number(c.date.slice(5, 7)) - 1, Number(c.date.slice(8, 10)), c.hour, c.minute, c.second)
    guess -= shown - Date.UTC(year, month - 1, day, 0, 0, 0)
  }
  return guess
}

/** "HH:mm" in Rome. */
export function romeTime(ms: number): string {
  const c = romeClock(ms)
  return `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`
}

/** YearMonth.now(ROME).toString(): "2025-10". */
export const currentYearMonth = (ms = Date.now()) => today(ms).slice(0, 7)
