import { useSyncExternalStore } from 'react'
import type { Media, Person } from '../../../shared/model.ts'
import { open, type AdvisorRequest, type Origin } from './nav.ts'

// App-wide sheets (ActionSheet, AdvisorSheet) and the shortcuts every screen uses to open pages.

type Sheets = { action: Media | null; advisor: { libraryOnly: boolean } | null }
let sheets: Sheets = { action: null, advisor: null }
const listeners = new Set<() => void>()

function set(patch: Partial<Sheets>) {
  sheets = { ...sheets, ...patch }
  listeners.forEach((l) => l())
}

export function useSheets() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => sheets)
}

export const openActions = (media: Media) => set({ action: media })
export const closeActions = () => set({ action: null })
export const openAdvisor = (libraryOnly: boolean) => set({ advisor: { libraryOnly } })
export const closeAdvisor = () => set({ advisor: null })

/** openFromCatalog: the detail page grows out of the tapped artwork. */
export function openMedia(media: Media, origin: Origin | null = null, advisor: AdvisorRequest | null = null) {
  open({ kind: 'detail', media, advisor }, origin)
}

export function openPerson(person: Person, rect: DOMRect | null) {
  // Sources are the circular photos, so the page starts as that circle.
  open({ kind: 'person', person }, rect ? { rect, corner: Math.min(rect.width, rect.height) / 2, url: person.profile } : null)
}

/** rating(): one decimal in Italian, "n.d." when missing. */
export const rating = (value: number) => (value > 0 ? value.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : 'n.d.')
