import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { emphasized, fastOutSlowIn } from './motion.ts'
import { C } from './ui.tsx'

// DesignSystem.kt ContainerTransform: the page is revealed by a rounded clip that grows out of the
// tapped element, so its content is never stretched. The tapped artwork fills the moving clip and
// cross-fades into the page while the backdrop dims. Progress runs 0 (source) → 1 (full page).
// Without a visible source the page simply fades and settles in place.

const contentAlpha = (p: number) => Math.min(1, Math.max(0, (p - 0.28) / 0.5))

export type TransformSource = {
  rect: DOMRect | null
  /** Corner radius of the source in px (default 24 dp). */
  corner?: number
  /** Artwork shown inside the moving clip (the tapped poster or backdrop). */
  previewUrl?: string
  /** A composed source (a card with its texts) drawn at its size and scaled to cover the clip. */
  art?: ReactNode
  /** Small sources hand over quickly instead of zooming into giant text (0.3 for cards and chips). */
  artFadeEnd?: number
}

export function ContainerTransform({ source, closing, openMs = 540, closeMs = 460, onClosed, children }: {
  source: TransformSource
  closing: boolean
  openMs?: number
  closeMs?: number
  onClosed: () => void
  children: ReactNode
}) {
  const p = useMotionValue(0)
  const box = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect()
    if (r) setArea({ x: r.left, y: r.top, w: r.width, h: r.height })
  }, [])

  // The visible part of the source, in the page's coordinates.
  const src = (() => {
    const r = source.rect
    if (!r || !area || r.width <= 1 || r.height <= 1) return null
    const s = { left: r.left - area.x, top: r.top - area.y, right: r.right - area.x, bottom: r.bottom - area.y }
    if (s.bottom <= 0 || s.top >= area.h || s.right <= 0 || s.left >= area.w) return null
    return s
  })()

  useEffect(() => {
    let cancelled = false
    let controls: { stop: () => void } | null = null
    if (closing) {
      controls = animate(p, 0, { duration: closeMs / 1000, ease: fastOutSlowIn, onComplete: () => { if (!cancelled) onClosed() } })
    } else {
      // Waits until the page has been composed, so the motion never starts on a heavy frame.
      const id = requestAnimationFrame(() => requestAnimationFrame(() => {
        if (cancelled) return
        setReady(true)
        controls = animate(p, 1, { duration: openMs / 1000, ease: emphasized })
      }))
      return () => { cancelled = true; cancelAnimationFrame(id); controls?.stop() }
    }
    return () => { cancelled = true; controls?.stop() }
  }, [closing])

  const rectAt = (v: number) => {
    const w = area?.w ?? 0, h = area?.h ?? 0
    if (!src) return { left: 0, top: 0, right: w, bottom: h }
    return { left: src.left * (1 - v), top: src.top * (1 - v), right: src.right + (w - src.right) * v, bottom: src.bottom + (h - src.bottom) * v }
  }
  const corner = source.corner ?? 24

  const clip = useTransform(p, (v) => {
    const r = rectAt(v)
    const w = area?.w ?? 0, h = area?.h ?? 0
    return `inset(${r.top}px ${w - r.right}px ${h - r.bottom}px ${r.left}px round ${corner * (1 - v)}px)`
  })
  const clipOpacity = useTransform(p, (v) => (src ? 1 : Math.min(1, Math.max(0, v))))
  const scrim = useTransform(p, (v) => Math.min(1, Math.max(0, v)) * 0.7)
  const pageOpacity = useTransform(p, contentAlpha)
  const pageScale = useTransform(p, (v) => 0.93 + 0.07 * v)
  const pageY = useTransform(p, (v) => (1 - v) * 40)
  const previewOpacity = useTransform(p, (v) => (src ? 1 - contentAlpha(v) : 0))
  const artOpacity = useTransform(p, (v) => (source.artFadeEnd != null ? Math.min(1, Math.max(0, 1 - v / source.artFadeEnd)) : 1 - contentAlpha(v)))

  const preview = useRef<HTMLDivElement>(null)
  const artBox = useRef<HTMLDivElement>(null)
  const place = (v: number) => {
    const r = rectAt(v)
    const el = preview.current
    if (el) Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px` })
    const art = artBox.current
    if (art && src) {
      const sw = src.right - src.left, sh = src.bottom - src.top
      const scale = Math.max((r.right - r.left) / sw, (r.bottom - r.top) / sh)
      const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2
      art.style.transform = `translate(${cx - (sw * scale) / 2}px, ${cy - (sh * scale) / 2}px) scale(${scale})`
    }
  }
  useMotionValueEvent(p, 'change', place)
  useLayoutEffect(() => place(p.get()), [area])

  return (
    <div ref={box} style={{ position: 'absolute', inset: 0 }} onPointerDown={(e) => e.stopPropagation()}>
      <motion.div style={{ position: 'absolute', inset: 0, background: '#000', opacity: scrim }} />
      {area && (
        <motion.div style={{ position: 'absolute', inset: 0, clipPath: clip, WebkitClipPath: clip, opacity: clipOpacity, willChange: 'clip-path' }}>
          <div style={{ position: 'absolute', inset: 0, background: C.surface }} />
          {source.art && src ? (
            <motion.div ref={artBox} style={{ position: 'absolute', left: 0, top: 0, width: src.right - src.left, height: src.bottom - src.top, transformOrigin: '0 0', opacity: artOpacity }}>
              {source.art}
            </motion.div>
          ) : source.previewUrl && src ? (
            <motion.div ref={preview} style={{ position: 'absolute', overflow: 'hidden', opacity: previewOpacity }}>
              <img src={source.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </motion.div>
          ) : null}
          <motion.div style={{ position: 'absolute', inset: 0, opacity: pageOpacity, scale: pageScale, y: pageY }}>
            {ready && children}
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
