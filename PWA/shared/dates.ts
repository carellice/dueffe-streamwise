// java.time helpers the native app uses, always in Europe/Rome (TvGuideRepository.ROME), on
// ISO "YYYY-MM-DD" strings so that comparisons stay plain string comparisons like on Android.

export const ROME = 'Europe/Rome'

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

const parts = (time: number, zone = ROME) => {
  const out: Record<string, string> = {}
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(time))) out[p.type] = p.value
  return out
}

/** LocalDate.now(ROME). */
export function todayRome(now = Date.now()): string {
  const p = parts(now)
  return `${p.year}-${p.month}-${p.day}`
}

/** ZonedDateTime.now(ROME).getHour(). */
export function hourRome(now = Date.now()): number {
  return Number(parts(now).hour)
}

/** "HH:mm" in Rome. */
export function timeRome(time: number): string {
  const p = parts(time)
  return `${p.hour}:${p.minute}`
}

/** The Rome calendar date of an instant. */
export function dateRome(time: number): string {
  const p = parts(time)
  return `${p.year}-${p.month}-${p.day}`
}

/** Offset of Rome from UTC at [time], in milliseconds. */
function romeOffset(time: number): number {
  const p = parts(time)
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
  return asUtc - Math.floor(time / 1000) * 1000
}

/** date.atStartOfDay(ROME).toInstant() in epoch milliseconds. */
export function startOfDayRome(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  let t = guess - romeOffset(guess)
  t = guess - romeOffset(t)
  return t
}

export function isIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export function plusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z')
  const b = Date.parse(to + 'T00:00:00Z')
  return Math.round((b - a) / 86400000)
}

const fields = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
}

/** DateTimeFormatter patterns used by the app, in Italian: EEEE d MMMM, d MMMM yyyy, d MMMM, d MMM, d MMM yyyy, EEE d MMM. */
export function formatIt(iso: string, pattern: 'EEEE d MMMM' | 'd MMMM yyyy' | 'd MMMM' | 'd MMM' | 'd MMM yyyy' | 'EEE d MMM' | 'EEEE d MMMM yyyy' | 'EEE' | 'MMMM yyyy'): string {
  const { y, m, d, dow } = fields(iso)
  switch (pattern) {
    case 'EEEE d MMMM': return `${WEEKDAYS[dow]} ${d} ${MONTHS[m - 1]}`
    case 'EEEE d MMMM yyyy': return `${WEEKDAYS[dow]} ${d} ${MONTHS[m - 1]} ${y}`
    case 'd MMMM yyyy': return `${d} ${MONTHS[m - 1]} ${y}`
    case 'd MMMM': return `${d} ${MONTHS[m - 1]}`
    case 'd MMM': return `${d} ${MONTHS_SHORT[m - 1]}`
    case 'd MMM yyyy': return `${d} ${MONTHS_SHORT[m - 1]} ${y}`
    case 'EEE d MMM': return `${WEEKDAYS_SHORT[dow]} ${d} ${MONTHS_SHORT[m - 1]}`
    case 'EEE': return WEEKDAYS_SHORT[dow]
    case 'MMMM yyyy': return `${MONTHS[m - 1]} ${y}`
  }
}

export const yearOf = (iso: string) => Number(iso.slice(0, 4))

/** java.time.YearMonth.now(ROME).toString(). */
export const yearMonthRome = (now = Date.now()) => todayRome(now).slice(0, 7)

export { MONTHS, WEEKDAYS, WEEKDAYS_SHORT, MONTHS_SHORT }
