import { useSyncExternalStore } from 'react'
import { api, ApiError } from './api.ts'
import {
  entryToJson, personFollowToJson, personKey, releaseFollowToJson, defaultPrefs,
  type AppState, type LibraryEntry, type Media, type PersonFollow, type Prefs, type Provider, type ReleaseFollow, type TvReminder,
} from '../../../shared/model.ts'
import { mediaFromJson, entryFromJson, releaseFollowFromJson, personFollowFromJson } from '../../../shared/model.ts'

// The data of the logged in account, kept in memory and in localStorage so the app opens at once
// (and offline) with the last data. Writes are applied here first, like the phone's synchronous
// SharedPreferences, then sent to the server; a failed write shows its message and reloads.

type Snapshot = {
  data: AppState | null
  /** Bumped on every change: the native app's `refresh` counter. */
  version: number
  loadError: string | null
  username: string | null
  toast: { id: number; text: string } | null
}

let snapshot: Snapshot = { data: null, version: 0, loadError: null, username: null, toast: null }
const listeners = new Set<() => void>()

function emit(changes: Partial<Snapshot>, bump = true) {
  snapshot = { ...snapshot, ...changes, version: bump ? snapshot.version + 1 : snapshot.version }
  listeners.forEach((l) => l())
}

export function useStore(): Snapshot {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => snapshot)
}
export const getStore = () => snapshot

const cacheKey = () => `streamwise.cache.${(snapshot.username ?? '').toLowerCase()}`

function normalize(raw: AppState): AppState {
  return {
    ...raw,
    library: raw.library.map(entryFromJson),
    follows: raw.follows.map(releaseFollowFromJson),
    people: raw.people.map(personFollowFromJson),
    prefs: { ...defaultPrefs(), ...raw.prefs },
  }
}

export function setUser(username: string | null) {
  let data: AppState | null = null
  if (username) {
    try {
      const cached = localStorage.getItem(`streamwise.cache.${username.toLowerCase()}`)
      if (cached) data = normalize(JSON.parse(cached))
    } catch { /* no cache */ }
  }
  emit({ username, data, loadError: null })
}

export function forgetUser(username: string) {
  try { localStorage.removeItem(`streamwise.cache.${username.toLowerCase()}`) } catch { /* ignore */ }
}

function persist() {
  try { if (snapshot.data && snapshot.username) localStorage.setItem(cacheKey(), JSON.stringify(snapshot.data)) } catch { /* full or blocked */ }
}

let inFlight: Promise<void> | null = null
let pendingWrites = 0

/** GET /api/state?since=: cheap when nothing changed. */
export function refresh(force = false): Promise<void> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const since = !force && snapshot.data ? `?since=${snapshot.data.revision}` : ''
      const body = await api<AppState & { unchanged?: boolean }>('/api/state' + since)
      // A write still on its way would be undone by an older state.
      if (pendingWrites > 0) return
      if (body.unchanged) {
        if (snapshot.loadError) emit({ loadError: null }, false)
        return
      }
      emit({ data: normalize(body), loadError: null })
      persist()
    } catch (e) {
      emit({ loadError: e instanceof Error ? e.message : 'Errore' }, false)
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export function showToast(text: string) {
  emit({ toast: { id: Date.now(), text } }, false)
}

function change(work: (data: AppState) => AppState) {
  if (!snapshot.data) return
  emit({ data: work(snapshot.data) })
  persist()
}

/** Applies [local] at once, then runs [remote]; on failure the message is shown and the server's data comes back. */
async function write(local: (data: AppState) => AppState, remote: () => Promise<unknown>): Promise<boolean> {
  change(local)
  pendingWrites++
  try {
    await remote()
    return true
  } catch (e) {
    showToast(e instanceof ApiError ? e.message : 'Operazione non riuscita')
    return false
  } finally {
    pendingWrites--
    if (pendingWrites === 0) void refresh(true)
  }
}

// --- reads (LibraryStore getters) ---------------------------------------------------------------

export const entries = (): LibraryEntry[] => snapshot.data?.library ?? []
export const entryOf = (media: Pick<Media, 'id'> | null | undefined): LibraryEntry | null =>
  media ? snapshot.data?.library.find((e) => e.media.id === media.id) ?? null : null
export const stateOf = (media: Pick<Media, 'id'>) => entryOf(media)?.state ?? ''
export const byState = (state: string) => entries().filter((e) => e.state === state)
export const prefs = (): Prefs => snapshot.data?.prefs ?? defaultPrefs()
export const follows = (): ReleaseFollow[] => snapshot.data?.follows ?? []
export const followOf = (id: string) => follows().find((f) => f.media.id === id) ?? null
export const people = (): PersonFollow[] => snapshot.data?.people ?? []
export const isPersonFollowed = (p: { id: number; director: boolean }) => people().some((f) => personKey(f.person) === personKey(p))
export const reminders = (): TvReminder[] => snapshot.data?.reminders ?? []

// --- writes ------------------------------------------------------------------------------------

/** Saves the entry computed by shared/library.ts (null = nothing to change). */
export function saveEntry(entry: LibraryEntry | null) {
  if (!entry) return Promise.resolve(false)
  return write((d) => {
    const index = d.library.findIndex((e) => e.media.id === entry.media.id)
    const library = index >= 0 ? d.library.map((e, i) => (i === index ? entry : e)) : [...d.library, entry]
    return { ...d, library }
  }, () => api('/api/library', { method: 'POST', json: entryToJson(entry) }))
}

/** LibraryStore.remove / restore. */
export function removeEntry(media: Pick<Media, 'id'>) {
  return write((d) => ({ ...d, library: d.library.filter((e) => e.media.id !== media.id) }),
    () => api('/api/library?id=' + encodeURIComponent(media.id), { method: 'DELETE' }))
}

/** LibraryStore.mergeDetails: keeps fresher details of a title already in the library. */
export function mergeDetails(media: Media) {
  const e = entryOf(media)
  if (!e) return
  if (JSON.stringify(entryToJson({ ...e, media })) === JSON.stringify(entryToJson(e))) return
  void saveEntry({ ...e, media })
}

export function setPrefs(changes: Partial<Prefs>) {
  return write((d) => ({ ...d, prefs: { ...d.prefs, ...changes } }), () => api('/api/prefs', { method: 'POST', json: changes }))
}

export function saveFollow(f: ReleaseFollow) {
  return write((d) => ({ ...d, follows: [...d.follows.filter((x) => x.media.id !== f.media.id), f] }),
    () => api('/api/follows', { method: 'POST', json: releaseFollowToJson(f) }))
}
export function unfollow(id: string) {
  return write((d) => ({ ...d, follows: d.follows.filter((x) => x.media.id !== id) }),
    () => api('/api/follows?id=' + encodeURIComponent(id), { method: 'DELETE' }))
}

export function followPerson(f: PersonFollow) {
  return write((d) => ({ ...d, people: [...d.people.filter((x) => personKey(x.person) !== personKey(f.person)), f] }),
    () => api('/api/people', { method: 'POST', json: personFollowToJson(f) }))
}
export function unfollowPerson(p: { id: number; director: boolean }) {
  const key = personKey(p)
  return write((d) => ({ ...d, people: d.people.filter((x) => personKey(x.person) !== key) }),
    () => api('/api/people?key=' + encodeURIComponent(key), { method: 'DELETE' }))
}

export function saveAvailability(id: string, providers: Provider[]) {
  return write((d) => ({ ...d, availability: { ...d.availability, [id]: { checkedAt: Date.now(), providers } } }),
    () => api('/api/availability', { method: 'POST', json: { id, providers } }))
}

export function saveReminder(r: Omit<TvReminder, 'trigger'>) {
  return api('/api/reminders', { method: 'POST', json: r }).then(() => refresh(true))
}
export function deleteReminder(key: string) {
  return write((d) => ({ ...d, reminders: d.reminders.filter((r) => r.key !== key) }),
    () => api('/api/reminders?key=' + encodeURIComponent(key), { method: 'DELETE' }))
}

/** ReleaseCheckWorker.refreshOnLaunch (force: "controlla ora"). */
export function checkReleases(force = false) {
  return api('/api/check' + (force ? '?force=1' : ''), { method: 'POST' }).then(() => {
    // The check runs in the background on the server: pick up its results shortly after.
    setTimeout(() => void refresh(), 6000)
    setTimeout(() => void refresh(), 20000)
  }).catch(() => { /* offline */ })
}

export async function importBackup(text: string): Promise<boolean> {
  let root: unknown
  try { root = JSON.parse(text) } catch { return false }
  try {
    await api('/api/backup', { method: 'POST', json: root })
  } catch {
    return false
  }
  await refresh(true)
  return true
}

export async function exportBackup(): Promise<string> {
  const response = await fetch('/api/backup', { credentials: 'same-origin' })
  if (!response.ok) throw new ApiError(response.status, 'Esportazione non riuscita')
  return response.text()
}

export const parseMedia = mediaFromJson
