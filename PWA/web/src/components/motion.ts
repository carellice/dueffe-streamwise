type Spring = { type: 'spring'; stiffness: number; damping: number; mass: number }
type Tween = { type: 'tween'; duration: number; ease: [number, number, number, number] | 'linear'; delay?: number }
export type Bezier = [number, number, number, number]

/** Compose spring(dampingRatio, stiffness) as a framer-motion transition (mass 1). */
export function spring(dampingRatio = 1, stiffness = 1500): Spring {
  return { type: 'spring', stiffness, damping: 2 * dampingRatio * Math.sqrt(stiffness), mass: 1 }
}

/** Compose FastOutSlowInEasing (the default of tween()). */
export const fastOutSlowIn: Bezier = [0.4, 0, 0.2, 1]
/** Sw.Emphasized: CubicBezierEasing(.2, 0, 0, 1). */
export const emphasized: Bezier = [0.2, 0, 0, 1]
/** Sw.Decelerate: CubicBezierEasing(.05, .7, .1, 1). */
export const decelerate: Bezier = [0.05, 0.7, 0.1, 1]
export const linearOutSlowIn: Bezier = [0, 0, 0.2, 1]

export function tween(durationMs: number, ease: Bezier | 'linear' = fastOutSlowIn, delayMs = 0): Tween {
  return { type: 'tween', duration: durationMs / 1000, ease, ...(delayMs ? { delay: delayMs / 1000 } : {}) }
}

/** Spring.DampingRatio* and Spring.Stiffness* constants. */
export const Damping = { NoBouncy: 1, LowBouncy: 0.75, MediumBouncy: 0.5, HighBouncy: 0.2 }
export const Stiffness = { High: 10000, Medium: 1500, MediumLow: 400, Low: 200, VeryLow: 50 }

/** HapticFeedbackType.TextHandleMove / LongPress, where the browser can vibrate. */
export function haptic(long = false) {
  try { navigator.vibrate?.(long ? 25 : 8) } catch { /* not supported */ }
}

/** The cubic-bezier easing as a function, for values driven outside framer-motion. */
export function bezier([x1, y1, x2, y2]: Bezier): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const x = (t: number) => ((ax * t + bx) * t + cx) * t
  const y = (t: number) => ((ay * t + by) * t + cy) * t
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (p: number) => {
    if (p <= 0) return 0
    if (p >= 1) return 1
    let t = p
    for (let i = 0; i < 8; i++) {
      const err = x(t) - p
      if (Math.abs(err) < 1e-5) break
      const d = dx(t)
      if (Math.abs(d) < 1e-6) break
      t -= err / d
    }
    return y(Math.min(1, Math.max(0, t)))
  }
}
