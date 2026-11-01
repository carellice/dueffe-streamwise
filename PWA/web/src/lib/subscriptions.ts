import { useEffect, useSyncExternalStore } from 'react'
import { providerFrom, providerJson, type LibraryEntry, type Media, type Provider } from '../../../shared/model.ts'
import { PLATFORMS } from '../../../shared/tmdb.ts'
import { deviceKey, getData, loggedUser, read, write } from './store.ts'
import { tmdb } from './tmdb.ts'

// SubscriptionRepository.java: watch-provider snapshots of the saved titles (kept a day on this
// device, like the native "streamwise-subscriptions" preferences) and the count-based ranking.

const MAX_AGE = 24 * 60 * 60 * 1000

export type Availability = { providers: Provider[]; checkedAt: number; failed: boolean; verified: boolean }
export const fresh = (a: Availability) => { const age = Date.now() - a.checkedAt; return a.verified && age >= 0 && age < MAX_AGE }

export const serviceId = (id: number) => (id === 1796 ? 8 : id === 2100 ? 119 : id)

type Saved = { services: Provider[]; records: Record<string, { checkedAt: number; providers: Provider[] }> }

function load(): Saved {
  try {
    const raw = JSON.parse(read(deviceKey(loggedUser(), 'subscriptions')) ?? '{}')
    return { services: (raw.services ?? []).map(providerFrom), records: raw.records ?? {} }
  } catch {
    return { services: [], records: {} }
  }
}

function save(s: Saved) {
  write(deviceKey(loggedUser(), 'subscriptions'), JSON.stringify({ services: s.services.map(providerJson), records: s.records }))
}

function saveServices(s: Saved, services: Provider[]) {
  const known = new Map(s.services.map((p) => [p.id, p]))
  for (const p of services) if (p.id === serviceId(p.id)) known.set(p.id, p)
  s.services = [...known.values()]
}

function cached(s: Saved, media: Media): Availability {
  const record = s.records[media.id]
  return record ? { providers: record.providers.map(providerFrom), checkedAt: record.checkedAt, failed: false, verified: true } : { providers: [...media.flatrate], checkedAt: 0, failed: false, verified: false }
}

export function defaults(): Provider[] {
  const out: Provider[] = PLATFORMS.map((p) => ({ id: p.providerId, name: p.label, logo: '', kind: 'flatrate' }))
  const ids = [39, 11, 524, 110, 283, 109], names = ['NOW', 'MUBI', 'discovery+', 'Infinity+', 'Crunchyroll', 'TIMVISION']
  ids.forEach((id, i) => out.push({ id, name: names[i], logo: '', kind: 'flatrate' }))
  return out
}

export function servicesOf(directory: Provider[], snapshots: Availability[]): Provider[] {
  const out = new Map<number, Provider>()
  for (const p of defaults()) out.set(p.id, p)
  for (const p of directory) out.set(serviceId(p.id), p)
  for (const snapshot of snapshots) for (const p of snapshot.providers) if (!out.has(serviceId(p.id))) out.set(serviceId(p.id), p)
  return [...out.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'it'))
}

export function included(snapshot: Availability | undefined, ids: Set<number>): boolean {
  if (!snapshot) return false
  return snapshot.providers.some((p) => ids.has(serviceId(p.id)))
}

export type Rank = { provider: Provider; saved: number; progress: number; additional: number }
export const rankTotal = (r: Rank) => r.saved + r.progress

export function rank(entries: LibraryEntry[], snapshots: Map<string, Availability>, services: Provider[], active: Set<number>): Rank[] {
  const unique = new Map<string, LibraryEntry>()
  for (const e of entries) if (e.state === 'saved' || e.state === 'progress') unique.set(e.media.id, e)
  const result = services.map((service) => {
    const r: Rank = { provider: service, saved: 0, progress: 0, additional: 0 }
    const selected = new Set([serviceId(service.id)])
    for (const entry of unique.values()) {
      const a = snapshots.get(entry.media.id)
      if (!included(a, selected)) continue
      if (entry.state === 'saved') r.saved++
      else r.progress++
      if (!included(a, active)) r.additional++
    }
    return r
  })
  return result.sort((a, b) => rankTotal(b) - rankTotal(a) || a.provider.name.toLowerCase().localeCompare(b.provider.name.toLowerCase(), 'it'))
}

// --- rememberSubscriptionData: one shared state, refreshed when the saved titles change ----------

export type SubscriptionData = { availability: Map<string, Availability>; directory: Provider[]; updating: boolean; completed: number; total: number }

let state: SubscriptionData = { availability: new Map(), directory: [], updating: false, completed: 0, total: 0 }
let version = 0
const listeners = new Set<() => void>()
let signature = ''
let generation = 0
let directoryLoaded = false

function set(patch: Partial<SubscriptionData>) {
  state = { ...state, ...patch }
  version++
  listeners.forEach((l) => l())
}

async function update(force: boolean) {
  const g = ++generation
  const saved = load()
  const media = [...getData().library.values()].filter((e) => e.state === 'saved' || e.state === 'progress').map((e) => e.media)
  const availability = new Map(media.map((m) => [m.id, cached(saved, m)]))
  const pending = media.filter((m) => force || !fresh(availability.get(m.id)!))
  set({ availability, directory: saved.services, total: media.length, completed: media.length - pending.length, updating: pending.length > 0 })
  if (!directoryLoaded || force) {
    directoryLoaded = true
    try {
      const directory = await tmdb.subscriptionDirectory(defaults().map((p) => p.id))
      const s = load()
      saveServices(s, directory)
      save(s)
      if (g === generation) set({ directory: s.services })
    } catch { /* keeps the saved directory */ }
  }
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    while (cursor < pending.length) {
      const item = pending[cursor++]
      let result: Availability
      try {
        const providers = await tmdb.subscriptionAvailability(item)
        const s = load()
        saveServices(s, providers)
        s.records[item.id] = { checkedAt: Date.now(), providers }
        save(s)
        result = { providers, checkedAt: Date.now(), failed: false, verified: true }
      } catch {
        const c = cached(load(), item)
        result = { ...c, failed: true }
      }
      if (g !== generation) return
      const next = new Map(state.availability)
      next.set(item.id, result)
      set({ availability: next, directory: load().services, completed: state.completed + 1 })
    }
  }))
  if (g === generation) set({ updating: false })
}

export const reloadSubscriptions = () => void update(true)

export function useSubscriptionData(): SubscriptionData & { services: Provider[]; uncertain: number } {
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => version)
  const library = getData().library
  const sig = [...library.values()].filter((e) => e.state === 'saved' || e.state === 'progress').map((e) => e.media.id).sort().join('|')
  useEffect(() => {
    if (sig !== signature) {
      signature = sig
      void update(false)
    }
  }, [sig])
  const values = [...state.availability.values()]
  return { ...state, services: servicesOf(state.directory, values), uncertain: values.filter((a) => !a.verified || a.failed).length }
}

// --- the filter of a library section ---------------------------------------------------------

export type SubscriptionFilter = { activeOnly: boolean; services: number[] }
export const NO_FILTER: SubscriptionFilter = { activeOnly: false, services: [] }

export function filterIncludes(f: SubscriptionFilter, media: Media, data: SubscriptionData, active: Set<number>): boolean {
  if (!f.activeOnly && !f.services.length) return true
  return included(data.availability.get(media.id), f.activeOnly ? active : new Set(f.services))
}
