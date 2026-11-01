import { useSyncExternalStore } from 'react'
import { today } from '../../../shared/dates.ts'
import type { Media } from '../../../shared/model.ts'
import { GENRES, genreValue, unique } from '../../../shared/tmdb.ts'
import { currentHoliday } from '../components/cards.tsx'
import { getData } from './store.ts'
import { attempt, tmdb } from './tmdb.ts'

// CatalogScreen's state for one type (movie or tv): every rail with its page, its "load more" and
// its refresh. The expanded list ("Vedi tutto") reads the same rail, so both stay in step.

export type Rail = {
  key: string
  title: string
  media: Media[]
  page: number
  hasMore: boolean
  refreshing: boolean
  loadingMore: boolean
  paginationError: boolean
}

export const NEW_RELEASES = 'Novità'
export const MASTERPIECES = 'Capolavori da scoprire'
export const TASTE = 'Consigliati per te'
export const TRUE_STORIES = 'Storie vere'
export const TRUE_CRIME = 'True crime'
export const APOCALYPTIC = 'Apocalittici'
export const HOLIDAY = 'Speciale festività'
export const TOP10 = 'Top 10 oggi'

const randomPage = () => 2 + Math.floor(Math.random() * 9)

function shuffled<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function matchingGenre(seed: Media, targetType: string): number | null {
  const mapping: Record<number, number> = targetType === 'tv'
    ? { 28: 10759, 35: 35, 18: 18, 53: 80, 80: 80, 878: 10765, 14: 10765, 99: 99, 16: 16, 9648: 9648 }
    : { 10759: 28, 35: 35, 18: 18, 80: 80, 10765: 878, 99: 99, 16: 16, 9648: 9648, 10751: 10751 }
  for (const id of seed.genreIds) if (mapping[id] != null) return mapping[id]
  return null
}

async function tastePage(type: string, seeds: Media[], page: number, excluded: Set<string>): Promise<Media[]> {
  const lists = await Promise.all(seeds.slice(0, 3).map((seed) => attempt(async () => {
    if (seed.mediaType === type) {
      const recs = await tmdb.recommendations(seed, page)
      if (recs.length) return recs
      return seed.genreIds.length ? tmdb.discover(type, page, seed.genreIds[0], null, 'popular') : []
    }
    const genre = matchingGenre(seed, type)
    return genre != null ? tmdb.discover(type, page, genre, null, 'popular') : []
  }, [] as Media[])))
  return shuffled(unique(lists.flat().filter((m) => !excluded.has(m.id) && m.poster))).slice(0, 18)
}

export class Catalog {
  type: string
  rails = new Map<string, Rail>()
  order: string[] = []
  featured: Media[] = []
  loaded = false
  error: string | null = null
  refreshing = false
  upcoming = false
  private tasteSeeds: Media[] = []
  private generation = 0
  private listeners = new Set<() => void>()
  private snapshot = 0

  constructor(type: string) {
    this.type = type
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  version = () => this.snapshot
  private emit() {
    this.snapshot++
    this.listeners.forEach((l) => l())
  }

  rail(key: string): Rail | undefined {
    return this.rails.get(key)
  }

  private put(key: string, patch: Partial<Rail>) {
    const current = this.rails.get(key) ?? { key, title: key, media: [], page: 1, hasMore: true, refreshing: false, loadingMore: false, paginationError: false }
    this.rails.set(key, { ...current, ...patch })
    this.emit()
  }

  /** LaunchedEffect(kind, reloadVersion): the whole catalog. */
  async load(force = false) {
    if (this.loaded && !force) return
    const generation = ++this.generation
    this.error = null
    if (force) this.refreshing = true
    this.emit()
    const type = this.type
    void this.loadNewReleases()
    void this.loadHoliday()
    void this.loadTaste()
    const firstMasterpieces = randomPage()
    try {
      const genres = GENRES.filter((g) => genreValue(g, type) !== 0)
      const [top, featured, masterpieces, trueStories, apocalyptic, trueCrime, rails] = await Promise.all([
        tmdb.trending(type),
        attempt(() => tmdb.featured(type), []),
        tmdb.masterpieces(type, firstMasterpieces),
        attempt(() => tmdb.trueStories(type, 1), []),
        attempt(() => tmdb.apocalyptic(type, 1), []),
        attempt(() => tmdb.trueCrime(type, 1), []),
        Promise.all(genres.map(async (g) => ({ g, media: g.id === 'erotic' ? await tmdb.eroticDiscover(type, 1) : await tmdb.discover(type, 1, genreValue(g, type), null, 'popular') }))),
      ])
      if (generation !== this.generation) return
      this.featured = featured
      this.put(TOP10, { media: top, hasMore: false })
      this.put(MASTERPIECES, { media: masterpieces, page: firstMasterpieces, hasMore: true })
      this.put(TRUE_STORIES, { media: trueStories, page: 1, hasMore: trueStories.length > 0 })
      this.put(APOCALYPTIC, { media: apocalyptic, page: 1, hasMore: apocalyptic.length > 0 })
      this.put(TRUE_CRIME, { media: trueCrime, page: 1, hasMore: trueCrime.length > 0 })
      this.order = []
      for (const { g, media } of rails) {
        this.order.push(g.label)
        this.put(g.label, { media, page: 1, hasMore: true })
      }
      this.loaded = true
    } catch {
      if (generation === this.generation) this.error = 'Non riesco a caricare il catalogo.'
    }
    if (generation === this.generation) {
      this.refreshing = false
      this.emit()
    }
  }

  // --- Novità (rememberNewReleases) --------------------------------------------------------

  async loadNewReleases() {
    const mode = this.upcoming
    this.put(NEW_RELEASES, { media: [], page: 1, hasMore: true, refreshing: true, loadingMore: false, paginationError: false, title: NEW_RELEASES })
    try {
      const result = await tmdb.newReleasesPage(this.type, 1, mode)
      if (mode !== this.upcoming) return
      this.put(NEW_RELEASES, { media: result.media, hasMore: result.hasMore, page: result.nextPage, refreshing: false })
      this.newReleasesError = false
    } catch {
      if (mode !== this.upcoming) return
      this.newReleasesError = true
      this.put(NEW_RELEASES, { refreshing: false })
    }
  }
  newReleasesError = false

  setUpcoming(upcoming: boolean) {
    if (this.upcoming === upcoming) return
    this.upcoming = upcoming
    void this.loadNewReleases()
  }

  // --- seasonal, taste and the paged rails ---------------------------------------------------

  async loadHoliday() {
    const holiday = currentHoliday(today())
    if (!holiday) return
    const first = await attempt(() => tmdb.holiday(holiday.id, this.type, 1), [])
    this.put(HOLIDAY, { media: first, page: 1, hasMore: first.length > 0, title: holiday.title })
  }

  likedSeeds(): Media[] {
    return [...getData().library.values()].filter((e) => e.liked === true && e.state !== 'hidden').map((e) => e.media)
  }

  async loadTaste() {
    const liked = this.likedSeeds()
    if (!liked.length) {
      this.tasteSeeds = []
      this.put(TASTE, { media: [], refreshing: false, hasMore: false })
      return
    }
    this.put(TASTE, { refreshing: true })
    const shuffledSeeds = shuffled(liked)
    const sameType = shuffledSeeds.filter((m) => m.mediaType === this.type)
    const otherType = shuffledSeeds.filter((m) => m.mediaType !== this.type && matchingGenre(m, this.type) != null)
    let seeds = [...sameType.slice(0, 2), ...otherType.slice(0, sameType.length === 0 ? 3 : 1)]
    if (!seeds.length) seeds = otherType.slice(0, 3)
    const excluded = new Set([...getData().library.keys()])
    const first = await tastePage(this.type, seeds, 1, excluded)
    this.tasteSeeds = seeds
    this.put(TASTE, { media: first, page: 1, hasMore: seeds.length > 0, refreshing: false })
  }

  async loadMore(key: string) {
    const rail = this.rails.get(key)
    if (!rail || rail.loadingMore || rail.refreshing) return
    const type = this.type
    if (key === NEW_RELEASES) {
      if (!rail.hasMore) return
      const mode = this.upcoming
      this.put(key, { loadingMore: true, paginationError: false })
      try {
        const result = await tmdb.newReleasesPage(type, rail.page, mode, new Set(rail.media.map((m) => m.id)))
        if (mode !== this.upcoming) return
        const now = this.rails.get(key)!
        this.put(key, { page: result.nextPage, media: unique([...now.media, ...result.media]), hasMore: result.hasMore, loadingMore: false })
      } catch {
        if (mode === this.upcoming) this.put(key, { paginationError: true, loadingMore: false })
      }
      return
    }
    if (key === TASTE) {
      if (!rail.hasMore) return
      this.put(key, { loadingMore: true })
      const nextPage = rail.page + 1
      const excluded = new Set([...getData().library.keys(), ...rail.media.map((m) => m.id)])
      const more = await tastePage(type, this.tasteSeeds, nextPage, excluded)
      const now = this.rails.get(key)!
      this.put(key, { media: unique([...now.media, ...more]), page: nextPage, hasMore: more.length > 0 && nextPage < 20, loadingMore: false })
      return
    }
    if ((key === HOLIDAY || key === TRUE_STORIES || key === APOCALYPTIC || key === TRUE_CRIME) && !rail.hasMore) return
    this.put(key, { loadingMore: true })
    const nextPage = rail.page + 1
    const holiday = currentHoliday(today())
    const fetch = (): Promise<Media[]> => {
      switch (key) {
        case HOLIDAY: return holiday ? tmdb.holiday(holiday.id, type, nextPage) : Promise.resolve([])
        case MASTERPIECES: return tmdb.masterpieces(type, nextPage)
        case TRUE_STORIES: return tmdb.trueStories(type, nextPage)
        case APOCALYPTIC: return tmdb.apocalyptic(type, nextPage)
        case TRUE_CRIME: return tmdb.trueCrime(type, nextPage)
        default: {
          const genre = GENRES.find((g) => g.label === key)
          if (!genre) return Promise.resolve([])
          return genre.id === 'erotic' ? tmdb.eroticDiscover(type, nextPage) : tmdb.discover(type, nextPage, genreValue(genre, type), null, 'popular')
        }
      }
    }
    try {
      const more = await fetch()
      const now = this.rails.get(key)!
      if (key === HOLIDAY || key === TRUE_STORIES || key === APOCALYPTIC || key === TRUE_CRIME) {
        if (!more.length) this.put(key, { page: nextPage, hasMore: false, loadingMore: false })
        else this.put(key, { page: nextPage, media: unique([...now.media, ...more]), loadingMore: false })
      } else if (more.length) this.put(key, { page: nextPage, media: unique([...now.media, ...more]), loadingMore: false })
      else this.put(key, { loadingMore: false })
    } catch {
      this.put(key, { loadingMore: false })
    }
  }

  /** "Pull to refresh" of an expanded list: a new random page, or the first page again. */
  async refreshRail(key: string) {
    const rail = this.rails.get(key)
    if (!rail || rail.refreshing || rail.loadingMore) return
    const type = this.type
    if (key === NEW_RELEASES) return this.loadNewReleases()
    if (key === TASTE) return this.loadTaste()
    this.put(key, { refreshing: true })
    let replacement: Media[] = []
    let page = 1
    if (key === MASTERPIECES) {
      page = randomPage()
      if (page === rail.page) page = page === 10 ? 2 : page + 1
      replacement = await attempt(() => tmdb.masterpieces(type, page), [])
    } else if (key === TRUE_STORIES) replacement = await attempt(() => tmdb.trueStories(type, 1), [])
    else if (key === APOCALYPTIC) replacement = await attempt(() => tmdb.apocalyptic(type, 1), [])
    else if (key === TRUE_CRIME) replacement = await attempt(() => tmdb.trueCrime(type, 1), [])
    if (replacement.length) this.put(key, { media: replacement, page, hasMore: true, refreshing: false })
    else this.put(key, { refreshing: false })
  }

  canRefresh(key: string) {
    return [NEW_RELEASES, MASTERPIECES, TASTE, TRUE_STORIES, TRUE_CRIME, APOCALYPTIC].includes(key)
  }
}

const catalogs = new Map<string, Catalog>()

export function catalogFor(type: string): Catalog {
  let c = catalogs.get(type)
  if (!c) {
    c = new Catalog(type)
    catalogs.set(type, c)
  }
  return c
}

export function useCatalog(type: string): Catalog {
  const c = catalogFor(type)
  useSyncExternalStore(c.subscribe, c.version)
  return c
}
