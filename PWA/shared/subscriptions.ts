// Port of SubscriptionRepository.java: Italian subscription services, availability snapshots
// (cached 24 h per title) and the count-based ranking of the "Abbonamenti" panel.
import type { AvailabilityRecord, LibraryEntry, Provider } from './model.ts'
import { PLATFORMS } from './tmdb.ts'

export const MAX_AGE = 24 * 60 * 60 * 1000

export type Availability = { providers: Provider[]; checkedAt: number; failed: boolean; verified: boolean }

export const availabilityFresh = (a: Availability, now = Date.now()) => {
  const age = now - a.checkedAt
  return a.verified && age >= 0 && age < MAX_AGE
}

export const serviceId = (id: number) => (id === 1796 ? 8 : id === 2100 ? 119 : id)

export function cachedAvailability(record: AvailabilityRecord | undefined, flatrate: Provider[]): Availability {
  if (record) return { providers: record.providers, checkedAt: record.checkedAt, failed: false, verified: true }
  return { providers: [...flatrate], checkedAt: 0, failed: false, verified: false }
}

export function defaults(): Provider[] {
  const out: Provider[] = PLATFORMS.map((p) => ({ id: p.providerId, name: p.label, logo: '', kind: 'flatrate' }))
  const ids = [39, 11, 524, 110, 283, 109]
  const names = ['NOW', 'MUBI', 'discovery+', 'Infinity+', 'Crunchyroll', 'TIMVISION']
  ids.forEach((id, i) => out.push({ id, name: names[i], logo: '', kind: 'flatrate' }))
  return out
}

/** Merges newly seen services into the saved list (SubscriptionRepository.saveServices). */
export function mergeServices(saved: Provider[], seen: Provider[]): Provider[] {
  const known = new Map<number, Provider>()
  for (const p of saved) known.set(p.id, p)
  for (const p of seen) if (p.id === serviceId(p.id)) known.set(p.id, p)
  return [...known.values()]
}

export function services(directory: Provider[], snapshots: Iterable<Availability>): Provider[] {
  const out = new Map<number, Provider>()
  for (const p of defaults()) out.set(p.id, p)
  for (const p of directory) out.set(serviceId(p.id), p)
  for (const snapshot of snapshots) for (const p of snapshot.providers) if (!out.has(serviceId(p.id))) out.set(serviceId(p.id), p)
  return [...out.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'it'))
}

export function included(snapshot: Availability | undefined | null, serviceIds: Set<number>): boolean {
  if (snapshot == null) return false
  for (const p of snapshot.providers) if (serviceIds.has(serviceId(p.id))) return true
  return false
}

export type Rank = { provider: Provider; saved: number; progress: number; additional: number }
export const rankTotal = (r: Rank) => r.saved + r.progress

export function rank(entries: Iterable<LibraryEntry>, snapshots: Map<string, Availability>, list: Provider[], active: Set<number>): Rank[] {
  const unique = new Map<string, LibraryEntry>()
  for (const e of entries) if (e.state === 'saved' || e.state === 'progress') unique.set(e.media.id, e)
  const result: Rank[] = []
  for (const service of list) {
    const r: Rank = { provider: service, saved: 0, progress: 0, additional: 0 }
    const selected = new Set([serviceId(service.id)])
    for (const entry of unique.values()) {
      const availability = snapshots.get(entry.media.id)
      if (!included(availability, selected)) continue
      if (entry.state === 'saved') r.saved++
      else r.progress++
      if (!included(availability, active)) r.additional++
    }
    result.push(r)
  }
  return result.sort((a, b) => rankTotal(b) - rankTotal(a) || a.provider.name.toLowerCase().localeCompare(b.provider.name.toLowerCase(), 'it'))
}

/** LibraryStore.subscriptionIds: the old per-month object or the current plain list. */
export function subscriptionIds(raw: unknown, yearMonth: string): number[] {
  let array: unknown[] | null = null
  if (Array.isArray(raw)) array = raw
  else if (raw && typeof raw === 'object') {
    const months = raw as Record<string, unknown>
    if (Array.isArray(months[yearMonth])) array = months[yearMonth] as unknown[]
    else {
      let latest = ''
      for (const key of Object.keys(months)) if (/^\d{4}-\d{2}$/.test(key) && Array.isArray(months[key]) && key > latest) latest = key
      array = latest ? (months[latest] as unknown[]) : null
    }
  } else if (typeof raw === 'string') {
    try { return subscriptionIds(JSON.parse(raw), yearMonth) } catch { return [] }
  }
  const ids: number[] = []
  for (const v of array ?? []) {
    const id = Math.trunc(Number(v) || 0)
    if (id > 0 && !ids.includes(serviceId(id))) ids.push(serviceId(id))
  }
  return ids
}
