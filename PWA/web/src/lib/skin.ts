// The app's look: modern slate, skeuomorphic leather-and-brass, or Modern UI (Windows Phone) — Skin in DesignSystem.kt.
// Saved per device, like on Android; styles.css does the rest through the `skeu` / `metro` class on <html>.
import { useSyncExternalStore } from 'react'

export type SkinName = 'modern' | 'skeu' | 'metro'

const KEY = 'streamwise-skin'
const listeners = new Set<() => void>()
const saved = localStorage.getItem(KEY)
let skin: SkinName = saved === 'skeu' || saved === 'metro' ? saved : 'modern'
apply()

function apply() {
  document.documentElement.classList.toggle('skeu', skin === 'skeu')
  document.documentElement.classList.toggle('metro', skin === 'metro')
}

export function setSkin(next: SkinName) {
  skin = next
  localStorage.setItem(KEY, next)
  apply()
  listeners.forEach((l) => l())
}

export function useSkin(): SkinName {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => skin)
}

export const useSkeu = () => useSkin() === 'skeu'
export const useMetro = () => useSkin() === 'metro'
