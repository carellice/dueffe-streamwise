import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

// PullToRefreshBox with the M3 indicator (primaryContainer disc, onPrimaryContainer arc).

const THRESHOLD = 80

export function PullToRefresh({ refreshing, onRefresh, indicatorTop, enabled = true, children, scrollRef, style, className }: {
  refreshing: boolean; onRefresh: () => void; indicatorTop: number; enabled?: boolean; children: ReactNode
  scrollRef?: React.RefObject<HTMLDivElement>; style?: CSSProperties; className?: string
}) {
  const own = useRef<HTMLDivElement>(null)
  const ref = scrollRef ?? own
  const pull = useMotionValue(0)
  const start = useRef<number | null>(null)

  useEffect(() => {
    void animate(pull, refreshing ? THRESHOLD : 0, { duration: 0.25 })
  }, [refreshing])

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const down = (e: TouchEvent) => { start.current = el.scrollTop <= 0 && !refreshing ? e.touches[0].clientY : null }
    const move = (e: TouchEvent) => {
      if (start.current == null) return
      const dy = e.touches[0].clientY - start.current
      if (dy > 0 && el.scrollTop <= 0) {
        pull.set(Math.min(THRESHOLD * 1.6, dy * 0.5))
        if (e.cancelable) e.preventDefault()
      } else pull.set(0)
    }
    const up = () => {
      if (start.current == null) return
      start.current = null
      if (pull.get() >= THRESHOLD) onRefresh()
      else void animate(pull, 0, { duration: 0.2 })
    }
    el.addEventListener('touchstart', down, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', up)
    el.addEventListener('touchcancel', up)
    return () => {
      el.removeEventListener('touchstart', down)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', up)
      el.removeEventListener('touchcancel', up)
    }
  }, [enabled, refreshing, onRefresh])

  const y = useTransform(pull, (p) => p - 40)
  const opacity = useTransform(pull, (p) => Math.min(1, p / (THRESHOLD * 0.6)))
  const rotate = useTransform(pull, (p) => p * 3)
  return (
    <div style={{ position: 'absolute', inset: 0, ...style }}>
      <div ref={ref} className={'scroll ' + (className ?? '')} style={{ position: 'absolute', inset: 0 }}>{children}</div>
      {enabled && (
        <motion.div style={{ position: 'absolute', top: indicatorTop, left: '50%', marginLeft: -20, width: 40, height: 40, borderRadius: '50%', background: '#3B161B', y, opacity, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,.4)', pointerEvents: 'none', zIndex: 5 }}>
          <motion.div className={refreshing ? 'spinner' : undefined} style={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid transparent', borderTopColor: '#FFDAD2', borderRightColor: '#FFDAD2', rotate: refreshing ? undefined : rotate, ['--stroke' as string]: '3px', color: '#FFDAD2' }} />
        </motion.div>
      )}
    </div>
  )
}
