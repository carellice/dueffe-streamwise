// ContainerTransform and ExpandingPage of DesignSystem.kt / MainActivity.kt: a page is revealed by a
// rounded clip that grows out of the tapped element, the tapped artwork fills the moving clip and
// cross-fades into the page while the backdrop dims. Progress runs 0 (source) → 1 (full page).
import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { BackScope } from '../lib/back.ts'
import { emphasized, fastOutSlowIn } from './motion.ts'
import type { Rect } from './ui.tsx'

const contentAlpha = (p: number) => Math.min(1, Math.max(0, (p - 0.28) / 0.5))

type Box = { left: number; top: number; right: number; bottom: number }

export function ContainerTransform({ progress, source, sourceCorner, preview, sourceArt, artFadeEnd, children }: {
  progress: MotionValue<number>
  source: Rect | null
  sourceCorner?: number | null
  /** The tapped artwork (image url) that fills the moving clip. */
  preview?: ReactNode
  /** A composed source (a card with its texts) zoomed uniformly through the clip. */
  sourceArt?: ReactNode
  artFadeEnd?: number | null
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [ready, setReady] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current!
    const app = document.querySelector('.app')!.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    setArea({ left: r.left - app.left, top: r.top - app.top, width: r.width, height: r.height })
  }, [])
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const visible = (() => {
    if (!source || !area) return null
    const s = { left: source.left - area.left, top: source.top - area.top, width: source.width, height: source.height }
    if (s.width <= 1 || s.height <= 1) return null
    if (s.top + s.height <= 0 || s.top >= area.height || s.left + s.width <= 0 || s.left >= area.width) return null
    return s
  })()
  const width = area?.width ?? 0
  const height = area?.height ?? 0
  const rectAt = (p: number): Box => {
    if (!visible) return { left: 0, top: 0, right: width, bottom: height }
    return {
      left: visible.left * (1 - p),
      top: visible.top * (1 - p),
      right: visible.left + visible.width + (width - visible.left - visible.width) * p,
      bottom: visible.top + visible.height + (height - visible.top - visible.height) * p,
    }
  }
  const corner = sourceCorner ?? 24
  const clipPath = useTransform(progress, (p) => {
    const r = rectAt(p)
    return `inset(${r.top}px ${width - r.right}px ${height - r.bottom}px ${r.left}px round ${corner * (1 - p)}px)`
  })
  const layerOpacity = useTransform(progress, (p) => (visible ? 1 : Math.min(1, Math.max(0, p))))
  const dim = useTransform(progress, (p) => Math.min(1, Math.max(0, p)) * 0.7)
  const pageOpacity = useTransform(progress, contentAlpha)
  const pageScale = useTransform(progress, (p) => 0.93 + 0.07 * p)
  const pageY = useTransform(progress, (p) => (1 - p) * 40)
  const previewStyle = {
    left: useTransform(progress, (p) => rectAt(p).left),
    top: useTransform(progress, (p) => rectAt(p).top),
    width: useTransform(progress, (p) => { const r = rectAt(p); return r.right - r.left }),
    height: useTransform(progress, (p) => { const r = rectAt(p); return r.bottom - r.top }),
    opacity: useTransform(progress, (p) => (visible ? 1 - contentAlpha(p) : 0)),
  }
  const artTransform = useTransform(progress, (p) => {
    if (!visible) return 'none'
    const r = rectAt(p)
    const scale = Math.max((r.right - r.left) / visible.width, (r.bottom - r.top) / visible.height)
    const cx = (r.left + r.right) / 2 - (visible.width * scale) / 2
    const cy = (r.top + r.bottom) / 2 - (visible.height * scale) / 2
    return `translate(${cx}px, ${cy}px) scale(${scale})`
  })
  const artOpacity = useTransform(progress, (p) => (artFadeEnd != null ? Math.min(1, Math.max(0, 1 - p / artFadeEnd)) : 1 - contentAlpha(p)))

  return (
    <div ref={ref} className="fill" style={{ zIndex: 1 }}>
      <motion.div className="fill" style={{ background: '#000', opacity: dim }} />
      {area && (
        <motion.div className="fill" style={{ clipPath, WebkitClipPath: clipPath, opacity: layerOpacity, willChange: 'clip-path' }}>
          <div className="fill" style={{ background: 'var(--surface)' }} />
          {sourceArt && visible ? (
            <motion.div style={{ position: 'absolute', left: 0, top: 0, width: visible.width, height: visible.height, transformOrigin: '0 0', transform: artTransform, opacity: artOpacity }}>
              {sourceArt}
            </motion.div>
          ) : preview && visible ? (
            <motion.div style={{ position: 'absolute', ...previewStyle }}>{preview}</motion.div>
          ) : null}
          <motion.div className="fill" style={{ opacity: pageOpacity, scale: pageScale, y: pageY }}>
            {ready && children}
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

/** A page opened from a tapped element: grows in (540 ms, emphasized), shrinks back on close (460 ms). */
export function ExpandingPage({ source, onClosed, sourceCorner, sourceArt, openMs = 540, closeMs = 460, preview, closing: externalClosing, children }: {
  source: Rect | null
  onClosed: () => void
  sourceCorner?: number | null
  sourceArt?: ReactNode
  preview?: ReactNode
  openMs?: number
  closeMs?: number
  /** Set from outside (a detail page closed by its parent). */
  closing?: boolean
  children: (close: () => void) => ReactNode
}) {
  const progress = useMotionValue(0)
  const [closing, setClosing] = useState(false)
  const close = () => setClosing(true)
  const isClosing = closing || externalClosing === true
  const closed = useRef(onClosed)
  closed.current = onClosed
  useEffect(() => {
    if (isClosing) {
      const controls = animate(progress, 0, { duration: closeMs / 1000, ease: fastOutSlowIn, onComplete: () => closed.current() })
      return () => controls.stop()
    }
    // awaitTransformReady(): two frames, so the motion never starts on a heavy frame.
    let controls: { stop: () => void } | null = null
    const a = requestAnimationFrame(() => {
      const b = requestAnimationFrame(() => {
        controls = animate(progress, 1, { duration: openMs / 1000, ease: emphasized })
      })
      cleanup = () => cancelAnimationFrame(b)
    })
    let cleanup = () => cancelAnimationFrame(a)
    return () => { cleanup(); controls?.stop() }
  }, [isClosing])
  return (
    <BackScope.Provider value={!isClosing}>
      <div className="fill" style={{ pointerEvents: isClosing ? 'none' : 'auto', zIndex: 20 }}>
        <ContainerTransform progress={progress} source={source} sourceCorner={sourceCorner} sourceArt={sourceArt} preview={preview}
          artFadeEnd={sourceArt ? 0.3 : null}>
          {children(close)}
        </ContainerTransform>
      </div>
    </BackScope.Provider>
  )
}
