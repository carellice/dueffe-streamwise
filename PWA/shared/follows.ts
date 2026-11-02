// Port of ReleaseFollows.java and PersonFollows.java: what gets announced and the Italian texts.
// The server runs evaluate() hourly (ReleaseCheckWorker); the app uses describe()/shortLabel().
import { formatIt, plusDays, yearOf } from './dates.ts'
import { isSeries, type Media, type PersonFollow, type ReleaseFollow } from './model.ts'
import { releaseHasNext, type ReleaseInfo } from './tmdb.ts'

export type Notice = { kind: string; title: string; text: string }

export const followSeries = (f: ReleaseFollow) => isSeries(f.media)
export const followCompleted = (f: ReleaseFollow) => f.initialized && !followSeries(f) && f.streamingNotified

export function upcomingDate(f: ReleaseFollow, today: string): string {
  const date = followSeries(f) ? f.nextAirDate : f.releaseDate
  return date !== '' && date >= today && !followCompleted(f) ? date : ''
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Dated upcoming releases first (soonest on top), then undated ones, finally films already streaming. */
export function sortFollows(list: ReleaseFollow[], today: string): ReleaseFollow[] {
  const rank = (f: ReleaseFollow) => (followCompleted(f) ? 2 : upcomingDate(f, today) === '' ? 1 : 0)
  return [...list].sort((a, b) => rank(a) - rank(b) || cmp(upcomingDate(a, today), upcomingDate(b, today)) || a.media.title.toLowerCase().localeCompare(b.media.title.toLowerCase(), 'it'))
}

export function sortPeople(list: PersonFollow[]): PersonFollow[] {
  return [...list].sort((a, b) => a.person.name.toLowerCase().localeCompare(b.person.name.toLowerCase(), 'it'))
}

function compare(seasonA: number, episodeA: number, seasonB: number, episodeB: number): number {
  return seasonA !== seasonB ? Math.sign(seasonA - seasonB) : Math.sign(episodeA - episodeB)
}

/** Most recent episode whose date has arrived in Italy, from TMDB's last and next episode fields. */
export function latestAired(info: ReleaseInfo, today: string): [number, number] | null {
  let best: [number, number] | null = null
  if (info.lastSeason > 0 && info.lastEpisode > 0 && (info.lastAirDate === '' || info.lastAirDate <= today)) best = [info.lastSeason, info.lastEpisode]
  if (releaseHasNext(info) && info.nextAirDate !== '' && info.nextAirDate <= today && (best == null || compare(info.nextSeason, info.nextEpisode, best[0], best[1]) > 0)) best = [info.nextSeason, info.nextEpisode]
  return best
}

function setNext(f: ReleaseFollow, info: ReleaseInfo, today: string) {
  const upcoming = releaseHasNext(info) && (info.nextAirDate === '' || info.nextAirDate > today)
  f.nextSeason = upcoming ? info.nextSeason : 0
  f.nextEpisode = upcoming ? info.nextEpisode : 0
  f.nextAirDate = upcoming ? info.nextAirDate : ''
  f.nextName = upcoming ? info.nextName : ''
}

function setRelease(f: ReleaseFollow, info: ReleaseInfo) {
  if (info.theatricalDate !== '') { f.releaseDate = info.theatricalDate; f.releaseKind = 'cinema' }
  else if (info.digitalDate !== '') { f.releaseDate = info.digitalDate; f.releaseKind = 'digital' }
  else { f.releaseDate = info.fallbackDate; f.releaseKind = '' }
  const names: string[] = []
  for (const p of info.streaming) if (names.length < 3 && !names.includes(p.name)) names.push(p.name)
  f.streamingNames = names.join(', ')
}

const released = (f: ReleaseFollow, today: string) => f.releaseDate !== '' && f.releaseDate <= today

/** Records the current state as already known: following never notifies about past releases. */
export function initialize(f: ReleaseFollow, info: ReleaseInfo, today: string) {
  f.status = info.status
  if (followSeries(f)) {
    const latest = latestAired(info, today)
    if (latest != null) {
      f.lastSeason = latest[0]; f.lastEpisode = latest[1]
      f.lastAirDate = latest[0] === info.nextSeason && latest[1] === info.nextEpisode ? info.nextAirDate : info.lastAirDate
    }
    setNext(f, info, today)
    f.announcedSeason = releaseHasNext(info) && info.nextEpisode === 1 ? info.nextSeason : 0
  } else {
    setRelease(f, info)
    const available = info.streaming.length > 0
    f.releaseNotified = available || released(f, today)
    f.streamingNotified = available
  }
  f.initialized = true
}

/** Applies fresh TMDB data (mutating [f]) and returns what deserves a notification. */
export function evaluate(f: ReleaseFollow, info: ReleaseInfo, today: string): Notice[] {
  const notices: Notice[] = []
  if (!f.initialized) { initialize(f, info, today); return notices }
  f.status = info.status
  if (followSeries(f)) {
    const latest = latestAired(info, today)
    if (latest != null && compare(latest[0], latest[1], f.lastSeason, f.lastEpisode) > 0) {
      const fromNext = latest[0] === info.nextSeason && latest[1] === info.nextEpisode
      const date = fromNext ? info.nextAirDate : info.lastAirDate
      const name = fromNext ? info.nextName : info.lastName
      notices.push({ kind: 'episode', title: f.media.title, text: episodeText(f, latest[0], latest[1], date, name, today) })
      f.lastSeason = latest[0]; f.lastEpisode = latest[1]; f.lastAirDate = date
    }
    setNext(f, info, today)
    if (releaseHasNext(info) && info.nextEpisode === 1 && info.nextSeason > f.lastSeason && info.nextSeason !== f.announcedSeason && info.nextAirDate > today) {
      notices.push({ kind: 'season', title: f.media.title, text: 'La stagione ' + info.nextSeason + ' arriva ' + relativeDay(info.nextAirDate, today, true) + '. Ti avviserò all’uscita di ogni episodio.' })
      f.announcedSeason = info.nextSeason
    }
    return notices
  }
  setRelease(f, info)
  const available = info.streaming.length > 0
  if (!f.releaseNotified && available) {
    notices.push({ kind: 'streaming', title: f.media.title, text: 'Ora disponibile in streaming su ' + f.streamingNames + '.' })
    f.releaseNotified = true; f.streamingNotified = true
  } else if (!f.releaseNotified && released(f, today)) {
    notices.push({ kind: 'release', title: f.media.title, text: releaseText(f, today) })
    f.releaseNotified = true
  } else if (f.releaseNotified && !f.streamingNotified && available) {
    notices.push({ kind: 'streaming', title: f.media.title, text: 'È arrivato in streaming su ' + f.streamingNames + '.' })
    f.streamingNotified = true
  }
  return notices
}

/** Whether following still makes sense: an ended series or a film already streaming has nothing left to announce. */
export function worthFollowing(media: Media, info: ReleaseInfo): boolean {
  return isSeries(media) ? !(info.status === 'Ended' || info.status === 'Canceled') || releaseHasNext(info) : info.streaming.length === 0
}

/** Full sentence for the detail page. */
export function describe(f: ReleaseFollow, today: string): string {
  if (followSeries(f)) {
    if (f.nextSeason > 0 && f.nextEpisode > 0) {
      if (f.nextAirDate === '') return 'Prossimo episodio: S' + f.nextSeason + ' · E' + f.nextEpisode + ' · data da confermare'
      if (f.nextEpisode === 1) return 'La stagione ' + f.nextSeason + ' arriva ' + relativeDay(f.nextAirDate, today, true)
      return 'Prossimo episodio: S' + f.nextSeason + ' · E' + f.nextEpisode + ' ' + relativeDay(f.nextAirDate, today, true)
    }
    switch (f.status) {
      case 'Ended': return 'Serie conclusa: non sono previsti nuovi episodi'
      case 'Canceled': return 'Serie cancellata: non sono previsti nuovi episodi'
      case 'Returning Series': return 'Nuovi episodi non ancora annunciati'
      case 'In Production': case 'Planned': case 'Pilot': return 'In produzione: data di uscita non ancora annunciata'
      default: return 'Nessun episodio in programma al momento'
    }
  }
  if (f.streamingNotified && f.streamingNames !== '') return 'Disponibile in streaming su ' + f.streamingNames
  if (f.releaseDate === '') return 'Data di uscita italiana da confermare'
  const where = f.releaseKind === 'cinema' ? 'al cinema' : f.releaseKind === 'digital' ? 'in digitale' : ''
  if (f.releaseDate > today) {
    const lead = f.releaseKind === 'cinema' ? 'Al cinema ' : f.releaseKind === 'digital' ? 'In digitale ' : 'Uscita prevista '
    const day = relativeDay(f.releaseDate, today, false)
    return lead + (where === '' ? day.replace(/^il /, '') : day.replace(/^il /, 'dal '))
  }
  return 'Uscito ' + (where === '' ? '' : where + ' ') + relativeDay(f.releaseDate, today, false) + ' · non ancora in streaming'
}

/** Compact label under a poster. */
export function shortLabel(f: ReleaseFollow, today: string): string {
  if (!f.initialized) return 'Controllo in corso…'
  if (followSeries(f)) {
    if (f.nextSeason > 0 && f.nextEpisode > 0) {
      const date = f.nextAirDate === '' ? 'data da confermare' : shortDay(f.nextAirDate, today)
      return (f.nextEpisode === 1 ? 'Stagione ' + f.nextSeason : 'S' + f.nextSeason + ' · E' + f.nextEpisode) + ' · ' + date
    }
    return f.status === 'Ended' || f.status === 'Canceled' ? 'Serie conclusa' : 'Data da annunciare'
  }
  if (f.streamingNotified) return 'In streaming'
  if (f.releaseDate === '') return 'Data da confermare'
  if (f.releaseDate > today) return 'Esce ' + shortDay(f.releaseDate, today)
  return 'Uscito · attesa streaming'
}

const meaningfulName = (name: string | null | undefined) => name != null && name.trim() !== '' && !/^(episodio|episode)\s*\d+$/i.test(name.trim())

function episodeText(f: ReleaseFollow, season: number, episode: number, date: string, name: string, today: string): string {
  const when = date === '' || date === today ? 'oggi' : relativeDay(date, today, false)
  const title = meaningfulName(name) ? ' «' + name + '»' : ''
  if (season === f.lastSeason) {
    const count = episode - f.lastEpisode
    if (count > 1) return count + ' nuovi episodi, fino a S' + season + ' · E' + episode + title + ' (uscita ' + when + ').'
    return 'Nuovo episodio ' + (when === 'oggi' ? 'in uscita oggi' : 'uscito ' + when) + ': S' + season + ' · E' + episode + title + '.'
  }
  if (episode === 1) return 'Inizia la stagione ' + season + ': episodio 1' + title + ' ' + (when === 'oggi' ? 'in uscita oggi' : 'uscito ' + when) + '.'
  return 'Stagione ' + season + ' disponibile: ' + episode + ' episodi usciti, fino a E' + episode + title + '.'
}

function releaseText(f: ReleaseFollow, today: string): string {
  const isToday = f.releaseDate === today
  const when = isToday ? 'oggi' : relativeDay(f.releaseDate, today, false)
  if (f.releaseKind === 'cinema') return (isToday ? 'Esce oggi al cinema in Italia.' : 'Uscito al cinema ' + when + '.') + ' Ti avviserò quando arriverà in streaming.'
  if (f.releaseKind === 'digital') return (isToday ? 'Disponibile da oggi' : 'Disponibile da ' + when) + ' a noleggio o in acquisto digitale. Ti avviserò quando arriverà in streaming.'
  return (isToday ? 'Esce oggi.' : 'È uscito ' + when + '.') + ' Ti avviserò quando arriverà in streaming.'
}

const validIso = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso + 'T00:00:00Z'))

/** "oggi", "domani", "ieri", "giovedì 23 ottobre" (with the year when it differs). */
export function relativeDay(iso: string, today: string, weekday: boolean): string {
  if (!validIso(iso)) return 'a data da confermare'
  if (iso === today) return 'oggi'
  if (iso === plusDays(today, 1)) return 'domani'
  if (iso === plusDays(today, -1)) return 'ieri'
  if (yearOf(iso) !== yearOf(today)) return 'il ' + formatIt(iso, 'd MMMM yyyy')
  return weekday && iso > today ? formatIt(iso, 'EEEE d MMMM') : 'il ' + formatIt(iso, 'd MMMM')
}

function shortDay(iso: string, today: string): string {
  if (!validIso(iso)) return 'data da confermare'
  if (iso === today) return 'oggi'
  if (iso === plusDays(today, 1)) return 'domani'
  return formatIt(iso, yearOf(iso) !== yearOf(today) ? 'd MMM yyyy' : 'd MMM')
}

// --- people ---------------------------------------------------------------------------------

/** Credits released longer ago than this are late additions to TMDB, not news. */
const RECENT_DAYS = 120

/**
 * Compares the full filmography (talk shows included, so toggling the filter never looks like news)
 * with the known credits and returns the new titles worth announcing. Mutates [f].
 */
export function evaluatePerson(f: PersonFollow, credits: Media[], hiddenShows: Set<string>, today: string): Media[] {
  const fresh: Media[] = []
  const first = !f.initialized
  const known = new Set(f.known)
  for (const m of credits) {
    if (known.has(m.id)) continue
    known.add(m.id)
    f.known.push(m.id)
    if (first) continue
    if (hiddenShows.has(m.id)) continue
    if (m.releaseDate !== '' && m.releaseDate < plusDays(today, -RECENT_DAYS)) continue
    fresh.push(m)
  }
  f.initialized = true
  return fresh
}

export function personNoticeText(m: Media, today: string): string {
  const kind = isSeries(m) ? 'Nuova serie' : 'Nuovo film'
  if (m.releaseDate === '') return kind + ': «' + m.title + '» · data da annunciare.'
  const future = m.releaseDate > today
  return kind + ': «' + m.title + '» · ' + (future ? 'esce ' : 'uscito ') + relativeDay(m.releaseDate, today, future) + '.'
}
