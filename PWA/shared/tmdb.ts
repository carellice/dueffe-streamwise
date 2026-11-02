// Port of TmdbApi.java. The request client is injected: the browser calls the server's TMDB proxy
// (the API key stays on the server), the server calls TMDB directly for the release checks.
import { emptyMedia, emptyPerson, type Media, type Person, type Provider, type Season, type Episode } from './model.ts'
import { plusDays, todayRome } from './dates.ts'

type Json = any
export type RequestClient = (path: string, params?: Record<string, string> | null) => Promise<Json>

const MOVIE_GENRES = new Map<number, string>([[12, 'Avventura'], [14, 'Fantasy'], [16, 'Animazione'], [18, 'Dramma'], [27, 'Horror'], [28, 'Azione'], [35, 'Commedia'], [36, 'Storia'], [53, 'Thriller'], [80, 'Crime'], [99, 'Documentario'], [878, 'Fantascienza'], [9648, 'Mistero'], [10402, 'Musica'], [10749, 'Romance'], [10751, 'Famiglia'], [10752, 'Guerra']])
const TV_GENRES = new Map<number, string>([[16, 'Animazione'], [18, 'Dramma'], [35, 'Commedia'], [80, 'Crime'], [99, 'Documentario'], [9648, 'Mistero'], [10751, 'Famiglia'], [10759, 'Azione e avventura'], [10762, 'Kids'], [10764, 'Reality'], [10765, 'Sci-fi e fantasy'], [10767, 'Talk'], [10768, 'Guerra e politica']])

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
  status: string
  lastAirDate: string
  lastName: string
  nextAirDate: string
  nextName: string
  theatricalDate: string
  digitalDate: string
  fallbackDate: string
  lastSeason: number
  lastEpisode: number
  nextSeason: number
  nextEpisode: number
  streaming: Provider[]
}
export const releaseEnded = (i: ReleaseInfo) => i.status === 'Ended' || i.status === 'Canceled'
export const releaseHasNext = (i: ReleaseInfo) => i.nextSeason > 0 && i.nextEpisode > 0

const SHOW_GENRES = new Set([10763, 10764, 10767])

const image = (path: unknown, size: string) => (typeof path !== 'string' || path === '' ? '' : `https://image.tmdb.org/t/p/${size}${path}`)
const s = (o: Json, k: string, fallback = '') => (o && o[k] != null ? String(o[k]) : fallback)
const n = (o: Json, k: string) => (o && typeof o[k] === 'number' ? o[k] : o && o[k] != null && !Number.isNaN(Number(o[k])) ? Number(o[k]) : 0)
const list = (v: unknown): Json[] => (Array.isArray(v) ? v : [])

function dateOnly(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length < 10) return ''
  const d = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z')) ? d : ''
}

export function mapMedia(o: Json, type: string): Media {
  const m = emptyMedia()
  m.tmdbId = Math.trunc(n(o, 'id'))
  m.id = `tmdb-${type}-${m.tmdbId}`
  m.mediaType = type
  m.title = s(o, type === 'movie' ? 'title' : 'name', 'Titolo senza nome')
  m.originalTitle = s(o, type === 'movie' ? 'original_title' : 'original_name', m.title)
  m.releaseDate = s(o, type === 'tv' ? 'first_air_date' : 'release_date')
  m.year = m.releaseDate.length >= 4 ? m.releaseDate.slice(0, 4) : 'S.D.'
  m.overview = s(o, 'overview', 'Trama non disponibile.')
  if (m.overview === '') m.overview = 'Trama non disponibile.'
  m.tagline = s(o, 'tagline')
  m.poster = image(o.poster_path, 'w342')
  m.backdrop = image(o.backdrop_path, 'w780')
  m.rating = typeof o.vote_average === 'number' ? o.vote_average : 0
  m.runtime = Math.trunc(n(o, 'runtime'))
  const countries = list(o.production_countries)
  if (countries.length > 0) m.country = s(countries[0], 'name')
  else {
    const origins = list(o.origin_country)
    if (origins.length > 0) m.country = String(origins[0] ?? '')
  }
  const languages = list(o.spoken_languages)
  if (languages.length > 0) m.language = s(languages[0], 'name', s(languages[0], 'english_name'))
  const collection = o.belongs_to_collection
  if (collection && typeof collection === 'object') {
    m.collectionId = Math.trunc(n(collection, 'id'))
    m.collectionName = s(collection, 'name')
  }
  const er = list(o.episode_run_time)
  if (er.length > 0) m.episodeRuntime = Math.trunc(Number(er[0]) || 0)
  for (const id of list(o.genre_ids)) {
    const value = Math.trunc(Number(id) || 0)
    m.genreIds.push(value)
    const label = (type === 'tv' ? TV_GENRES : MOVIE_GENRES).get(value)
    if (label != null && m.genres.length < 3) m.genres.push(label)
  }
  if (Array.isArray(o.genres)) {
    m.genres = []
    m.genreIds = []
    for (const g of o.genres) {
      m.genreIds.push(Math.trunc(n(g, 'id')))
      if (m.genres.length < 3) m.genres.push(s(g, 'name'))
    }
  }
  return m
}

function mediaList(a: unknown, type: string, limit: number): Media[] {
  return list(a).slice(0, limit).map((o) => mapMedia(o ?? {}, type))
}

function providers(a: unknown, kind: string): Provider[] {
  const out: Provider[] = []
  const seen = new Set<number>()
  for (const o of list(a)) {
    const id = Math.trunc(n(o, 'provider_id'))
    const name = s(o, 'provider_name', 'Servizio')
    if (kind === 'flatrate' && name.toLowerCase().includes('channel')) continue
    if (!seen.has(id)) {
      seen.add(id)
      out.push({ id, name, logo: image(o.logo_path, 'w92'), kind })
    }
  }
  return out
}

export function uniqueMedia(input: Media[]): Media[] {
  const map = new Map<string, Media>()
  for (const m of input) if (!map.has(m.id)) map.set(m.id, m)
  return [...map.values()]
}

function creditPerson(o: Json): Person {
  const p = emptyPerson()
  p.id = Math.trunc(n(o, 'id'))
  p.name = s(o, 'name', 'Persona')
  p.profile = image(o.profile_path, 'w185')
  return p
}

/** Talk shows, late shows, news, reality and appearances as oneself (award nights, interviews, guest spots). */
export function isShowCredit(o: Json): boolean {
  const ids = list(o.genre_ids)
  if (s(o, 'media_type') === 'tv') for (const id of ids) if (SHOW_GENRES.has(Number(id))) return true
  const character = s(o, 'character').trim().toLowerCase()
  return /^(self|himself|herself|themselves|themself|se stesso|se stessa|lui stesso|lei stessa)\b.*$/s.test(character) ||
    /^(.*\((self|himself|herself|voice\s*-\s*self)\)|.*\b(host|guest|presenter|musical guest))$/s.test(character)
}

export function directors(credits: Json): Person[] {
  const out = new Map<number, Person>()
  for (const o of list(credits?.crew)) {
    if (!o) continue
    let directed = s(o, 'job') === 'Director'
    for (const job of list(o.jobs)) if (job && s(job, 'job') === 'Director') directed = true
    if (directed && n(o, 'id') > 0) {
      const p = creditPerson(o)
      p.director = true
      if (!out.has(p.id)) out.set(p.id, p)
    }
  }
  return [...out.values()]
}

export function readableLocalizedTitle(title: string | null | undefined): boolean {
  if (title == null || title.trim() === '' || title === 'Titolo senza nome') return false
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
  for (const country of list(response?.results)) {
    if (!country || s(country, 'iso_3166_1') !== 'IT') continue
    const dates = list(country.release_dates)
    if (dates.length === 0) continue
    for (const type of [3, 2, 4, 5, 6]) {
      let chosen = ''
      for (const entry of dates) {
        if (!entry || n(entry, 'type') !== type) continue
        const date = dateOnly(s(entry, 'release_date'))
        if (date && date >= from && date <= to && (chosen === '' || date < chosen)) chosen = date
      }
      if (chosen !== '') return chosen
    }
  }
  return ''
}

export function availableInItaly(detail: Json): boolean {
  const italy = detail?.['watch/providers']?.results?.IT
  if (italy) for (const kind of ['flatrate', 'free', 'ads', 'rent', 'buy']) if (list(italy[kind]).length > 0) return true
  // Domestic broadcasters also cover series on Italian television, even
  // when JustWatch has not yet indexed their free catch-up catalog.
  for (const network of list(detail?.networks)) if (network && s(network, 'origin_country') === 'IT') return true
  return false
}

export function parseReleaseInfo(o: Json, series: boolean): ReleaseInfo {
  const info: ReleaseInfo = {
    status: s(o, 'status'), lastAirDate: '', lastName: '', nextAirDate: '', nextName: '', theatricalDate: '', digitalDate: '',
    fallbackDate: '', lastSeason: 0, lastEpisode: 0, nextSeason: 0, nextEpisode: 0, streaming: [],
  }
  info.streaming = providers(o?.['watch/providers']?.results?.IT?.flatrate, 'flatrate')
  if (series) {
    const last = o.last_episode_to_air
    const next = o.next_episode_to_air
    if (last && typeof last === 'object') {
      info.lastSeason = Math.trunc(n(last, 'season_number')); info.lastEpisode = Math.trunc(n(last, 'episode_number'))
      info.lastAirDate = dateOnly(s(last, 'air_date')); info.lastName = s(last, 'name')
    }
    if (next && typeof next === 'object') {
      info.nextSeason = Math.trunc(n(next, 'season_number')); info.nextEpisode = Math.trunc(n(next, 'episode_number'))
      info.nextAirDate = dateOnly(s(next, 'air_date')); info.nextName = s(next, 'name')
    }
    return info
  }
  info.fallbackDate = dateOnly(s(o, 'release_date'))
  for (const country of list(o?.release_dates?.results)) {
    if (!country || s(country, 'iso_3166_1') !== 'IT') continue
    for (const entry of list(country.release_dates)) {
      if (!entry) continue
      const date = dateOnly(s(entry, 'release_date'))
      if (date === '') continue
      const type = n(entry, 'type')
      if ((type === 2 || type === 3) && (info.theatricalDate === '' || date < info.theatricalDate)) info.theatricalDate = date
      if (type === 4 && (info.digitalDate === '' || date < info.digitalDate)) info.digitalDate = date
    }
  }
  return info
}

function titleRelevance(title: string, needle: string): number {
  const value = (title ?? '').trim().toLowerCase()
  if (value === needle) return 0
  if (value.startsWith(needle)) return 1
  if (value.includes(needle)) return 2
  return 3
}

function keyboardNeighbors(c: string): string {
  const key = c.toLowerCase()
  for (const row of ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']) {
    const i = row.indexOf(key)
    if (i >= 0) return (i > 0 ? row[i - 1] : '') + (i + 1 < row.length ? row[i + 1] : '')
  }
  return ''
}

const letterOrDigit = (c: string) => /[\p{L}\p{N}]/u.test(c)

function fuzzyQueries(query: string): string[] {
  const value = query.trim()
  const out = new Set<string>()
  out.add(value.slice(0, Math.min(3, value.length)))
  const middle = Math.floor(value.length / 2)
  for (let i = Math.max(0, middle - 1); i < value.length - 1 && out.size < 3; i++) {
    if (letterOrDigit(value[i]) && letterOrDigit(value[i + 1]) && value[i] !== value[i + 1]) {
      const chars = value.split('')
      const c = chars[i]; chars[i] = chars[i + 1]; chars[i + 1] = c
      out.add(chars.join(''))
    }
  }
  for (const i of [middle, Math.max(1, value.length - 2)]) {
    if (out.size >= 4) break
    if (i > 0 && i < value.length - 1 && letterOrDigit(value[i])) out.add(value.slice(0, i) + value.slice(i + 1))
    if (out.size >= 4) break
    const neighbors = keyboardNeighbors(value[i] ?? '')
    if (neighbors !== '') {
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
    const tmp = prev; prev = next; next = tmp
  }
  return prev[b.length]
}

/** Runs [work] on every item with at most [limit] in flight, keeping the order (the native fixed thread pool of 4). */
async function pooled<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      out[index] = await work(items[index])
    }
  }))
  return out
}

export class TmdbApi {
  get: RequestClient
  private eroticIds: Promise<string> | null = null
  private horrorId: Promise<string> | null = null
  private trueStoryIds: Promise<string> | null = null
  private apocalypticIds: Promise<string> | null = null
  private trueCrimeIds: Promise<string> | null = null
  private halloweenIds: Promise<string> | null = null
  private christmasIds: Promise<string> | null = null

  constructor(get: RequestClient) {
    this.get = get
  }

  async discover(type: string, page: number, genre: number | null, provider: number | null, sort: string): Promise<Media[]> {
    const q: Record<string, string> = { page: String(page), watch_region: 'IT', region: 'IT', include_adult: 'false', with_watch_monetization_types: 'flatrate|rent|buy' }
    if (genre != null && genre > 0) q.with_genres = String(genre)
    if (genre != null && genre === -1) {
      q.include_adult = 'true'
      const ids = await this.eroticKeywordIds()
      if (ids === '') return []
      q.with_keywords = ids
    }
    if (provider != null && provider > 0) q.with_watch_providers = String(provider)
    q.sort_by = sort === 'recent' ? (type === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc') : 'popularity.desc'
    return mediaList((await this.get('/discover/' + type, q)).results, type, 18)
  }

  async newReleasesPage(type: string, page: number, upcoming: boolean, excluded: Set<string> = new Set()): Promise<ReleasePage> {
    const today = todayRome()
    const from = upcoming ? plusDays(today, 1) : plusDays(today, -60)
    const to = upcoming ? plusDays(today, 60) : today
    const q: Record<string, string> = { include_adult: 'false' }
    const prefix = type === 'tv' ? 'first_air_date' : 'release_date'
    q[prefix + '.gte'] = from
    q[prefix + '.lte'] = to
    q.sort_by = 'popularity.desc'
    if (type === 'movie') { q.region = 'IT'; q.with_release_type = '3|2|4|5|6' } else { q.include_null_first_air_dates = 'false'; q.timezone = 'Europe/Rome'; q.with_type = '2|4' }
    // Merge a dedicated Italian-production search with the regional catalog so
    // local titles are not buried beneath worldwide popularity rankings.
    const local: Record<string, string> = { ...q, with_origin_country: 'IT' }
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
        const response = await this.get('/discover/' + type, source)
        candidates.push(...mediaList(response.results, type, 20))
        more ||= cursor < Math.min(500, Number(response.total_pages) || 0)
      }
      const items = uniqueMedia(candidates).filter((item) => !excluded.has(item.id))
      const checked = await pooled(items, 4, async (item) => {
        if (!readableLocalizedTitle(item.title)) return null
        if (type === 'movie') {
          item.releaseDate = italianReleaseDate(await this.get(`/movie/${item.tmdbId}/release_dates`, null), from, to)
          if (item.releaseDate === '') return null
          item.year = item.releaseDate.slice(0, 4)
        } else {
          const detail = await this.get(`/tv/${item.tmdbId}`, { append_to_response: 'watch/providers' })
          if (!availableInItaly(detail)) return null
        }
        return item
      })
      for (const item of checked) if (item) media.push(item)
      media = uniqueMedia(media)
      cursor++
      hasMore = more
    } while (media.length < 20 && hasMore)
    if (upcoming) media.sort((a, b) => (a.releaseDate < b.releaseDate ? -1 : a.releaseDate > b.releaseDate ? 1 : 0))
    return { media, hasMore, nextPage: cursor }
  }

  async discoverFiltered(type: string, page: number, genres: number[], providerIds: number[], erotic: boolean): Promise<Media[]> {
    const q: Record<string, string> = { page: String(page), watch_region: 'IT', region: 'IT', include_adult: erotic ? 'true' : 'false', with_watch_monetization_types: 'flatrate|rent|buy' }
    if (genres.length > 0) q.with_genres = genres.join('|')
    if (providerIds.length > 0) q.with_watch_providers = providerIds.join('|')
    if (erotic) {
      const ids = await this.eroticKeywordIds()
      if (ids === '') return []
      q.with_keywords = ids
    }
    q.sort_by = 'popularity.desc'
    return mediaList((await this.get('/discover/' + type, q)).results, type, 18)
  }

  async horrorSeries(page: number, providerIds: number[]): Promise<Media[]> {
    const q: Record<string, string> = { page: String(page), watch_region: 'IT', region: 'IT', include_adult: 'false', with_watch_monetization_types: 'flatrate|rent|buy', sort_by: 'popularity.desc' }
    if (providerIds.length > 0) q.with_watch_providers = providerIds.join('|')
    const keyword = await this.horrorKeywordId()
    if (keyword === '') return []
    q.with_keywords = keyword
    return mediaList((await this.get('/discover/tv', q)).results, 'tv', 18)
  }

  private async keywordDiscover(ids: string, type: string, page: number): Promise<Media[]> {
    if (ids === '') return []
    const q = { page: String(page), include_adult: 'false', with_keywords: ids, sort_by: 'popularity.desc' }
    return mediaList((await this.get('/discover/' + type, q)).results, type, 18)
  }
  async trueStories(type: string, page: number) { return this.keywordDiscover(await this.trueStoryKeywordIds(), type, page) }
  async apocalyptic(type: string, page: number) { return this.keywordDiscover(await this.apocalypticKeywordIds(), type, page) }
  async trueCrime(type: string, page: number) { return this.keywordDiscover(await this.trueCrimeKeywordIds(), type, page) }
  /** Seasonal picks: "halloween" or "christmas" themed titles, most popular first. */
  async holiday(holiday: string, type: string, page: number) {
    return this.keywordDiscover(await (holiday === 'halloween' ? this.halloweenKeywordIds() : this.christmasKeywordIds()), type, page)
  }

  async subscriptionAvailability(media: Media): Promise<Provider[]> {
    const regions = (await this.get(`/${media.mediaType}/${media.tmdbId}/watch/providers`, null)).results
    return providers(regions?.IT?.flatrate, 'flatrate')
  }

  async subscriptionDirectory(defaultIds: Set<number>): Promise<Provider[]> {
    const out = new Map<number, Provider>()
    for (const type of ['movie', 'tv']) {
      for (const item of list((await this.get(`/watch/providers/${type}`, { watch_region: 'IT' })).results)) {
        if (!item || !defaultIds.has(n(item, 'provider_id'))) continue
        const p: Provider = { id: n(item, 'provider_id'), name: s(item, 'provider_name'), logo: image(item.logo_path, 'w92'), kind: 'flatrate' }
        out.set(p.id, p)
      }
    }
    return [...out.values()]
  }

  async platformLogos(): Promise<Record<string, string>> {
    const logos: Record<string, string> = {}
    for (const item of list((await this.get('/watch/providers/movie', { watch_region: 'IT' })).results)) {
      if (!item) continue
      const providerId = n(item, 'provider_id')
      for (const platform of PLATFORMS) if (platform.providerId === providerId) logos[platform.id] = image(item.logo_path, 'w92')
    }
    return logos
  }

  private horrorKeywordId(): Promise<string> {
    this.horrorId ??= (async () => {
      for (const item of list((await this.get('/search/keyword', { query: 'horror' })).results)) {
        if (item && s(item, 'name').toLowerCase() === 'horror') return String(n(item, 'id'))
      }
      return ''
    })()
    return this.horrorId
  }
  private trueStoryKeywordIds() {
    this.trueStoryIds ??= this.findKeywordIds('based on true story', 'based on a true story', 'based on true events', 'based on real events', 'inspired by true events', 'true story', 'biography', 'true crime', 'based on real person', 'autobiography')
    return this.trueStoryIds
  }
  private apocalypticKeywordIds() {
    this.apocalypticIds ??= this.findKeywordIds('post-apocalyptic', 'apocalyptic', 'dystopia', 'end of the world', 'zombie apocalypse')
    return this.apocalypticIds
  }
  private async trueCrimeKeywordIds() {
    // An empty answer is retried next time, like the native cache.
    if (this.trueCrimeIds && (await this.trueCrimeIds) !== '') return this.trueCrimeIds
    this.trueCrimeIds = this.findKeywordIds('true crime')
    return this.trueCrimeIds
  }
  private halloweenKeywordIds() {
    this.halloweenIds ??= this.findKeywordIds('halloween', 'trick or treating', "jack-o'-lantern", 'halloween party')
    return this.halloweenIds
  }
  private christmasKeywordIds() {
    this.christmasIds ??= this.findKeywordIds('christmas', 'christmas eve', 'santa claus', 'christmas party', 'christmas tree')
    return this.christmasIds
  }
  private async findKeywordIds(...terms: string[]): Promise<string> {
    const ids = await Promise.all(terms.map(async (term) => {
      try {
        const results = list((await this.get('/search/keyword', { query: term })).results)
        for (const item of results) {
          if (item && s(item, 'name').toLowerCase() === term.toLowerCase()) {
            const id = n(item, 'id')
            if (id > 0) return id
            break
          }
        }
      } catch { /* ignored like the native client */ }
      return 0
    }))
    return [...new Set(ids.filter((id) => id > 0))].join('|')
  }
  private eroticKeywordIds(): Promise<string> {
    this.eroticIds ??= (async () => {
      const ids: number[] = []
      for (const term of ['erotic', 'erotica', 'erotic movie', 'erotic drama', 'erotic thriller', 'eroticism', 'bdsm', 'sexual obsession', 'sexual domination', 'sex worker', 'prostitution', 'stripper']) {
        for (const keyword of list((await this.get('/search/keyword', { query: term })).results)) {
          if (term.toLowerCase() === s(keyword, 'name').toLowerCase()) {
            const id = n(keyword, 'id')
            if (id > 0) ids.push(id)
            break
          }
        }
      }
      return ids.join('|')
    })()
    return this.eroticIds
  }

  async eroticDiscover(type: string, page: number) { return uniqueMedia(await this.discover(type, page, -1, null, 'popular')) }
  async trending(type: string) { return mediaList((await this.get(`/trending/${type}/week`, null)).results, type, 10) }
  async featured(type: string) {
    const q: Record<string, string> = { page: '1' }
    if (type === 'tv') q.timezone = 'Europe/Rome'
    else q.region = 'IT'
    return mediaList((await this.get(type === 'tv' ? '/tv/on_the_air' : '/movie/now_playing', q)).results, type, 20)
  }
  async masterpieces(type: string, page: number) {
    const q = {
      page: String(page), watch_region: 'IT', region: 'IT', include_adult: 'false', with_watch_monetization_types: 'flatrate|rent|buy',
      'vote_average.gte': '8.0', 'vote_count.gte': type === 'tv' ? '100' : '300', sort_by: 'vote_average.desc',
    }
    return mediaList((await this.get('/discover/' + type, q)).results, type, 18)
  }
  async related(media: Media, page = 1) { return this.recommendations(media, page) }
  async recommendations(media: Media, page: number): Promise<Media[]> {
    const q = { page: String(page) }
    let out = mediaList((await this.get(`/${media.mediaType}/${media.tmdbId}/recommendations`, q)).results, media.mediaType, 20)
    if (out.length === 0) out = mediaList((await this.get(`/${media.mediaType}/${media.tmdbId}/similar`, q)).results, media.mediaType, 20)
    return out
  }
  async saga(media: Media): Promise<Media[]> {
    if (media.collectionId <= 0) return []
    const collection = await this.get(`/collection/${media.collectionId}`, null)
    let out = mediaList(collection.parts, 'movie', 50)
    const collectionName = s(collection, 'name', media.collectionName)
    for (const item of out) { item.collectionId = media.collectionId; item.collectionName = collectionName }
    out = out.filter((item) => item.tmdbId !== media.tmdbId)
    out.sort((a, b) => {
      if (a.releaseDate === '' && b.releaseDate !== '') return 1
      if (a.releaseDate !== '' && b.releaseDate === '') return -1
      return a.releaseDate < b.releaseDate ? -1 : a.releaseDate > b.releaseDate ? 1 : 0
    })
    return uniqueMedia(out)
  }
  async searchTitles(query: string, year: number | null): Promise<Media[]> {
    let out: Media[] = []
    const q = { query, include_adult: 'false', region: 'IT' }
    for (const type of ['movie', 'tv']) for (const m of mediaList((await this.get('/search/' + type, q)).results, type, 40)) if (year == null || String(year) === m.year) out.push(m)
    if (out.length < 5 && query.trim().length >= 4) {
      for (const alternate of fuzzyQueries(query)) {
        const alt = { ...q, query: alternate }
        for (const type of ['movie', 'tv']) for (const m of mediaList((await this.get('/search/' + type, alt)).results, type, 20)) if (year == null || String(year) === m.year) out.push(m)
      }
    }
    const needle = query.trim().toLowerCase()
    const score = (m: Media) => {
      const r = titleRelevance(m.title, needle)
      return r === 3 ? 4 + editDistance(m.title.toLowerCase(), needle) : r
    }
    out = out.map((m, i) => ({ m, i, r: score(m) }))
      .sort((a, b) => a.r - b.r || b.m.rating - a.m.rating || a.i - b.i)
      .map((x) => x.m)
    return uniqueMedia(out)
  }
  async searchPeople(query: string, directorsOnly = false): Promise<Person[]> {
    const a = list((await this.get('/search/person', { query, include_adult: 'false' })).results)
    const out: Person[] = []
    for (const o of a.slice(0, 12)) {
      if (!o) continue
      const p = creditPerson(o)
      p.director = directorsOnly
      if (directorsOnly && s(o, 'known_for_department') !== 'Directing') {
        // Actors can also direct: use actual directing credits rather than department alone.
        try { if ((await this.personCredits(p.id, true)).length === 0) continue } catch { continue }
      }
      for (const x of list(o.known_for).slice(0, 3)) {
        if (!x) continue
        const type = s(x, 'media_type')
        if (type === 'movie' || type === 'tv') p.knownFor.push(mapMedia(x, type))
      }
      out.push(p)
    }
    return out
  }
  async personCredits(personId: number, directedOnly = false, hideShows = false): Promise<Media[]> {
    return mapPersonCredits(await this.personCreditsJson(personId), directedOnly, hideShows)
  }
  personCreditsJson(personId: number) { return this.get(`/person/${personId}/combined_credits`, null) }

  async details(base: Media): Promise<Media> {
    const series = base.mediaType === 'tv'
    const o = await this.get(`/${base.mediaType}/${base.tmdbId}`, { append_to_response: series ? 'watch/providers,credits,aggregate_credits' : 'watch/providers,credits' })
    const m = mapMedia(o, base.mediaType)
    const region = o?.['watch/providers']?.results?.IT
    if (region) {
      m.providerLink = s(region, 'link')
      m.flatrate = providers(region.flatrate, 'flatrate')
      m.rent = providers(region.rent, 'rent')
      m.buy = providers(region.buy, 'buy')
    }
    for (const x of list(o?.credits?.cast)) {
      const p = emptyPerson()
      p.id = Math.trunc(n(x, 'id')); p.name = s(x, 'name', 'Interprete'); p.character = s(x, 'character'); p.profile = image(x?.profile_path, 'w185')
      m.cast.push(p)
    }
    m.directors = directors(o?.[series ? 'aggregate_credits' : 'credits'])
    return m
  }
  async backdrops(media: Media): Promise<string[]> {
    const o = await this.get(`/${media.mediaType}/${media.tmdbId}/images`, null)
    const out: string[] = []
    for (const b of list(o.backdrops).slice(0, 30)) {
      const path = s(b, 'file_path')
      if (path !== '') out.push(image(path, 'w780'))
    }
    if (media.backdrop && !out.includes(media.backdrop)) out.unshift(media.backdrop)
    return out
  }
  async releaseInfo(media: Media): Promise<ReleaseInfo> {
    const series = media.mediaType === 'tv'
    return parseReleaseInfo(await this.get(`/${media.mediaType}/${media.tmdbId}`, { append_to_response: series ? 'watch/providers' : 'release_dates,watch/providers' }), series)
  }
  async seasons(media: Media, withEpisodes: boolean): Promise<Season[]> {
    const detail = await this.get(`/tv/${media.tmdbId}`, null)
    const out: Season[] = []
    for (const o of list(detail.seasons)) {
      const number = Math.trunc(n(o, 'season_number'))
      const count = Math.trunc(n(o, 'episode_count'))
      if (number <= 0 || count <= 0) continue
      out.push({ number, name: s(o, 'name', 'Stagione ' + number), episodeCount: count, episodes: withEpisodes ? await this.episodes(media, number) : [] })
    }
    return out
  }
  async episodes(media: Media, season: number): Promise<Episode[]> {
    const o = await this.get(`/tv/${media.tmdbId}/season/${season}`, null)
    return list(o.episodes).map((x) => {
      const number = Math.trunc(n(x, 'episode_number'))
      return { season, number, name: s(x, 'name', 'Episodio ' + number), overview: s(x, 'overview'), runtime: Math.trunc(n(x, 'runtime')), still: image(x?.still_path, 'w500') }
    })
  }
}

export function mapPersonCredits(credits: Json, directedOnly: boolean, hideShows = false): Media[] {
  const raw = list(credits?.[directedOnly ? 'crew' : 'cast']).filter((o) => o && (!directedOnly || s(o, 'job') === 'Director') && !(hideShows && isShowCredit(o)))
  raw.sort((x, y) => (Number(y.popularity) || 0) - (Number(x.popularity) || 0))
  const out: Media[] = []
  for (const o of raw) {
    const type = s(o, 'media_type')
    if (type === 'movie' || type === 'tv') out.push(mapMedia(o, type))
  }
  return uniqueMedia(out)
}
