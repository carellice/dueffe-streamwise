import { useSyncExternalStore } from 'react'
import * as lib from '../../../shared/library.ts'
import {
  entryFrom, entryJson, mediaJson, personFollowFrom, personJson, personKey, releaseFollowFrom,
  type LibraryEntry, type Media, type Person, type PersonFollow, type Programme, type ReleaseFollow, type Season, type TvReminder,
} from '../../../shared/model.ts'
import type { ReleaseInfo } from '../../../shared/tmdb.ts'
import { api } from './api.ts'

// One store for the whole app. The phone kept the library in SharedPreferences; here it lives on
// the server (GET /api/state) and is cached per account on the device, so the app opens instantly
// and works offline with the last data seen. Every write is applied at once, then sent.

export type Prefs = { genres: string[]; subscriptions: number[]; hideShowCredits: boolean }

export type AppData = {
  library: Map<string, LibraryEntry>
  follows: ReleaseFollow[]
  people: PersonFollow[]
  reminders: TvReminder[]
  prefs: Prefs
  aiConfigured: boolean
}

type RawState = { library: unknown[]; follows: unknown[]; people: unknown[]; reminders: TvReminder[]; prefs: Prefs; aiConfigured: boolean }

function parse(raw: RawState): AppData {
  const library = new Map<string, LibraryEntry>()
  for (const item of raw.library ?? []) {
    const e = entryFrom(item)
    if (e.media.id) library.set(e.media.id, e)
  }
  return {
    library,
    follows: (raw.follows ?? []).map(releaseFollowFrom).filter((f) => f.media.id),
    people: (raw.people ?? []).map(personFollowFrom).filter((f) => f.person.id > 0),
    reminders: raw.reminders ?? [],
    prefs: { ...{ genres: [], subscriptions: [], hideShowCredits: true }, ...raw.prefs },
    aiConfigured: !!raw.aiConfigured,
  }
}

function serialize(d: AppData): RawState {
  return {
    library: [...d.library.values()].map(entryJson),
    follows: d.follows.map((f) => ({ ...f, media: mediaJson(f.media) })),
    people: d.people.map((f) => ({ ...f, person: personJson(f.person) })),
    reminders: d.reminders, prefs: d.prefs, aiConfigured: d.aiConfigured,
  }
}

// --- device settings: per phone and per account, like the native SharedPreferences -----------

export type LibrarySort = 'ORIGINAL' | 'TITLE' | 'NEWEST' | 'OLDEST' | 'RATING'

export type Settings = {
  remindersEnabled: boolean
  onboarded: boolean
  librarySort: Record<string, LibrarySort>
  libraryGrid: Record<string, boolean>
  subscriptionFilter: Record<string, { activeOnly: boolean; services: number[] }>
}

const LAST_USER_KEY = 'streamwise.user'
const settingsKey = (user: string) => `streamwise.settings.${user.toLowerCase()}`
const cacheKey = (user: string) => `streamwise.cache.${user.toLowerCase()}`
export const deviceKey = (user: string, name: string) => `streamwise.${name}.${user.toLowerCase()}`

export function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

export function write(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* too big or private mode */ }
}

let currentUser = read(LAST_USER_KEY) ?? ''

function loadSettings(user: string): Settings {
  const defaults: Settings = { remindersEnabled: false, onboarded: false, librarySort: {}, libraryGrid: {}, subscriptionFilter: {} }
  try {
    return { ...defaults, ...JSON.parse(read(settingsKey(user)) ?? '{}') }
  } catch {
    return defaults
  }
}

// --- store -----------------------------------------------------------------------------------

type Store = {
  data: AppData | null
  revision: number
  settings: Settings
  loadError: string | null
  /** Bumped by every change (the native "refresh" counter that recomposes the screens). */
  version: number
}

function cachedData(user: string): { data: AppData; revision: number } | null {
  try {
    const raw = read(cacheKey(user))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data: RawState; revision: number }
    return { data: parse(parsed.data), revision: parsed.revision }
  } catch {
    return null
  }
}

let store: Store = {
  data: currentUser ? cachedData(currentUser)?.data ?? null : null,
  revision: -1,
  settings: loadSettings(currentUser),
  loadError: null,
  version: 0,
}
const listeners = new Set<() => void>()

function set(patch: Partial<Store>) {
  store = { ...store, ...patch }
  listeners.forEach((l) => l())
}

export function useStore<T>(selector: (s: Store) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => selector(store),
  )
}

export const getStore = () => store

const empty: AppData = { library: new Map(), follows: [], people: [], reminders: [], prefs: { genres: [], subscriptions: [], hideShowCredits: true }, aiConfigured: false }
export const getData = (): AppData => store.data ?? empty
export function useData(): AppData {
  return useStore((s) => s.data) ?? empty
}

export function updateSettings(patch: Partial<Settings>) {
  const settings = { ...store.settings, ...patch }
  write(settingsKey(currentUser), JSON.stringify(settings))
  set({ settings })
}

/** Switches to the settings and data of [user], after logging in or when the app opens. */
export function setUser(user: string) {
  if (user.toLowerCase() === currentUser.toLowerCase() && store.data) {
    currentUser = user
    write(LAST_USER_KEY, user)
    return
  }
  currentUser = user
  write(LAST_USER_KEY, user)
  set({ data: cachedData(user)?.data ?? null, revision: -1, settings: loadSettings(user), loadError: null, version: store.version + 1 })
}

/** Forgets the data of the account that just left this device (deleted account). */
export function forgetUser(user: string) {
  write(settingsKey(user), null)
  write(cacheKey(user), null)
}

export const loggedUser = () => currentUser

// --- data ------------------------------------------------------------------------------------

type StateResponse = ({ unchanged: true } | RawState) & { revision: number }

let loading: Promise<void> | null = null
/** Writes still on their way: a refresh meanwhile would show the old data for a moment. */
let pending = 0

/** Reloads the data when it changed on the server (another phone, a background check...). */
export function refresh(force = false): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    try {
      const since = force || !store.data ? '' : `?since=${store.revision}`
      const result = await api<StateResponse>(`/api/state${since}`)
      if ('unchanged' in result || pending > 0) return
      const { revision, ...raw } = result
      const data = parse(raw as RawState)
      set({ data, revision, loadError: null, version: store.version + 1 })
      write(cacheKey(currentUser), JSON.stringify({ data: serialize(data), revision }))
    } catch (e) {
      set({ loadError: (e as Error).message })
    } finally {
      loading = null
    }
  })()
  return loading
}

function apply(change: (d: AppData) => AppData) {
  const data = change(getData())
  set({ data, version: store.version + 1 })
  write(cacheKey(currentUser), JSON.stringify({ data: serialize(data), revision: store.revision }))
}

/** Sends a write; the screens already show it. When it fails the server state comes back. */
async function send(work: () => Promise<unknown>) {
  pending++
  try {
    await work()
  } catch (e) {
    pending--
    await refresh(true)
    throw e
  }
  pending--
  await refresh(true)
}

// --- library (LibraryStore) ------------------------------------------------------------------

export const entryOf = (media: Media): LibraryEntry | undefined => getData().library.get(media.id)
export const stateOf = (media: Media): string => entryOf(media)?.state ?? ''

function saveEntry(entry: LibraryEntry | undefined) {
  if (!entry) return Promise.resolve()
  apply((d) => {
    const library = new Map(d.library)
    library.set(entry.media.id, entry)
    return { ...d, library }
  })
  return send(() => api('/api/library', { method: 'POST', json: { entries: [entryJson(entry)] } }))
}

function removeEntry(media: Media) {
  apply((d) => {
    const library = new Map(d.library)
    library.delete(media.id)
    return { ...d, library }
  })
  return send(() => api('/api/library', { method: 'POST', json: { removed: [media.id] } }))
}

export const library = {
  save: (media: Media) => saveEntry(lib.save(entryOf(media), media)),
  watched: (media: Media, liked: boolean) => saveEntry(lib.watched(entryOf(media), media, liked)),
  markMovieUnwatched: (media: Media) => saveEntry(lib.markMovieUnwatched(entryOf(media), media)),
  setLiked: (media: Media, liked: boolean) => saveEntry(lib.setLiked(entryOf(media), liked)),
  hide: (media: Media) => saveEntry(lib.hide(entryOf(media), media)),
  restore: (media: Media) => removeEntry(media),
  remove: (media: Media) => removeEntry(media),
  togglePinned: (media: Media) => saveEntry(lib.togglePinned(entryOf(media))),
  mergeDetails: (media: Media) => saveEntry(lib.mergeDetails(entryOf(media), media)),
  restart: (media: Media) => saveEntry(lib.restart(entryOf(media), media)),
  /** Throws ReactionRequired when the last episode needs a "Mi piace / Non mi piace". */
  markEpisode: (media: Media, episode: Season['episodes'][number], seasons: Season[], liked: boolean | null) => saveEntry(lib.markEpisode(entryOf(media), media, episode, seasons, liked)),
  unwatchEpisode: (media: Media, episode: Season['episodes'][number], seasons: Season[]) => saveEntry(lib.unwatchEpisode(entryOf(media), media, episode, seasons)),
  unwatchSeason: (media: Media, season: Season, seasons: Season[]) => saveEntry(lib.unwatchSeason(entryOf(media), media, season, seasons)),
  completeSeries: (media: Media, seasons: Season[], liked: boolean) => saveEntry(lib.completeSeries(entryOf(media), media, seasons, liked)),
  completeSeason: (media: Media, season: Season, seasons: Season[], liked: boolean | null) => saveEntry(lib.completeSeason(entryOf(media), media, season, seasons, liked)),
  /** Returns true when the series went back to "in corso". */
  reopenForNewEpisodes: (media: Media, seasons: Season[]) => {
    const e = lib.reopenForNewEpisodes(entryOf(media), seasons)
    if (e) void saveEntry(e)
    return !!e
  },
  advanceFallback: (media: Media) => saveEntry(lib.advanceFallback(entryOf(media), media)),
}

export const byState = (state: string) => [...getData().library.values()].filter((e) => e.state === state)

// --- preferences on the account --------------------------------------------------------------

export function savePrefs(patch: Partial<Prefs>) {
  apply((d) => ({ ...d, prefs: { ...d.prefs, ...patch } }))
  return send(() => api('/api/prefs', { method: 'POST', json: patch }))
}

export function toggleGenre(id: string) {
  const g = [...getData().prefs.genres]
  const i = g.indexOf(id)
  if (i >= 0) g.splice(i, 1)
  else g.push(id)
  return savePrefs({ genres: g })
}

// --- follows (ReleaseFollows / PersonFollows) --------------------------------------------------

export const isFollowed = (id: string) => getData().follows.some((f) => f.media.id === id)
export const getFollow = (id: string) => getData().follows.find((f) => f.media.id === id) ?? null
export const isPersonFollowed = (p: Person) => getData().people.some((f) => personKey(f.person) === personKey(p))

export function follow(media: Media, info: ReleaseInfo | null) {
  return send(() => api('/api/follows', { method: 'POST', json: { media: mediaJson(media), info } }))
}

export function unfollow(id: string) {
  apply((d) => ({ ...d, follows: d.follows.filter((f) => f.media.id !== id) }))
  return send(() => api('/api/follows/' + encodeURIComponent(id), { method: 'DELETE' }))
}

export function followPerson(person: Person) {
  apply((d) => ({ ...d, people: [...d.people, { person: { ...person, knownFor: [] }, followedAt: Date.now(), initialized: false, known: [] }] }))
  return send(() => api('/api/people', { method: 'POST', json: { person: personJson(person) } }))
}

export function unfollowPerson(person: Person) {
  const key = personKey(person)
  apply((d) => ({ ...d, people: d.people.filter((f) => personKey(f.person) !== key) }))
  return send(() => api('/api/people/' + encodeURIComponent(key), { method: 'DELETE' }))
}

// --- TV reminders ------------------------------------------------------------------------------

export function saveReminder(programme: Programme, minutes: number) {
  return send(() => api('/api/reminders', { method: 'POST', json: { programme, minutes } }))
}

export function cancelReminder(key: string) {
  apply((d) => ({ ...d, reminders: d.reminders.filter((r) => r.key !== key) }))
  return send(() => api('/api/reminders?key=' + encodeURIComponent(key), { method: 'DELETE' }))
}

// --- AI and backup -----------------------------------------------------------------------------

export async function setupAi(accountId: string, apiToken: string) {
  await api('/api/ai/setup', { method: 'POST', json: { accountId, apiToken } })
  await refresh(true)
}

export async function clearAi() {
  await api('/api/ai/setup', { method: 'DELETE' })
  await refresh(true)
}

export async function importBackup(text: string) {
  await api('/api/backup', { method: 'POST', body: text, headers: { 'Content-Type': 'application/json' } })
  updateSettings({ onboarded: true })
  await refresh(true)
}

// Keep in step with the other devices and the background checks.
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && currentUser) void refresh() })
  setInterval(() => { if (document.visibilityState === 'visible' && currentUser) void refresh() }, 30_000)
}
