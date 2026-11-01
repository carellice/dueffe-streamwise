import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSheetBack } from '../lib/nav.ts'
import { spring, tween } from './motion.ts'
import { C } from './ui.tsx'

// Dialogs and bottom sheets render into #overlays, a sibling of the app, so a page's clip never
// cuts them. The back gesture closes them like on the phone.

function portal(node: ReactNode) {
  const host = document.getElementById('overlays')
  return host ? createPortal(node, host) : node
}

/** Compose Dialog: dimmed window, content scales and fades in. */
export function Dialog({ open, onDismiss, children, dismissible = true, width = 'min(560px, calc(100vw - 48px))', style }: {
  open: boolean; onDismiss: () => void; children: ReactNode; dismissible?: boolean; width?: string; style?: CSSProperties
}) {
  const dismiss = useSheetBack(open, () => onDismiss())
  return portal(
    <AnimatePresence>
      {open && (
        <motion.div key="dialog" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(150)}
          onClick={() => { if (dismissible) dismiss() }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 24 }}>
          <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={tween(220)}
            onClick={(e) => e.stopPropagation()} style={{ width, maxHeight: 'calc(100% - 48px)', overflowY: 'auto', ...style }} className="scroll">
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
  )
}

/** M3 AlertDialog: title, text, buttons on the right. */
export function AlertDialog({ open, onDismiss, title, text, confirm, dismiss, icon }: {
  open: boolean; onDismiss: () => void; title: ReactNode; text?: ReactNode; confirm: ReactNode; dismiss?: ReactNode; icon?: ReactNode
}) {
  return (
    <Dialog open={open} onDismiss={onDismiss} width="min(312px + 48px, calc(100vw - 48px))">
      <div style={{ background: '#1A1D26', borderRadius: 28, padding: 24 }}>
        {icon && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>{icon}</div>}
        <div className="t-headline-small" style={{ color: C.ink, fontWeight: 400, letterSpacing: 0, textAlign: icon ? 'center' : 'left' }}>{title}</div>
        {text && <div className="t-body-medium" style={{ color: C.muted, marginTop: 16 }}>{text}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>{dismiss}{confirm}</div>
      </div>
    </Dialog>
  )
}

/** ModalBottomSheet (M3): drag handle, drag down to dismiss, spring in, 250 ms out. */
export function BottomSheet({ open, onDismiss, children, background = C.surface, maxHeight = 'calc(100% - 56px)', style }: {
  open: boolean; onDismiss: () => void; children: ReactNode; background?: string; maxHeight?: string; style?: CSSProperties
}) {
  const dismiss = useSheetBack(open, () => onDismiss())
  const controls = useDragControls()
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) dismiss()
  }
  return portal(
    <AnimatePresence>
      {open && (
        <motion.div key="sheet" style={{ position: 'fixed', inset: 0, zIndex: 55 }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(250)}
            onClick={() => dismiss()} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.32)' }} />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0, transition: spring(1, 400) }} exit={{ y: '100%', transition: tween(250) }}
            drag="y" dragControls={controls} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 1 }}
            onDragEnd={onDragEnd}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, margin: '0 auto', maxWidth: 640, maxHeight, display: 'flex', flexDirection: 'column', background, borderRadius: '28px 28px 0 0', ...style }}>
            <div onPointerDown={(e) => controls.start(e)} style={{ padding: '22px 0', display: 'flex', justifyContent: 'center', touchAction: 'none', cursor: 'grab', flex: 'none' }}>
              <div style={{ width: 32, height: 4, borderRadius: 4, background: alphaMuted }} />
            </div>
            <div className="scroll" style={{ flex: 1, paddingBottom: 'var(--nav-bottom)' }}>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
  )
}

const alphaMuted = 'rgba(164,168,181,.4)'

/** Toast-like snackbar at the bottom, like Toast.makeText. */
let showToast: ((text: string) => void) | null = null
export const toast = (text: string) => showToast?.(text)

export function ToastHost() {
  const [text, setText] = useState<{ id: number; text: string } | null>(null)
  useEffect(() => {
    showToast = (t) => setText({ id: Date.now(), text: t })
    return () => { showToast = null }
  }, [])
  useEffect(() => {
    if (!text) return
    const id = window.setTimeout(() => setText(null), 2400)
    return () => window.clearTimeout(id)
  }, [text])
  return portal(
    <AnimatePresence>
      {text && (
        <motion.div key={text.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tween(200)}
          style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(110px + var(--nav-bottom))', display: 'flex', justifyContent: 'center', zIndex: 70, pointerEvents: 'none' }}>
          <div style={{ background: '#2A2E39', color: C.ink, borderRadius: 24, padding: '10px 18px', fontSize: 14, lineHeight: '20px', maxWidth: '80%', textAlign: 'center', boxShadow: '0 4px 14px rgba(0,0,0,.4)' }}>{text.text}</div>
        </motion.div>
      )}
    </AnimatePresence>,
  )
}
