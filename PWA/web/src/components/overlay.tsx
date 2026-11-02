// Material 3 overlays as the app uses them: Dialog, AlertDialog, ModalBottomSheet and Toast.
// Everything renders into #overlay-root (inside the app shell), never clipped by a page.
import { AnimatePresence, animate, motion, useDragControls, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useBackHandler } from '../lib/back.ts'
import { useStore } from '../lib/store.ts'
import { fastOutSlowIn, spring, tween } from './motion.ts'

export function Portal({ children }: { children: ReactNode }) {
  const root = document.getElementById('overlay-root')
  return root ? createPortal(children, root) : <>{children}</>
}

/** Compose Dialog: scrim, fade + slight scale (fade_scale_in 240 ms / out 180 ms). */
export function Dialog({ open, onDismiss, children, dismissible = true, style, fullHeight, fullScreen = false }: {
  open: boolean; onDismiss: () => void; children: ReactNode; dismissible?: boolean; style?: CSSProperties; fullHeight?: number; fullScreen?: boolean
}) {
  useBackHandler(open, () => { if (dismissible) onDismiss() })
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div key="dialog" className="fill center" style={{ zIndex: 60, padding: fullScreen ? 0 : '24px 24px', pointerEvents: 'auto' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1, transition: tween(240) }} exit={{ opacity: 0, transition: tween(180, [0.4, 0, 1, 1]) }}>
            <div className="fill" style={{ background: 'rgba(0,0,0,.6)' }} onClick={() => { if (dismissible) onDismiss() }} />
            <motion.div initial={{ scale: 0.97 }} animate={{ scale: 1, transition: tween(240, fastOutSlowIn) }} exit={{ scale: 0.98, transition: tween(180, [0.4, 0, 1, 1]) }}
              style={{ position: 'relative', width: '100%', maxWidth: fullScreen ? 'none' : 560, maxHeight: fullHeight ? `${fullHeight * 100}%` : '100%', height: fullScreen ? '100%' : fullHeight ? `${fullHeight * 100}%` : undefined, display: 'flex', flexDirection: 'column', ...style }}>
              {children}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  )
}

/** Material 3 AlertDialog on the dark scheme. */
export function AlertDialog({ open, title, text, confirm, dismiss, onDismiss }: {
  open: boolean; title: string; text: ReactNode; confirm: { label: string; onClick: () => void }; dismiss?: { label: string; onClick: () => void }; onDismiss: () => void
}) {
  return (
    <Dialog open={open} onDismiss={onDismiss} style={{ maxWidth: 312 + 48 }}>
      <div style={{ background: 'var(--surface-high)', borderRadius: 28, padding: 24 }}>
        <div className="t-headline-small" style={{ color: 'var(--ink)', fontWeight: 400, letterSpacing: 0 }}>{title}</div>
        <div className="t-body-medium" style={{ color: 'var(--muted)', marginTop: 16 }}>{text}</div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 24, gap: 8 }}>
          {dismiss && <DialogButton onClick={dismiss.onClick}>{dismiss.label}</DialogButton>}
          <DialogButton onClick={confirm.onClick}>{confirm.label}</DialogButton>
        </div>
      </div>
    </Dialog>
  )
}

export function DialogButton({ children, onClick, color = 'var(--primary)', disabled }: { children: ReactNode; onClick: () => void; color?: string; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} style={{ height: 40, padding: '0 12px', borderRadius: 20, color: disabled ? 'rgba(247,245,243,.38)' : color, fontSize: 14, fontWeight: 500, letterSpacing: 0.1 }}>
      {children}
    </button>
  )
}

/**
 * ModalBottomSheet (skipPartiallyExpanded): slides up with a spring, drags down to dismiss, hides
 * before the caller removes it. [children] gets close(after), which slides it away first.
 */
export function BottomSheet({ onDismiss, children, background = 'var(--surface)', radius = 36, handleColor = '#77717A' }: {
  onDismiss: () => void; children: (close: (after?: () => void) => void) => ReactNode; background?: string; radius?: number; handleColor?: string
}) {
  const y = useMotionValue(2000)
  const [height, setHeight] = useState(0)
  const sheet = useRef<HTMLDivElement>(null)
  const controls = useDragControls()
  const closing = useRef(false)
  const scrim = useTransform(y, (v) => (height > 0 ? Math.max(0, Math.min(1, 1 - v / height)) * 0.32 : 0))
  useEffect(() => {
    const h = sheet.current?.offsetHeight ?? 600
    setHeight(h)
    y.set(h)
    const c = animate(y, 0, spring(1, 400))
    return () => c.stop()
  }, [])
  const close = (after?: () => void) => {
    if (closing.current) return
    closing.current = true
    animate(y, sheet.current?.offsetHeight ?? 800, { ...tween(250), onComplete: () => (after ?? onDismiss)() })
  }
  useBackHandler(true, () => close())
  return (
    <Portal>
      <div className="fill" style={{ zIndex: 55, pointerEvents: 'auto' }}>
        <motion.div className="fill" style={{ background: '#000', opacity: scrim }} onClick={() => close()} />
        <motion.div ref={sheet} drag="y" dragControls={controls} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 1 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > (sheet.current?.offsetHeight ?? 600) * 0.35 || info.velocity.y > 800) close()
            else animate(y, 0, spring(1, 400))
          }}
          style={{ y, position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: 'calc(100% - var(--safe-top) - 24px)', display: 'flex', flexDirection: 'column', background, borderTopLeftRadius: radius, borderTopRightRadius: radius, maxWidth: 640, margin: '0 auto' }}>
          <div onPointerDown={(e) => controls.start(e)} style={{ padding: '22px 0', touchAction: 'none', cursor: 'grab', flex: 'none' }}>
            <div style={{ width: 32, height: 4, borderRadius: 2, background: handleColor, margin: '0 auto' }} />
          </div>
          <div className="scroll" style={{ flex: '1 1 auto', minHeight: 0 }}>{children(close)}</div>
        </motion.div>
      </div>
    </Portal>
  )
}

/** Android Toast: a short message at the bottom. Driven by showToast() in the store. */
export function ToastHost() {
  const { toast } = useStore()
  const [shown, setShown] = useState<{ id: number; text: string } | null>(null)
  useEffect(() => {
    if (!toast) return
    setShown(toast)
    const id = window.setTimeout(() => setShown((s) => (s?.id === toast.id ? null : s)), toast.text.length > 60 ? 3500 : 2000)
    return () => window.clearTimeout(id)
  }, [toast])
  return (
    <Portal>
      <AnimatePresence>
        {shown && (
          <motion.div key={shown.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(200)}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(64px + var(--safe-bottom))', display: 'flex', justifyContent: 'center', zIndex: 80, pointerEvents: 'none', padding: '0 32px' }}>
            <div style={{ background: '#2C2C30', color: '#F1F0F4', borderRadius: 24, padding: '12px 18px', fontSize: 14, lineHeight: '20px', letterSpacing: 0.25, boxShadow: '0 4px 12px rgba(0,0,0,.4)', textAlign: 'center', maxWidth: 360 }}>
              {shown.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  )
}
