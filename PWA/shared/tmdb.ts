// TmdbApi.java ported line by line. The HTTP call is injected: the server calls TMDB with its key,
// the web app goes through the server's /api/tmdb proxy (the key never reaches the browser).

import { plusDays, today as romeToday } from './dates.ts'
import { emptyMedia, emptyPerson, isSeries, NO_OVERVIEW, type Episode, type Media, type Person, type Provider, type Season } from './model.ts'

type Json = Record<string, any>
export type Params = Record<string, string>
export type Get = (path: string, params: Params | null) => Promise<Json>

const MOVIE_GENRES: Record<number, string> = { 12: 'Avventura', 14: 'Fantasy', 16: 'Animazione', 18: 'Dramma', 27: 'Horror', 28: 'Azione', 35: 'Commedia', 36: 'Storia', 53: 'Thriller', 80: 'Crime', 99: 'Documentario', 878: 'Fantascienza', 9648: 'Mistero', 10402: 'Musica', 10749: 'Romance', 10751: 'Famiglia', 10752: 'Guerra' }
const TV_GENRES: Record<number, string> = { 16: 'Animazione', 18: 'Dramma', 35: 'Commedia', 80: 'Crime', 99: 'Documentario', 9648: 'Mistero', 10751: 'Famiglia', 10759: 'Azione e avventura', 10762: 'Kids', 10764: 'Reality', 10765: 'Sci-fi e fantasy', 10767: 'Talk', 10768: 'Guerra e politica' }

export type Genre = { id: string; label: string; movie: number; tv: number }
export const genreValue = (g: Genre, type: string) => (type === 'tv' ? g.tv : g.movie)
export const GENRES: Genre[] = [
  { id: 'action', label: 'Azione', movie: 28, tv: 10759 },
  { id: 'comedy', label: 'Commedia', movie: 35, tv: 35 },
  { id: 'drama', label: 'Dramma', movie: 18, tv: 18 },
  { id: 'thriller', label: 'Thriller / crime', movie: 53, tv: 80 },
  { id: 'sci-fi', label: 'Sci-fi / fantasy', movie: 878, tv: 10765 },
  { id: 'horror', label: 'Horror', movie: 27, tv: 0 },
  { id: 'documentary', label: 'Documentario', movie: 99, tv: 99 },
  { id: 'erotic', label: 'Erotico', movie: -1, tv: -1 },
]

export type Platform = { id: string; label: string; providerId: number }
export const PLATFORMS: Platform[] = [
  { id: 'netflix', label: 'Netflix', providerId: 8 },
  { id: 'prime-video', label: 'Prime Video', providerId: 119 },
  { id: 'apple-tv-plus', label: 'Apple TV+', providerId: 350 },
  { id: 'disney-plus', label: 'Disney+', providerId: 337 },
  { id: 'paramount-plus', label: 'Paramount+', providerId: 531 },
  { id: 'max', label: 'HBO Max', providerId: 1899 },
]

export type ReleasePage = { media: Media[]; hasMore: boolean; nextPage: number }

/** Release state used by followed titles: episode schedule for series, Italian dates and streaming for films. */
export type ReleaseInfo = {
  status: string; lastAirDate: string; lastName: string; nextAirDate: string; nextName: string
  theatricalDate: string; digitalDate: string; fallbackDate: string
  lastSeason: number; lastEpisode: number; nextSeason: number; nextEpisode: number
  streaming: Provider[]
}
export const infoEnded = (i: ReleaseInfo) => i.status === 'Ended' || i.status === 'Canceled'
export const infoHasNext = (i: ReleaseInfo) => i.nextSeason > 0 && i.nextEpisode > 0

const opt = (o: Json | null | undefined, k: string): Json | null => {
  const v = o?.[k]
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null
}
const optArr = (o: Json | null | undefined, k: string): any[] | null => (Array.isArray(o?.[k]) ? o![k] : null)
const optStr = (o: Json | null | undefined, k: string, fallback = ''): string => {
  const v = o?.[k]
  if (v == null) return fallback
  return typeof v === 'string' ? v : String(v)
}
const optInt = (o: Json | null | undefined, k: string): number => {
  const v = Number(o?.[k])
  return Number.isFinite(v) ? Math.trunc(v) : 0
}
const optNum = (o: Json | null | undefined, k: string): number => {
  const v = o?.[k]
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : NaN
}

export function image(path: string | null | undefined, size: string): string {
  return !path ? '' : `https://image.tmdb.org/t/p/${size}${path}`
}

function dateOnly(raw: string | null | undefined): string {
  if (!raw || raw.length < 10) return ''
  const d = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : ''
}

const SHOW_GENRES = new Set([10763, 10764, 10767])

/** Talk shows, late shows, news, reality and appearances as oneself (award nights, interviews, guest spots). */
export function isShowCredit(o: Json): boolean {
  const ids = optArr(o, 'genre_ids')
  if (optStr(o, 'media_type') === 'tv' && ids) for (const id of ids) if (SHOW_GENRES.has(Number(id))) return true
  const character = optStr(o, 'character').trim().toLowerCase()
  return /^(self|himself|herself|themselves|themself|se stesso|se stessa|lui stesso|lei stessa)\b.*$/s.test(character) ||
    /^.*\((self|himself|herself|voice\s*-\s*self)\)$|^.*\b(host|guest|presenter|musical guest)$/s.test(character)
}

export function availableInItaly(detail: Json): boolean {
  const italy = opt(opt(opt(detail, 'watch/providers'), 'results'), 'IT')
  if (italy) for (const kind of ['flatrate', 'free', 'ads', 'rent', 'buy']) {
    const providers = optArr(italy, kind)
    if (providers && providers.length > 0) return true
  }
  // Domestic broadcasters also cover series on Italian television, even
  // when JustWatch has not yet indexed their free catch-up catalog.
  for (const network of optArr(detail, 'networks') ?? []) if (network && optStr(network, 'origin_country') === 'IT') return true
  return false
}

export function readableLocalizedTitle(title: string | null | undefined): boolean {
  if (!title || !title.trim() || title === 'Titolo senza nome') return false
  let readable = false
  for (const ch of title) {
    if (/\p{L}/u.test(ch)) {
      if (!/\p{Script=Latin}/u.test(ch)) return false
      readable = true
    }
    if (ch >= '0' && ch <= '9') readable = true
  }
  return readable
}

export function italianReleaseDate(response: Json, from: string, to: string): string {
  for (const country of optArr(response, 'results') ?? []) {
    if (!country || optStr(country, 'iso_3166_1') !== 'IT') continue
    const dates = optArr(country, 'release_dates')
    if (!dates) continue
    for (const type of [3, 2, 4, 5, 6]) {
      let chosen = ''
      for (const entry of dates) {
        if (!entry || optInt(entry, 'type') !== type) continue
        const date = dateOnly(optStr(entry, 'release_date'))
        if (date && date >= from && date <= to && (!chosen || date < chosen)) chosen = date
      }
      if (chosen) return chosen
    }
  }
  return ''
}

export function parseReleaseInfo(o: Json, series: boolean): ReleaseInfo {
  const info: ReleaseInfo = { status: optStr(o, 'status'), lastAirDate: '', lastName: '', nextAirDate: '', nextName: '', theatricalDate: '', digitalDate: '', fallbackDate: '', lastSeason: 0, lastEpisode: 0, nextSeason: 0, nextEpisode: 0, streaming: [] }
  const italy = opt(opt(opt(o, 'watch/providers'), 'results'), 'IT')
  info.streaming = providers(italy ? optArr(italy, 'flatrate') : null, 'flatrate')
  if (series) {
    const last = opt(o, 'last_episode_to_air'), next = opt(o, 'next_episode_to_air')
    if (last) { info.lastSeason = optInt(last, 'season_number'); info.lastEpisode = optInt(last, 'episode_number'); info.lastAirDate = dateOnly(optStr(last, 'air_date')); info.lastName = optStr(last, 'name') }
    if (next) { info.nextSeason = optInt(next, 'season_number'); info.nextEpisode = optInt(next, 'episode_number'); info.nextAirDate = dateOnly(optStr(next, 'air_date')); info.nextName = optStr(next, 'name') }
    return info
  }
  info.fallbackDate = dateOnly(optStr(o, 'release_date'))
  for (const country of optArr(opt(o, 'release_dates'), 'results') ?? []) {
    if (!country || optStr(country, 'iso_3166_1') !== 'IT') continue
    for (const entry of optArr(country, 'release_dates') ?? []) {
      if (!entry) continue
      const date = dateOnly(optStr(entry, 'release_date'))
      if (!date) continue
      const type = optInt(entry, 'type')
      if ((type === 2 || type === 3) && (!info.theatricalDate || date < info.theatricalDate)) info.theatricalDate = date
      if (type === 4 && (!info.digitalDate || date < info.digitalDate)) info.digitalDate = date
    }
  }
  return info
}

function providers(a: any[] | null, kind: string): Provider[] {
  const out: Provider[] = []
  const seen = new Set<number>()
  for (const o of a ?? []) {
    const id = optInt(o, 'provider_id')
    const name = optStr(o, 'provider_name', 'Servizio')
    if (kind === 'flatrate' && name.toLowerCase().includes('channel')) continue
    if (!seen.has(id)) { seen.add(id); out.push({ id, name, logo: image(optStr(o, 'logo_path'), 'w92'), kind }) }
  }
  return out
}

function creditPerson(o: Json): Person {
  return { ...emptyPerson(), id: optInt(o, 'id'), name: optStr(o, 'name', 'Persona'), profile: image(optStr(o, 'profile_path'), 'w185') }
}

export function directors(credits: Json | null): Person[] {
  const out = new Map<number, Person>()
  for (const o of optArr(credits, 'crew') ?? []) {
    if (!o) continue
    let directed = optStr(o, 'job') === 'Director'
    for (const job of optArr(o, 'jobs') ?? []) if (job && optStr(job, 'job') === 'Director') directed = true
    if (directed && optInt(o, 'id') > 0) {
      const p = creditPerson(o)
      p.director = true
      if (!out.has(p.id)) out.set(p.id, p)
    }
  }
  return [...out.values()]
}

export function mapMedia(o: Json, type: string): Media {
  const m = emptyMedia()
  m.tmdbId = optInt(o, 'id')
  m.id = `tmdb-${type}-${m.tmdbId}`
  m.mediaType = type
  m.title = optStr(o, type === 'movie' ? 'title' : 'name', 'Titolo senza nome')
  m.originalTitle = optStr(o, type === 'movie' ? 'original_title' : 'original_name', m.title)
  m.releaseDate = optStr(o, type === 'tv' ? 'first_air_date' : 'release_date')
  m.year = m.releaseDate.length >= 4 ? m.releaseDate.slice(0, 4) : 'S.D.'
  m.overview = optStr(o, 'overview', NO_OVERVIEW)
  if (!m.overview) m.overview = NO_OVERVIEW
  m.tagline = optStr(o, 'tagline')
  m.poster = image(optStr(o, 'poster_path'), 'w342')
  m.backdrop = image(optStr(o, 'backdrop_path'), 'w780')
  m.rating = optNum(o, 'vote_average')
  m.runtime = optInt(o, 'runtime')
  const countries = optArr(o, 'production_countries')
  if (countries && countries.length > 0) m.country = optStr(countries[0], 'name')
  else {
    const origins = optArr(o, 'origin_country')
    if (origins && origins.length > 0) m.country = String(origins[0] ?? '')
  }
  const languages = optArr(o, 'spoken_languages')
  if (languages && languages.length > 0) {
    const language = languages[0]
    m.language = optStr(language, 'name', optStr(language, 'english_name'))
  }
  const collection = opt(o, 'belongs_to_collection')
  if (collection) { m.collectionId = optInt(collection, 'id'); m.collectionName = optStr(collection, 'name') }
  const er = optArr(o, 'episode_run_time')
  if (er && er.length > 0) m.episodeRuntime = Math.trunc(Number(er[0]) || 0)
  for (const raw of optArr(o, 'genre_ids') ?? []) {
    const id = Math.trunc(Number(raw) || 0)
    m.genreIds.push(id)
    const label = (type === 'tv' ? TV_GENRES : MOVIE_GENRES)[id]
    if (label && m.genres.length < 3) m.genres.push(label)
  }
  const gs = optArr(o, 'genres')
  if (gs) {
    m.genres = []
    m.genreIds = []
    for (const g of gs) { m.genreIds.push(optInt(g, 'id')); if (m.genres.length < 3) m.genres.push(optStr(g, 'name')) }
  }
  return m
}

function mediaList(a: any[] | null, type: string, limit: number): Media[] {
  return (a ?? []).slice(0, limit).map((o) => mapMedia(o ?? {}, type))
}

export function unique(list: Media[]): Media[] {
  const map = new Map<string, Media>()
  for (const m of list) if (!map.has(m.id)) map.set(m.id, m)
  return [...map.values()]
}

const joinIds = (ids: number[]) => ids.join('|')

function titleRelevance(title: string, needle: string): number {
  const value = (title ?? '').trim().toLowerCase()
  if (value === needle) return 0
  if (value.startsWith(needle)) return 1
  if (value.includes(needle)) return 2
  return 3
}

const isLetterOrDigit = (c: string) => /[\p{L}\p{Nd}]/u.test(c)

function keyboardNeighbors(c: string): string {
  const key = c.toLowerCase()
  for (const row of ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']) {
    const i = row.indexOf(key)
    if (i >= 0) return (i > 0 ? row[i - 1] : '') + (i + 1 < row.length ? row[i + 1] : '')
  }
  return ''
}

function fuzzyQueries(query: string): string[] {
  const value = query.trim()
  const out = new Set<string>()
  out.add(value.substring(0, Math.min(3, value.length)))
  const middle = Math.floor(value.length / 2)
  for (let i = Math.max(0, middle - 1); i < value.length - 1 && out.size < 3; i++) {
    if (isLetterOrDigit(value[i]) && isLetterOrDigit(value[i + 1]) && value[i] !== value[i + 1]) {
      const chars = value.split('')
      ;[chars[i], chars[i + 1]] = [chars[i + 1], chars[i]]
      out.add(chars.join(''))
    }
  }
  for (const i of [middle, Math.max(1, value.length - 2)]) {
    if (out.size >= 4) break
    if (i > 0 && i < value.length - 1 && isLetterOrDigit(value[i])) out.add(value.substring(0, i) + value.substring(i + 1))
    if (out.size >= 4) break
    const neighbors = keyboardNeighbors(value[i] ?? '')
    if (neighbors) {
      const chars = value.split('')
      chars[i] = neighbors[0]
      out.add(chars.join(''))
    }
  }
  return [...out]
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  let next = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    next[0] = i
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    ;[prev, next] = [next, prev]
  }
  return prev[b.length]
}

/** Runs at most [limit] async jobs at once (the native Executors.newFixedThreadPool(4)). */
async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await work(items[index])
    }
  }))
  return results
}

export class TmdbApi {
  private get: Get
  private keywordCache = new Map<string, Promise<string>>()

  constructor(get: Get) {
    this.get = get
  }

  private keywords(name: string, find: () => Promise<string>, retryEmpty = false): Promise<string> {
    const known = this.keywordCache.get(name)
    if (known) return known
    const promise = find().then((ids) => {
      if (retryEmpty && !ids) this.keywordCache.delete(name)
      return ids
    }, (e) => { this.keywordCache.delete(name); throw e })
    this.keywordCache.set(name, promise)
    return promise
  }

  async discover(type: string, page: number, genre: number | null, provider: number | null, sort: string): Promise<Media[]> {
    const q: Params = { page: String(page), watch_region: 'IT', region: 'IT', include_adult: 'false', with_watch_monetization_types: 'flatrate|rent|buy' }
    if (genre != null && genre > 0) q.with_genres = String(genre)
    if (genre != null && genre === -1) {
      q.include_adult = 'true'
      const ids = await this.eroticKeywordIds()
      if (!ids) return []
      q.with_keywords = ids
    }
    if (provider != null && provider > 0) q.with_watch_providers = String(provider)
    q.sort_by = sort === 'recent' ? (type === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc') : 'popularity.desc'
    return mediaList(optArr(await this.get('/discover/' + type, q), 'results'), type, 18)
  }

  async newReleasesPage(type: string, page: number, upcoming: boolean, excluded: Set<string> = new Set()): Promise<ReleasePage> {
    const today = romeToday()
    const from = upcoming ? plusDays(today, 1) : plusDays(today, -60)
    const to = upcoming ? plusDays(today, 60) : today
    const q: Params = { include_adult: 'false' }
    const prefix = type === 'tv' ? 'first_air_date' : 'release_date'
    q[prefix + '.gte'] = from
    q[prefix + '.lte'] = to
    q.sort_by = 'popularity.desc'
    if (type === 'movie') { q.region = 'IT'; q.with_release_type = '3|2|4|5|6' }
    else { q.include_null_first_air_dates = 'false'; q.timezone = 'Europe/Rome'; q.with_type = '2|4' }
    // Merge a dedicated Italian-production search with the regional catalog so
    // local titles are not buried beneath worldwide popularity rankings.
    const local: Params = { ...q, with_origin_country: 'IT' }
    if (type === 'tv') { q.watch_region = 'IT'; q.with_watch_monetization_types = 'flatrate|free|ads|rent|buy' }
    let media: Media[] = []
    let hasMore = true
    let cursor = Math.max(1, page)
    // Consume sparse raw pages until there are usable results. The cursor
    // records every consumed page, including those rejected by validation.
    do {
      const candidates: Media[] = []
      let more = false
      for (const source of [local, q]) {
        source.page = String(cursor)
        const response = await this.get('/discover/' + type, { ...source })
        candidates.push(...mediaList(optArr(response, 'results'), type, 20))
        more ||= cursor < Math.min(500, optInt(response, 'total_pages'))
      }
      const checked = await pool(unique(candidates).filter((item) => !excluded.has(item.id)), 4, async (item) => {
        if (!readableLocalizedTitle(item.title)) return null
        if (type === 'movie') {
          item.releaseDate = italianReleaseDate(await this.get(`/movie/${item.tmdbId}/release_dates`, null), from, to)
          if (!item.releaseDate) return null
          item.year = item.releaseDate.slice(0, 4)
        } else {
          const detail = await this.get('/tv/' + item.tmdbId, { append_to_response: 'watch/providers' })
          if (!availableInItaly(detail)) return null
        }
        return item
      })
      for (const item of checked) if (item) media.push(item)
      media = unique(media)
      cursor++
      hasMore = more
    } while (media.length < 20 && hasMore)
    if (upcoming) media.sort((a, b) => (a.releaseDate < b.releaseDate ? -1 : a.releaseDate > b.releaseDate ? 1 : 0))
    return { media, hasMore, nextPage: cursor }
  }

  async discoverFiltered(type: string, page: number, genres: number[], providerIds: number[], erotic: boolean): Promise<Media[]> {
    const q: Params = { page: String(page), watch_region: 'IT', region: 'IT', include_adult: erotic ? 'true' : 'false', with_watch_monetization_types: 'flatrate|rent|buy' }
    if (genres.length) q.with_genres = joinIds(genres)
    if (providerIds.length) q.with_watch_providers = joinIds(providerIds)
    if (erotic) {
      const ids = await this.eroticKeywordIds()
      if (!ids) return []
      q.with_keywords = ids
    }
    q.sort_by = 'popularity.desc'
    return mediaList(optArr(await this.get('/discover/' + type, q), 'results'), type, 18)
  }

  async horrorSeries(page: number, providerIds: number[]): Promise<Media[]> {
    const q: Params = { page: String(page), watch_region: 'IT', region: 'IT', include_adult: 'false', with_watch_monetization_types: 'flatrate|rent|buy', sort_by: 'popularity.desc' }
    if (providerIds.length) q.with_watch_providers = joinIds(providerIds)
    const keyword = await this.horrorKeywordId()
    if (!keyword) return []
    q.with_keywords = keyword
    return mediaList(optArr(await this.get('/discover/tv', q), 'results'), 'tv', 18)
  }

  private async keywordDiscover(ids: string, type: string, page: number): Promise<Media[]> {
    if (!ids) return []
    const q: Params = { page: String(page), include_adult: 'false', with_keywords: ids, sort_by: 'popularity.desc' }
    return mediaList(optArr(await this.get('/discover/' + type, q), 'results'), type, 18)
  }

  async trueStories(type: string, page: number) { return this.keywordDiscover(await this.trueStoryKeywordIds(), type, page) }
  async apocalyptic(type: string, page: number) { return this.keywordDiscover(await this.apocalypticKeywordIds(), type, page) }
  async trueCrime(type: string, page: number) { return this.keywordDiscover(await this.trueCrimeKeywordIds(), type, page) }
  /** Seasonal picks: "halloween" or "christmas" themed titles, most popular first. */
  async holiday(holiday: string, type: string, page: number) {
    const ids = holiday === 'halloween'
      ? await this.keywords('halloween', () => this.findKeywordIds('halloween', 'trick or treating', "jack-o'-lantern", 'halloween party'))
      : await this.keywords('christmas', () => this.findKeywordIds('christmas', 'christmas eve', 'santa claus', 'christmas party', 'christmas tree'))
    return this.keywordDiscover(ids, type, page)
  }

  async subscriptionAvailability(media: Media): Promise<Provider[]> {
    const italy = opt(opt(await this.get(`/${media.mediaType}/${media.tmdbId}/watch/providers`, null), 'results'), 'IT')
    return providers(italy ? optArr(italy, 'flatrate') : null, 'flatrate')
  }

  async subscriptionDirectory(defaultIds: number[]): Promise<Provider[]> {
    const selected = new Set(defaultIds)
    const out = new Map<number, Provider>()
    for (const type of ['movie', 'tv']) {
      for (const item of optArr(await this.get('/watch/providers/' + type, { watch_region: 'IT' }), 'results') ?? []) {
        if (!item || !selected.has(optInt(item, 'provider_id'))) continue
        const p: Provider = { id: optInt(item, 'provider_id'), name: optStr(item, 'provider_name'), logo: image(optStr(item, 'logo_path'), 'w92'), kind: 'flatrate' }
        out.set(p.id, p)
      }
    }
    return [...out.values()]
  }

  async platformLogos(): Promise<Record<string, string>> {
    const logos: Record<string, string> = {}
    for (const item of optArr(await this.get('/watch/providers/movie', { watch_region: 'IT' }), 'results') ?? []) {
      if (!item) continue
      const providerId = optInt(item, 'provider_id')
      for (const platform of PLATFORMS) if (platform.providerId === providerId) logos[platform.id] = image(optStr(item, 'logo_path'), 'w92')
    }
    return logos
  }

  private horrorKeywordId(): Promise<string> {
    return this.keywords('horror', async () => {
      for (const item of optArr(await this.get('/search/keyword', { query: 'horror' }), 'results') ?? []) {
        if (item && optStr(item, 'name').toLowerCase() === 'horror') return String(optInt(item, 'id'))
      }
      return ''
    })
  }

  private trueStoryKeywordIds() {
    return this.keywords('true-story', () => this.findKeywordIds('based on true story', 'based on a true story', 'based on true events', 'based on real events', 'inspired by true events', 'true story', 'biography', 'true crime', 'based on real person', 'autobiography'))
  }

  private apocalypticKeywordIds() {
    return this.keywords('apocalyptic', () => this.findKeywordIds('post-apocalyptic', 'apocalyptic', 'dystopia', 'end of the world', 'zombie apocalypse'))
  }

  private trueCrimeKeywordIds() {
    // The native code retries this one when it came back empty.
    return this.keywords('true-crime', () => this.findKeywordIds('true crime'), true)
  }

  private async findKeywordIds(...terms: string[]): Promise<string> {
    const ids = await Promise.all(terms.map(async (term) => {
      try {
        const results = optArr(await this.get('/search/keyword', { query: term }), 'results')
        if (!results) return 0
        for (const item of results) {
          if (item && optStr(item, 'name').toLowerCase() === term.toLowerCase()) {
            const id = optInt(item, 'id')
            if (id > 0) return id
            break
          }
        }
      } catch { /* skipped */ }
      return 0
    }))
    return [...new Set(ids.filter((id) => id > 0))].join('|')
  }

  private eroticKeywordIds(): Promise<string> {
    return this.keywords('erotic', async () => {
      const ids: number[] = []
      for (const term of ['erotic', 'erotica', 'erotic movie', 'erotic drama', 'erotic thriller', 'eroticism', 'bdsm', 'sexual obsession', 'sexual domination', 'sex worker', 'prostitution', 'stripper']) {
        for (const keyword of optArr(await this.get('/search/keyword', { query: term }), 'results') ?? []) {
          if (term.toLowerCase() === optStr(keyword, 'name').toLowerCase()) {
            const id = optInt(keyword, 'id')
            if (id > 0) ids.push(id)
            break
          }
        }
      }
      return ids.join('|')
    })
  }

  async eroticDiscover(type: string, page: number) { return unique(await this.discover(type, page, -1, null, 'popular')) }

  async trending(type: string) { return mediaList(optArr(await this.get(`/trending/${type}/week`, null), 'results'), type, 10) }

  async featured(type: string) {
    const q: Params = { page: '1' }
    if (type === 'tv') q.timezone = 'Europe/Rome'
    else q.region = 'IT'
    return mediaList(optArr(await this.get(type === 'tv' ? '/tv/on_the_air' : '/movie/now_playing', q), 'results'), type, 20)
  }

  async masterpieces(type: string, page: number) {
    const q: Params = { page: String(page), watch_region: 'IT', region: 'IT', include_adult: 'false', with_watch_monetization_types: 'flatrate|rent|buy', 'vote_average.gte': '8.0', 'vote_count.gte': type === 'tv' ? '100' : '300', sort_by: 'vote_average.desc' }
    return mediaList(optArr(await this.get('/discover/' + type, q), 'results'), type, 18)
  }

  async related(media: Media, page = 1): Promise<Media[]> {
    const q: Params = { page: String(page) }
    let out = mediaList(optArr(await this.get(`/${media.mediaType}/${media.tmdbId}/recommendations`, q), 'results'), media.mediaType, 20)
    if (!out.length) out = mediaList(optArr(await this.get(`/${media.mediaType}/${media.tmdbId}/similar`, q), 'results'), media.mediaType, 20)
    return out
  }

  recommendations(media: Media, page: number) { return this.related(media, page) }

  async saga(media: Media): Promise<Media[]> {
    if (media.collectionId <= 0) return []
    const collection = await this.get('/collection/' + media.collectionId, null)
    const out = mediaList(optArr(collection, 'parts'), 'movie', 50)
    const collectionName = optStr(collection, 'name', media.collectionName)
    for (const item of out) { item.collectionId = media.collectionId; item.collectionName = collectionName }
    const rest = out.filter((item) => item.tmdbId !== media.tmdbId)
    rest.sort((a, b) => {
      if (!a.releaseDate && b.releaseDate) return 1
      if (a.releaseDate && !b.releaseDate) return -1
      return a.releaseDate < b.releaseDate ? -1 : a.releaseDate > b.releaseDate ? 1 : 0
    })
    return unique(rest)
  }

  async searchTitles(query: string, year: number | null): Promise<Media[]> {
    const out: Media[] = []
    const q: Params = { query, include_adult: 'false', region: 'IT' }
    const keep = (m: Media) => year == null || String(year) === m.year
    for (const type of ['movie', 'tv']) for (const m of mediaList(optArr(await this.get('/search/' + type, q), 'results'), type, 40)) if (keep(m)) out.push(m)
    if (out.length < 5 && query.trim().length >= 4) {
      for (const alternate of fuzzyQueries(query)) {
        const alt = { ...q, query: alternate }
        for (const type of ['movie', 'tv']) for (const m of mediaList(optArr(await this.get('/search/' + type, alt), 'results'), type, 20)) if (keep(m)) out.push(m)
      }
    }
    const needle = query.trim().toLowerCase()
    const relevance = (m: Media) => {
      const r = titleRelevance(m.title, needle)
      return r === 3 ? 4 + editDistance(m.title.toLowerCase(), needle) : r
    }
    const ranked = out.map((m, i) => ({ m, r: relevance(m), i }))
    ranked.sort((a, b) => (a.r !== b.r ? a.r - b.r : cmpDouble(b.m.rating, a.m.rating) || a.i - b.i))
    return unique(ranked.map((x) => x.m))
  }

  async searchPeople(query: string, directorsOnly = false): Promise<Person[]> {
    const a = optArr(await this.get('/search/person', { query, include_adult: 'false' }), 'results')
    const out: Person[] = []
    for (const o of (a ?? []).slice(0, 12)) {
      if (!o) continue
      const p = creditPerson(o)
      p.director = directorsOnly
      if (directorsOnly && optStr(o, 'known_for_department') !== 'Directing') {
        // Actors can also direct: use actual directing credits rather than department alone.
        try { if (!(await this.personCredits(p.id, true)).length) continue } catch { continue }
      }
      for (const x of (optArr(o, 'known_for') ?? []).slice(0, 3)) {
        if (!x) continue
        const type = optStr(x, 'media_type')
        if (type === 'movie' || type === 'tv') p.knownFor.push(mapMedia(x, type))
      }
      out.push(p)
    }
    return out
  }

  async personCredits(personId: number, directedOnly = false, hideShows = false): Promise<Media[]> {
    return this.mapPersonCredits(await this.personCreditsJson(personId), directedOnly, hideShows)
  }

  personCreditsJson(personId: number) { return this.get(`/person/${personId}/combined_credits`, null) }

  mapPersonCredits(credits: Json, directedOnly: boolean, hideShows = false): Media[] {
    const raw: Json[] = []
    for (const o of optArr(credits, directedOnly ? 'crew' : 'cast') ?? []) {
      if (o && (!directedOnly || optStr(o, 'job') === 'Director') && !(hideShows && isShowCredit(o))) raw.push(o)
    }
    // Stable sort, like Java's List.sort.
    const sorted = raw.map((o, i) => ({ o, i })).sort((x, y) => cmpDouble(optNum(y.o, 'popularity'), optNum(x.o, 'popularity')) || x.i - y.i)
    const out: Media[] = []
    for (const { o } of sorted) {
      const type = optStr(o, 'media_type')
      if (type === 'movie' || type === 'tv') out.push(mapMedia(o, type))
    }
    return unique(out)
  }

  async details(base: Media): Promise<Media> {
    const o = await this.get(`/${base.mediaType}/${base.tmdbId}`, { append_to_response: isSeries(base) ? 'watch/providers,credits,aggregate_credits' : 'watch/providers,credits' })
    const m = mapMedia(o, base.mediaType)
    const region = opt(opt(opt(o, 'watch/providers'), 'results'), 'IT')
    if (region) {
      m.providerLink = optStr(region, 'link')
      m.flatrate = providers(optArr(region, 'flatrate'), 'flatrate')
      m.rent = providers(optArr(region, 'rent'), 'rent')
      m.buy = providers(optArr(region, 'buy'), 'buy')
    }
    for (const x of optArr(opt(o, 'credits'), 'cast') ?? []) {
      m.cast.push({ ...emptyPerson(), id: optInt(x, 'id'), name: optStr(x, 'name', 'Interprete'), character: optStr(x, 'character'), profile: image(optStr(x, 'profile_path'), 'w185') })
    }
    m.directors = directors(opt(o, isSeries(base) ? 'aggregate_credits' : 'credits'))
    return m
  }

  async backdrops(media: Media): Promise<string[]> {
    const o = await this.get(`/${media.mediaType}/${media.tmdbId}/images`, null)
    const out: string[] = []
    for (const b of (optArr(o, 'backdrops') ?? []).slice(0, 30)) {
      const path = optStr(b, 'file_path')
      if (path) out.push(image(path, 'w780'))
    }
    if (media.backdrop && !out.includes(media.backdrop)) out.unshift(media.backdrop)
    return out
  }

  async releaseInfo(media: Media): Promise<ReleaseInfo> {
    const o = await this.get(`/${media.mediaType}/${media.tmdbId}`, { append_to_response: isSeries(media) ? 'watch/providers' : 'release_dates,watch/providers' })
    return parseReleaseInfo(o, isSeries(media))
  }

  async seasons(media: Media, withEpisodes: boolean): Promise<Season[]> {
    const detail = await this.get('/tv/' + media.tmdbId, null)
    const out: Season[] = []
    for (const o of optArr(detail, 'seasons') ?? []) {
      const number = optInt(o, 'season_number')
      const count = optInt(o, 'episode_count')
      if (number <= 0 || count <= 0) continue
      out.push({ number, name: optStr(o, 'name', 'Stagione ' + number), episodeCount: count, episodes: withEpisodes ? await this.episodes(media, number) : [] })
    }
    return out
  }

  async episodes(media: Media, season: number): Promise<Episode[]> {
    const o = await this.get(`/tv/${media.tmdbId}/season/${season}`, null)
    return (optArr(o, 'episodes') ?? []).map((x) => {
      const number = optInt(x, 'episode_number')
      return { season, number, name: optStr(x, 'name', 'Episodio ' + number), overview: optStr(x, 'overview'), runtime: optInt(x, 'runtime'), still: image(optStr(x, 'still_path'), 'w500') }
    })
  }
}

/** Double.compare, with NaN greater than everything. */
function cmpDouble(a: number, b: number): number {
  const an = Number.isNaN(a), bn = Number.isNaN(b)
  if (an || bn) return an === bn ? 0 : an ? 1 : -1
  return a < b ? -1 : a > b ? 1 : 0
}
