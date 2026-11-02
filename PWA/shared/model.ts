// Port of Models.java: the same objects and the same JSON keys, so the backup moves between the
// Android app and the PWA unchanged. `fromJson` applies the same defaults as Models.*.from().

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

export type MediaType = 'movie' | 'tv'

export type Media = {
  tmdbId: number
  collectionId: number
  id: string
  mediaType: string
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

type Json = Record<string, unknown>

const str = (o: Json, k: string, fallback = '') => (typeof o[k] === 'string' ? (o[k] as string) : o[k] == null ? fallback : String(o[k]))
const num = (o: Json, k: string, fallback = 0) => {
  const v = o[k]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return fallback
}
const int = (o: Json, k: string, fallback = 0) => Math.trunc(num(o, k, fallback))
const bool = (o: Json, k: string, fallback = false) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : o[k] === 'true' ? true : o[k] === 'false' ? false : fallback)
const arr = (o: Json, k: string): unknown[] => (Array.isArray(o[k]) ? (o[k] as unknown[]) : [])
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})

export const isSeries = (m: Pick<Media, 'mediaType'>) => m.mediaType === 'tv'
export const mediaImage = (m: Pick<Media, 'backdrop' | 'poster'>) => (m.backdrop === '' ? m.poster : m.backdrop)

export function emptyMedia(): Media {
  return {
    tmdbId: 0, collectionId: 0, id: '', mediaType: 'movie', title: '', originalTitle: '', year: 'S.D.', releaseDate: '',
    overview: 'Trama non disponibile.', collectionName: '', poster: '', backdrop: '', providerLink: '', trailerUrl: '',
    tagline: '', country: '', language: '', rating: 0, runtime: 0, episodeRuntime: 0, backdrops: [], genres: [],
    genreIds: [], flatrate: [], rent: [], buy: [], cast: [], directors: [],
  }
}

export function emptyPerson(): Person {
  return { id: 0, name: '', character: '', profile: '', director: false, knownFor: [] }
}

export const providerFromJson = (v: unknown): Provider => {
  const o = obj(v)
  return { id: int(o, 'id'), name: str(o, 'name'), logo: str(o, 'logo'), kind: str(o, 'kind') }
}
export const providerToJson = (p: Provider) => ({ id: p.id, name: p.name, logo: p.logo, kind: p.kind })

export const personFromJson = (v: unknown): Person => {
  const o = obj(v)
  return { ...emptyPerson(), id: int(o, 'id'), name: str(o, 'name'), profile: str(o, 'profile'), director: bool(o, 'director') }
}
export const personToJson = (p: Person) => ({ id: p.id, name: p.name, profile: p.profile, director: p.director })

export function mediaFromJson(v: unknown): Media {
  const o = obj(v)
  const rating = num(o, 'rating', Number.NaN)
  return {
    ...emptyMedia(),
    tmdbId: int(o, 'tmdbId'),
    id: str(o, 'id'),
    mediaType: str(o, 'mediaType', 'movie') || 'movie',
    title: str(o, 'title'),
    originalTitle: str(o, 'originalTitle'),
    year: o.year == null ? 'S.D.' : str(o, 'year'),
    releaseDate: str(o, 'releaseDate'),
    overview: o.overview == null ? 'Trama non disponibile.' : str(o, 'overview'),
    poster: str(o, 'poster'),
    backdrop: str(o, 'backdrop'),
    providerLink: str(o, 'providerLink'),
    trailerUrl: str(o, 'trailerUrl'),
    tagline: str(o, 'tagline'),
    country: str(o, 'country'),
    language: str(o, 'language'),
    // optDouble returns NaN when missing; NaN rating behaves as "n.d." everywhere (rating > 0 is false).
    rating: Number.isNaN(rating) ? 0 : rating,
    runtime: int(o, 'runtime'),
    episodeRuntime: int(o, 'episodeRuntime'),
    genres: arr(o, 'genres').map(String),
    genreIds: arr(o, 'genreIds').map((x) => Math.trunc(Number(x)) || 0),
    collectionId: int(o, 'collectionId'),
    collectionName: str(o, 'collectionName'),
    backdrops: arr(o, 'backdrops').map(String),
    flatrate: arr(o, 'flatrate').map(providerFromJson),
    rent: arr(o, 'rent').map(providerFromJson),
    buy: arr(o, 'buy').map(providerFromJson),
    directors: arr(o, 'directors').filter((x) => x && typeof x === 'object').map(personFromJson),
  }
}

export function mediaToJson(m: Media): Json {
  return {
    tmdbId: m.tmdbId, id: m.id, mediaType: m.mediaType, title: m.title, originalTitle: m.originalTitle,
    year: m.year, releaseDate: m.releaseDate, overview: m.overview, poster: m.poster, backdrop: m.backdrop,
    providerLink: m.providerLink, trailerUrl: m.trailerUrl, tagline: m.tagline, country: m.country, language: m.language,
    rating: m.rating, runtime: m.runtime, episodeRuntime: m.episodeRuntime, collectionId: m.collectionId,
    collectionName: m.collectionName, genres: [...m.genres], genreIds: [...m.genreIds], backdrops: [...m.backdrops],
    flatrate: m.flatrate.map(providerToJson), directors: m.directors.map(personToJson),
    rent: m.rent.map(providerToJson), buy: m.buy.map(providerToJson),
  }
}

export function entryFromJson(v: unknown): LibraryEntry {
  const o = obj(v)
  return {
    media: mediaFromJson(o.media && typeof o.media === 'object' ? o.media : {}),
    state: str(o, 'state', 'saved') || 'saved',
    nextSeason: int(o, 'nextSeason', 1),
    nextEpisode: int(o, 'nextEpisode', 1),
    watchedSeason: 'watchedSeason' in o && o.watchedSeason != null ? int(o, 'watchedSeason') : null,
    watchedEpisode: 'watchedEpisode' in o && o.watchedEpisode != null ? int(o, 'watchedEpisode') : null,
    completedEpisodeCount: int(o, 'completedEpisodeCount'),
    liked: 'liked' in o && o.liked != null ? bool(o, 'liked') : null,
    pinned: bool(o, 'pinned', false),
  }
}

export function entryToJson(e: LibraryEntry): Json {
  const o: Json = { media: mediaToJson(e.media), state: e.state, nextSeason: e.nextSeason, nextEpisode: e.nextEpisode }
  if (e.watchedSeason != null) o.watchedSeason = e.watchedSeason
  if (e.watchedEpisode != null) o.watchedEpisode = e.watchedEpisode
  o.completedEpisodeCount = e.completedEpisodeCount
  // org.json drops a null "liked": keep the same shape.
  if (e.liked != null) o.liked = e.liked
  o.pinned = e.pinned
  return o
}

export function newEntry(media: Media): LibraryEntry {
  return { media, state: 'saved', nextSeason: 1, nextEpisode: 1, watchedSeason: null, watchedEpisode: null, completedEpisodeCount: 0, liked: null, pinned: false }
}

// --- follows (ReleaseFollows.Follow, PersonFollows.Follow) ------------------------------------

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

export function releaseFollowFromJson(v: unknown): ReleaseFollow {
  const o = obj(v)
  return {
    media: mediaFromJson(o.media ?? {}), followedAt: int(o, 'followedAt'), initialized: bool(o, 'initialized'), status: str(o, 'status'),
    lastSeason: int(o, 'lastSeason'), lastEpisode: int(o, 'lastEpisode'), lastAirDate: str(o, 'lastAirDate'),
    nextSeason: int(o, 'nextSeason'), nextEpisode: int(o, 'nextEpisode'), nextAirDate: str(o, 'nextAirDate'), nextName: str(o, 'nextName'),
    announcedSeason: int(o, 'announcedSeason'), releaseDate: str(o, 'releaseDate'), releaseKind: str(o, 'releaseKind'),
    streamingNames: str(o, 'streamingNames'), releaseNotified: bool(o, 'releaseNotified'), streamingNotified: bool(o, 'streamingNotified'),
  }
}

export function releaseFollowToJson(f: ReleaseFollow): Json {
  return {
    media: mediaToJson(f.media), followedAt: f.followedAt, initialized: f.initialized, status: f.status,
    lastSeason: f.lastSeason, lastEpisode: f.lastEpisode, lastAirDate: f.lastAirDate,
    nextSeason: f.nextSeason, nextEpisode: f.nextEpisode, nextAirDate: f.nextAirDate, nextName: f.nextName, announcedSeason: f.announcedSeason,
    releaseDate: f.releaseDate, releaseKind: f.releaseKind, streamingNames: f.streamingNames,
    releaseNotified: f.releaseNotified, streamingNotified: f.streamingNotified,
  }
}

export function newReleaseFollow(media: Media, now: number): ReleaseFollow {
  return {
    media, followedAt: now, initialized: false, status: '', lastSeason: 0, lastEpisode: 0, nextSeason: 0, nextEpisode: 0,
    announcedSeason: 0, lastAirDate: '', nextAirDate: '', nextName: '', releaseDate: '', releaseKind: '', streamingNames: '',
    releaseNotified: false, streamingNotified: false,
  }
}

export type PersonFollow = { person: Person; followedAt: number; initialized: boolean; known: string[] }

export const personKey = (p: Pick<Person, 'director' | 'id'>) => (p.director ? 'director-' : 'person-') + p.id

export function personFollowFromJson(v: unknown): PersonFollow {
  const o = obj(v)
  return { person: personFromJson(o.person ?? {}), followedAt: int(o, 'followedAt'), initialized: bool(o, 'initialized'), known: [...new Set(arr(o, 'known').map(String))] }
}

export function personFollowToJson(f: PersonFollow): Json {
  return { person: personToJson(f.person), followedAt: f.followedAt, initialized: f.initialized, known: [...f.known] }
}

// --- TV reminders (TvReminderReceiver records) ------------------------------------------------

export type TvReminder = { key: string; title: string; channel: string; start: number; end: number; minutes: number; trigger: number }

// --- per-account preferences (LibraryStore prefs "streamwise-native") ---------------------------

export type LibrarySortKey = 'ORIGINAL' | 'TITLE' | 'NEWEST' | 'OLDEST' | 'RATING'

export type Prefs = {
  genres: string[]
  subscriptions: number[]
  subscriptionFilters: Record<string, string>
  librarySort: Record<string, string>
  libraryGrid: Record<string, boolean>
  hideShowCredits: boolean
  onboardingDone: boolean
}

export const defaultPrefs = (): Prefs => ({
  genres: [], subscriptions: [], subscriptionFilters: {}, librarySort: {}, libraryGrid: {}, hideShowCredits: true, onboardingDone: false,
})

/** One cached watch-provider snapshot (SubscriptionRepository prefs, keyed by media id). */
export type AvailabilityRecord = { checkedAt: number; providers: Provider[] }

/** Everything GET /api/state returns. */
export type AppState = {
  revision: number
  library: LibraryEntry[]
  follows: ReleaseFollow[]
  people: PersonFollow[]
  reminders: TvReminder[]
  prefs: Prefs
  services: Provider[]
  availability: Record<string, AvailabilityRecord>
  ai: { configured: boolean; accountId: string }
  lastCheck: number
  notices?: { id: string; title: string; text: string; mediaId: string; subtext: string; poster: string; at: number }[]
}
