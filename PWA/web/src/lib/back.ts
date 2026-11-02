import { createContext, useContext, useEffect, useRef } from 'react'

// Compose BackHandler on top of the browser history: every enabled handler owns one history
// entry, so the Android back gesture, the iOS swipe and the browser back button reach the last
// registered handler, exactly like the native back dispatcher. A handler disabled by the app
// itself (a page that closed with its own button) gives its history entry back.

type Handler = { id: number; run: () => void; alive: boolean }

let nextId = 1
const handlers: Handler[] = []
/** popstate events caused by the app returning history entries, not by the user. */
let ignore = 0

history.replaceState({ swDepth: 0 }, '')

window.addEventListener('popstate', (event) => {
  if (ignore > 0) {
    ignore--
    return
  }
  const depth = (event.state as { swDepth?: number } | null)?.swDepth ?? 0
  if (depth > handlers.length) {
    // Entries of handlers that went away in the middle of the stack: skip them.
    ignore++
    history.go(handlers.length - depth)
    return
  }
  while (handlers.length > depth) {
    const top = handlers.pop()!
    top.run()
    // A handler that stays enabled (a wizard going back one step) needs its history entry again.
    setTimeout(() => {
      if (top.alive && !handlers.includes(top)) {
        handlers.push(top)
        history.pushState({ swDepth: handlers.length }, '')
      }
    }, 30)
  }
})

function register(run: () => void): Handler {
  const handler = { id: nextId++, run, alive: true }
  handlers.push(handler)
  history.pushState({ swDepth: handlers.length }, '')
  return handler
}

function unregister(handler: Handler) {
  handler.alive = false
  const index = handlers.indexOf(handler)
  if (index < 0) return // already consumed by a back gesture
  const wasTop = index === handlers.length - 1
  handlers.splice(index, 1)
  if (wasTop) {
    ignore++
    history.back()
  }
}

/** False inside a page that is already closing: its handlers stop taking the back gesture. */
export const BackScope = createContext(true)

/** BackHandler(enabled, onBack). */
export function useBackHandler(wanted: boolean, onBack: () => void) {
  const enabled = useContext(BackScope) && wanted
  const latest = useRef(onBack)
  latest.current = onBack
  useEffect(() => {
    if (!enabled) return
    const handler = register(() => latest.current())
    return () => unregister(handler)
  }, [enabled])
}
