type Bezier = [number, number, number, number]
export type Spring = { type: 'spring'; stiffness: number; damping: number; mass: number }
export type Tween = { type: 'tween'; duration: number; ease: Bezier | 'linear'; delay?: number }

/** Compose spring(dampingRatio, stiffness) as a framer-motion transition (mass 1). */
export function spring(dampingRatio = 1, stiffness = 1500): Spring {
  return { type: 'spring', stiffness, damping: 2 * dampingRatio * Math.sqrt(stiffness), mass: 1 }
}

/** Compose FastOutSlowInEasing (default of tween()). */
export const fastOutSlowIn: Bezier = [0.4, 0, 0.2, 1]
/** Sw.Emphasized and Sw.Decelerate. */
export const emphasized: Bezier = [0.2, 0, 0, 1]
export const decelerate: Bezier = [0.05, 0.7, 0.1, 1]

export function tween(durationMs = 300, ease: Bezier | 'linear' = fastOutSlowIn, delayMs = 0): Tween {
  return { type: 'tween', duration: durationMs / 1000, ease, ...(delayMs ? { delay: delayMs / 1000 } : {}) }
}

/** Solves a cubic bezier easing for x in [0, 1] (CubicBezierEasing.transform). */
export function bezier([x1, y1, x2, y2]: Bezier): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t
  const sy = (t: number) => ((ay * t + by) * t + cy) * t
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x
      if (Math.abs(err) < 1e-6) break
      const d = dx(t)
      if (Math.abs(d) < 1e-6) break
      t -= err / d
    }
    let lo = 0, hi = 1
    for (let i = 0; i < 30 && Math.abs(sx(t) - x) > 1e-6; i++) {
      if (sx(t) < x) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return sy(t)
  }
}

/** Light tick like HapticFeedbackType.TextHandleMove, where the browser can vibrate. */
export function haptic(long = false) {
  try { navigator.vibrate?.(long ? 25 : 8) } catch { /* not supported */ }
}
