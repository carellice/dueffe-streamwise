import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { Media, Person, Programme } from '../../../shared/model.ts'

// StreamWiseApp keeps a tab plus pages opened above it (search, settings, details...), each one
// growing out of the element that was tapped, and sheets/dialogs above those. Here every page and
// every sheet is a layer wired to the browser history, so the Android back gesture and the browser
// back button close the top one, like BackHandler.

export type Tab = 'home' | 'discover' | 'guide' | 'library'
export const TABS: Tab[] = ['home', 'discover', 'guide', 'library']

export type LibrarySection = 'progress' | 'saved' | 'watched' | 'following' | 'services' | 'sagas' | 'hidden'

/** What a tapped element looks like on screen, so a page can grow out of exactly that element. */
export type Origin = { rect: DOMRect | null; url?: string; corner?: number; art?: 'ai' | 'find' | 'seeAll'; label?: string }

export type AdvisorRequest = { type: string; genre: string | null; platform: string | null; libraryOnly: boolean }

export type Page =
  | { kind: 'search' }
  | { kind: 'ai' }
  | { kind: 'findTitle' }
  | { kind: 'settings' }
  | { kind: 'filters'; type: string }
  | { kind: 'detail'; media: Media; advisor?: AdvisorRequest | null }
  | { kind: 'person'; person: Person }
  | { kind: 'saga'; id: number; name: string; movies: Media[] }
  | { kind: 'genre'; type: string; genreId: number; genreName: string }
  | { kind: 'episodes'; media: Media }
  | { kind: 'catalog'; title: string; type: string; rail: string; eyebrow?: string | null }
  | { kind: 'programme'; programme: Programme }

export type Entry = { key: number; page: Page; origin: Origin | null; closing: boolean }

type State = { tab: Tab; stack: Entry[]; librarySection: LibrarySection; guideDate: string | null; discoverKind: 'movie' | 'tv'; guideRequest: number; tabChrome: boolean }

let nextKey = 1
let state: State = { tab: 'home', stack: [], librarySection: 'progress', guideDate: null, discoverKind: 'movie', guideRequest: 0, tabChrome: true }
const listeners = new Set<() => void>()
const backHandlers: (() => boolean)[] = []
/** Set while the app itself goes back (closing a page or a sheet), so BackHandlers don't take it. */
let programmatic = 0

/** Every open page or sheet, oldest first: the history depth is its length. */
type Layer = { key: number; sheet?: () => void }
let layers: Layer[] = []

function emit(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function useNav<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => select(state),
  )
}

export const navState = () => state

history.replaceState({ depth: 0 }, '')

function popTo(depth: number) {
  const removed = layers.slice(depth)
  layers = layers.slice(0, depth)
  const closing = new Set<number>()
  for (const layer of removed.reverse()) {
    if (layer.sheet) layer.sheet()
    else closing.add(layer.key)
  }
  if (closing.size) emit({ stack: state.stack.map((e) => (closing.has(e.key) ? { ...e, closing: true } : e)) })
}

window.addEventListener('popstate', (event) => {
  const depth = (event.state as { depth?: number } | null)?.depth ?? 0
  if (depth >= layers.length) {
    // The entry of a layer the app already removed.
    if (programmatic > 0) programmatic--
    return
  }
  const fromApp = programmatic > 0
  if (fromApp) programmatic--
  // A page can take the back gesture for itself (BackHandler): a wizard step.
  if (!fromApp) {
    for (let i = backHandlers.length - 1; i >= 0; i--) {
      if (backHandlers[i]()) {
        history.pushState({ depth: layers.length }, '')
        return
      }
    }
  }
  popTo(depth)
})

function push(layer: Layer) {
  layers = [...layers, layer]
  history.pushState({ depth: layers.length }, '')
}

export function open(page: Page, origin: Origin | null = null): number {
  const entry: Entry = { key: nextKey++, page, origin, closing: false }
  emit({ stack: [...state.stack, entry] })
  push({ key: entry.key })
  return entry.key
}

function goBack(steps: number) {
  if (steps <= 0) return
  programmatic++
  history.go(-steps)
}

/** Closes the layer [key] and everything above it (its transition plays first). */
export function close(key: number) {
  const index = layers.findIndex((l) => l.key === key)
  if (index >= 0) goBack(layers.length - index)
}

/** A closing page finished its transition. */
export function finished(key: number) {
  emit({ stack: state.stack.filter((e) => e.key !== key) })
}

/** Replaces what the page [key] shows (the advisor's "another one"). */
export function replacePage(key: number, page: Page) {
  emit({ stack: state.stack.map((e) => (e.key === key ? { ...e, page, origin: null } : e)) })
}

export function setTab(tab: Tab) {
  if (tab !== state.tab) emit({ tab, tabChrome: true })
}

export const setLibrarySection = (librarySection: LibrarySection) => emit({ librarySection })
export const setDiscoverKind = (discoverKind: 'movie' | 'tv') => emit({ discoverKind })
export const setGuideDate = (guideDate: string) => emit({ guideDate })
/** Hides the floating bar while a catalog list is expanded (onExpandedChange). */
export const setTabChrome = (tabChrome: boolean) => { if (tabChrome !== state.tabChrome) emit({ tabChrome }) }

/** Closes every page and sheet at once (a notification opened something new). */
export function closeAll() {
  const depth = layers.length
  popTo(0)
  emit({ stack: [] })
  goBack(depth)
}

export function openGuide(date: string) {
  closeAll()
  emit({ tab: 'guide', guideDate: date, guideRequest: state.guideRequest + 1, tabChrome: true })
}

/** BackHandler: [handler] returns true (or nothing) when it consumed the back gesture. */
export function useBackHandler(enabled: boolean, handler: () => boolean | void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!enabled) return
    const h = () => ref.current() !== false
    backHandlers.push(h)
    return () => {
      const i = backHandlers.indexOf(h)
      if (i >= 0) backHandlers.splice(i, 1)
    }
  }, [enabled])
}

/**
 * A sheet or dialog that the back gesture closes. While [visible], it holds a history entry;
 * [onDismiss] runs when the user goes back. Closing it from the UI should call the returned dismiss.
 */
export function useSheetBack(visible: boolean, onDismiss: () => void): () => void {
  const key = useRef(0)
  const ref = useRef(onDismiss)
  ref.current = onDismiss
  useEffect(() => {
    if (!visible) return
    const k = nextKey++
    key.current = k
    push({ key: k, sheet: () => { key.current = 0; ref.current() } })
    return () => {
      // Closed by the app (a choice was made): drop its history entry quietly.
      if (key.current === k) {
        key.current = 0
        const index = layers.findIndex((l) => l.key === k)
        if (index >= 0) {
          const above = layers.length - index
          layers = layers.filter((l) => l.key !== k)
          if (above === 1) goBack(1)
          // A sheet buried under newer layers just stops counting; its entry is reused.
        }
      }
    }
  }, [visible])
  return () => {
    const k = key.current
    if (k) close(k)
    else ref.current()
  }
}
