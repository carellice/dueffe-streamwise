// The data model of the native app (Models.java), with the same JSON keys, so a backup moves
// between the phone and the PWA in both directions. Pure TypeScript: used by server and web.

export type Provider = { id: number; name: string; logo: string; kind: string }

export type Person = {
  id: number
  name: string
  character: string
  profile: string
  director: boolean
  knownFor: Media[]
}

export type Episode = { season: number; number: number; runtime: number; name: string; overview: string; still: string }

export type Season = { number: number; episodeCount: number; name: string; episodes: Episode[] }

export type Media = {
  tmdbId: number
  collectionId: number
  id: string
  mediaType: 'movie' | 'tv' | string
  title: string
  originalTitle: string
  year: string
  releaseDate: string
  overview: string
  collectionName: string
  poster: string
  backdrop: string
  providerLink: string
  trailerUrl: string
  tagline: string
  country: string
  language: string
  rating: number
  runtime: number
  episodeRuntime: number
  backdrops: string[]
  genres: string[]
  genreIds: number[]
  flatrate: Provider[]
  rent: Provider[]
  buy: Provider[]
  cast: Person[]
  directors: Person[]
}

export type EntryState = 'saved' | 'progress' | 'watched' | 'hidden' | string

export type LibraryEntry = {
  media: Media
  state: EntryState
  nextSeason: number
  nextEpisode: number
  watchedSeason: number | null
  watchedEpisode: number | null
  completedEpisodeCount: number
  liked: boolean | null
  pinned: boolean
}

export const NO_OVERVIEW = 'Trama non disponibile.'

export const isSeries = (m: Media) => m.mediaType === 'tv'
export const mediaImage = (m: Media) => (m.backdrop ? m.backdrop : m.poster)

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown, fallback = ''): string => (v == null ? fallback : typeof v === 'string' ? v : String(v))
const int = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}
const num = (v: unknown, fallback = NaN): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : fallback)

export function emptyMedia(): Media {
  return {
    tmdbId: 0, collectionId: 0, id: '', mediaType: 'movie', title: '', originalTitle: '', year: 'S.D.', releaseDate: '',
    overview: NO_OVERVIEW, collectionName: '', poster: '', backdrop: '', providerLink: '', trailerUrl: '', tagline: '',
    country: '', language: '', rating: 0, runtime: 0, episodeRuntime: 0, backdrops: [], genres: [], genreIds: [],
    flatrate: [], rent: [], buy: [], cast: [], directors: [],
  }
}

export function emptyPerson(): Person {
  return { id: 0, name: '', character: '', profile: '', director: false, knownFor: [] }
}

export function providerFrom(o: unknown): Provider {
  const j = obj(o)
  return { id: int(j.id), name: str(j.name), logo: str(j.logo), kind: str(j.kind) }
}

export function personFrom(o: unknown): Person {
  const j = obj(o)
  return { ...emptyPerson(), id: int(j.id), name: str(j.name), profile: str(j.profile), director: bool(j.director) }
}

/** Models.Media.from: optString/optInt defaults included ("S.D.", "Trama non disponibile."). */
export function mediaFrom(o: unknown): Media {
  const j = obj(o)
  const m = emptyMedia()
  m.tmdbId = int(j.tmdbId)
  m.id = str(j.id)
  m.mediaType = str(j.mediaType, 'movie') || 'movie'
  m.title = str(j.title)
  m.originalTitle = str(j.originalTitle)
  m.year = j.year == null ? 'S.D.' : str(j.year)
  m.releaseDate = str(j.releaseDate)
  m.overview = j.overview == null ? NO_OVERVIEW : str(j.overview)
  m.poster = str(j.poster)
  m.backdrop = str(j.backdrop)
  m.providerLink = str(j.providerLink)
  m.trailerUrl = str(j.trailerUrl)
  m.tagline = str(j.tagline)
  m.country = str(j.country)
  m.language = str(j.language)
  m.rating = num(j.rating)
  m.runtime = int(j.runtime)
  m.episodeRuntime = int(j.episodeRuntime)
  m.genres = arr(j.genres).map((g) => str(g))
  m.genreIds = arr(j.genreIds).map((g) => int(g))
  m.collectionId = int(j.collectionId)
  m.collectionName = str(j.collectionName)
  m.backdrops = arr(j.backdrops).map((g) => str(g))
  m.flatrate = arr(j.flatrate).map(providerFrom)
  m.rent = arr(j.rent).map(providerFrom)
  m.buy = arr(j.buy).map(providerFrom)
  m.directors = arr(j.directors).filter((p) => p && typeof p === 'object').map(personFrom)
  return m
}

/** Models.Media.json: the keys the native backup writes (cast and knownFor are not stored). */
export function mediaJson(m: Media): Json {
  return {
    tmdbId: m.tmdbId, id: m.id, mediaType: m.mediaType, title: m.title, originalTitle: m.originalTitle, year: m.year,
    releaseDate: m.releaseDate, overview: m.overview, poster: m.poster, backdrop: m.backdrop, providerLink: m.providerLink,
    trailerUrl: m.trailerUrl, tagline: m.tagline, country: m.country, language: m.language,
    rating: Number.isFinite(m.rating) ? m.rating : 0, runtime: m.runtime, episodeRuntime: m.episodeRuntime,
    collectionId: m.collectionId, collectionName: m.collectionName, genres: m.genres, genreIds: m.genreIds,
    backdrops: m.backdrops, flatrate: m.flatrate.map(providerJson),
    directors: m.directors.map((p) => ({ id: p.id, name: p.name, profile: p.profile, director: p.director })),
    rent: m.rent.map(providerJson), buy: m.buy.map(providerJson),
  }
}

export const providerJson = (p: Provider): Json => ({ id: p.id, name: p.name, logo: p.logo, kind: p.kind })
export const personJson = (p: Person): Json => ({ id: p.id, name: p.name, profile: p.profile, director: p.director })

export function emptyEntry(media: Media): LibraryEntry {
  return { media, state: 'saved', nextSeason: 1, nextEpisode: 1, watchedSeason: null, watchedEpisode: null, completedEpisodeCount: 0, liked: null, pinned: false }
}

export function entryFrom(o: unknown): LibraryEntry {
  const j = obj(o)
  const e = emptyEntry(mediaFrom(j.media))
  e.state = str(j.state, 'saved') || 'saved'
  e.nextSeason = int(j.nextSeason, 1)
  e.nextEpisode = int(j.nextEpisode, 1)
  if ('watchedSeason' in j && j.watchedSeason != null) e.watchedSeason = int(j.watchedSeason)
  if ('watchedEpisode' in j && j.watchedEpisode != null) e.watchedEpisode = int(j.watchedEpisode)
  e.completedEpisodeCount = int(j.completedEpisodeCount)
  if ('liked' in j && j.liked != null) e.liked = bool(j.liked)
  e.pinned = bool(j.pinned, false)
  return e
}

export function entryJson(e: LibraryEntry): Json {
  const o: Json = { media: mediaJson(e.media), state: e.state, nextSeason: e.nextSeason, nextEpisode: e.nextEpisode }
  if (e.watchedSeason != null) o.watchedSeason = e.watchedSeason
  if (e.watchedEpisode != null) o.watchedEpisode = e.watchedEpisode
  o.completedEpisodeCount = e.completedEpisodeCount
  o.liked = e.liked
  o.pinned = e.pinned
  return o
}

// --- followed titles and people (ReleaseFollows.Follow, PersonFollows.Follow) ------------------

export type ReleaseFollow = {
  media: Media
  followedAt: number
  initialized: boolean
  status: string
  lastSeason: number
  lastEpisode: number
  nextSeason: number
  nextEpisode: number
  announcedSeason: number
  lastAirDate: string
  nextAirDate: string
  nextName: string
  releaseDate: string
  releaseKind: string
  streamingNames: string
  releaseNotified: boolean
  streamingNotified: boolean
}

export function newReleaseFollow(media: Media, now = Date.now()): ReleaseFollow {
  return {
    media, followedAt: now, initialized: false, status: '', lastSeason: 0, lastEpisode: 0, nextSeason: 0, nextEpisode: 0,
    announcedSeason: 0, lastAirDate: '', nextAirDate: '', nextName: '', releaseDate: '', releaseKind: '', streamingNames: '',
    releaseNotified: false, streamingNotified: false,
  }
}

export function releaseFollowFrom(o: unknown): ReleaseFollow {
  const j = obj(o)
  const f = newReleaseFollow(mediaFrom(j.media), int(j.followedAt))
  f.initialized = bool(j.initialized)
  f.status = str(j.status)
  f.lastSeason = int(j.lastSeason)
  f.lastEpisode = int(j.lastEpisode)
  f.lastAirDate = str(j.lastAirDate)
  f.nextSeason = int(j.nextSeason)
  f.nextEpisode = int(j.nextEpisode)
  f.nextAirDate = str(j.nextAirDate)
  f.nextName = str(j.nextName)
  f.announcedSeason = int(j.announcedSeason)
  f.releaseDate = str(j.releaseDate)
  f.releaseKind = str(j.releaseKind)
  f.streamingNames = str(j.streamingNames)
  f.releaseNotified = bool(j.releaseNotified)
  f.streamingNotified = bool(j.streamingNotified)
  return f
}

export function releaseFollowJson(f: ReleaseFollow): Json {
  return {
    media: mediaJson(f.media), followedAt: f.followedAt, initialized: f.initialized, status: f.status,
    lastSeason: f.lastSeason, lastEpisode: f.lastEpisode, lastAirDate: f.lastAirDate,
    nextSeason: f.nextSeason, nextEpisode: f.nextEpisode, nextAirDate: f.nextAirDate, nextName: f.nextName, announcedSeason: f.announcedSeason,
    releaseDate: f.releaseDate, releaseKind: f.releaseKind, streamingNames: f.streamingNames,
    releaseNotified: f.releaseNotified, streamingNotified: f.streamingNotified,
  }
}

export type PersonFollow = { person: Person; followedAt: number; initialized: boolean; known: string[] }

export const personKey = (p: Person) => (p.director ? 'director-' : 'person-') + p.id

export function personFollowFrom(o: unknown): PersonFollow {
  const j = obj(o)
  return { person: personFrom(j.person), followedAt: int(j.followedAt), initialized: bool(j.initialized), known: [...new Set(arr(j.known).map((k) => str(k)))] }
}

export function personFollowJson(f: PersonFollow): Json {
  return { person: personJson(f.person), followedAt: f.followedAt, initialized: f.initialized, known: f.known }
}

// --- TV guide (TvGuideRepository.Programme) ----------------------------------------------------

export type Programme = {
  channel: string
  title: string
  description: string
  image: string
  episode: string
  subtitle: string
  type: string
  /** Epoch milliseconds. */
  start: number
  end: number
}

/** Java's Instant.toString() for whole seconds ("2025-10-23T19:30:00Z"), used in the reminder key. */
export function instantString(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}
export const programmeKey = (p: Programme) => `${p.channel}|${instantString(p.start)}|${p.title}`
export const programmeSearchTitle = (p: Programme) =>
  p.title.replace(/\s*-\s*(stag\.|s\d+\s*e\d+).*/i, '').replace(/\s*\(\d{4}\)\s*$/, '').trim()

export type TvReminder = { key: string; title: string; channel: string; start: number; end: number; minutes: number; trigger: number }

// --- AI ----------------------------------------------------------------------------------------

export type AiPick = { title: string; year: number | null; type: 'movie' | 'tv'; reason: string }
export type AiIdentification = { picks: AiPick[]; question: string; options: string[] }

// --- backup (LibraryStore.exportJson) ----------------------------------------------------------

export type Backup = {
  format: 'streamwise-backup'
  version: number
  exportedAt: string
  library: Json[]
  genres: string[]
  subscriptions: number[]
  follows: Json[]
  followedPeople: Json[]
}
