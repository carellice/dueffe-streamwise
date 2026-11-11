// The app's look: the modern slate one or the skeuomorphic leather-and-brass one (Skin in DesignSystem.kt).
// Saved per device, like on Android; styles.css does the rest through the `skeu` class on <html>.
import { useSyncExternalStore } from 'react'

const KEY = 'streamwise-skin'
const listeners = new Set<() => void>()
let skeu = localStorage.getItem(KEY) === 'skeu'
document.documentElement.classList.toggle('skeu', skeu)

export function setSkeu(on: boolean) {
  skeu = on
  localStorage.setItem(KEY, on ? 'skeu' : 'modern')
  document.documentElement.classList.toggle('skeu', on)
  listeners.forEach((l) => l())
}

export function useSkeu(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => skeu)
}
