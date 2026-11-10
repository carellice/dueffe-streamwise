// DesignSystem.kt and the small shared composables of MainActivity.kt, one web component each.
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type HTMLMotionProps } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { icons, type IconName } from '../lib/icons.gen.ts'
import { decelerate, haptic, spring, tween, Stiffness } from './motion.ts'

export type Rect = { left: number; top: number; width: number; height: number }

/** boundsInRoot(): the element's box relative to the app shell. */
export function boundsOf(el: Element | null | undefined): Rect | null {
  if (!el) return null
  const root = document.querySelector('.app')?.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  return { left: r.left - (root?.left ?? 0), top: r.top - (root?.top ?? 0), width: r.width, height: r.height }
}

export function Icon({ name, size = 24, color, style, className }: { name: IconName; size?: number; color?: string; style?: CSSProperties; className?: string }) {
  const icon = icons[name]
  return (
    <svg viewBox={icon.box} width={size} height={size} fill="currentColor" className={className}
      style={{ color, flex: 'none', display: 'block', ...style }} aria-hidden dangerouslySetInnerHTML={{ __html: icon.svg }} />
  )
}

// --- press feedback ----------------------------------------------------------------------------

type PressProps = Omit<HTMLMotionProps<'div'>, 'onClick'> & {
  /** Modifier.pressScale(interaction, pressed). */
  pressed?: number
  onClick?: (el: HTMLDivElement) => void
  onLongPress?: (el: HTMLDivElement) => void
  disabled?: boolean
}

/** A clickable without ripple that scales while pressed (spring 0.45 / 650), like noRippleClickable. */
export function Press({ pressed = 0.95, onClick, onLongPress, disabled, children, style, ...rest }: PressProps) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)
  const long = useRef(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const clear = () => {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
  }
  return (
    <motion.div
      ref={ref}
      {...rest}
      style={{ cursor: disabled ? 'default' : 'pointer', ...style }}
      whileTap={disabled ? undefined : { scale: pressed }}
      transition={spring(0.45, 650)}
      onPointerDown={(e) => {
        long.current = false
        start.current = { x: e.clientX, y: e.clientY }
        if (onLongPress && !disabled) {
          clear()
          timer.current = window.setTimeout(() => {
            long.current = true
            haptic(true)
            if (ref.current) onLongPress(ref.current)
          }, 400)
        }
      }}
      onPointerMove={(e) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear()
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
      onContextMenu={onLongPress ? (e) => e.preventDefault() : undefined}
      onClick={(e) => {
        // Nested pressables (a button on a card) never also trigger the card.
        e.stopPropagation()
        clear()
        if (long.current || disabled) return
        if (ref.current) onClick?.(ref.current)
      }}
    >
      {children}
    </motion.div>
  )
}

// --- buttons -----------------------------------------------------------------------------------

export function GlassIconButton({ icon, label, size = 44, tint = 'var(--ink)', highlighted = false, onClick, style }: {
  icon: IconName; label?: string; size?: number; tint?: string; highlighted?: boolean; onClick: (rect: Rect | null) => void; style?: CSSProperties
}) {
  return (
    <Press pressed={0.88} aria-label={label} role="button" onClick={(el) => onClick(boundsOf(el))}
      className={'center ' + (highlighted ? 'brand-glow' : 'glass')}
      style={{ width: size, height: size, borderRadius: '50%', flex: 'none', ['--glow' as string]: '8px', ...style }}>
      <Icon name={icon} size={size * 0.48} color={highlighted ? '#fff' : tint} />
    </Press>
  )
}

/** Equal-width segmented control with a springy gradient thumb. */
export function SegmentedPills({ options, selected, height = 44, onSelect, style }: { options: string[]; selected: number; height?: number; onSelect: (i: number) => void; style?: CSSProperties }) {
  return (
    <div className="glass" style={{ ['--glass-alpha' as string]: 0.85, height, borderRadius: height / 2, padding: 4, position: 'relative', ...style }}>
      <div style={{ position: 'relative', height: '100%' }}>
        <motion.div
          initial={false}
          animate={{ left: `${(100 / options.length) * selected}%` }}
          transition={spring(0.72, Stiffness.MediumLow)}
          style={{ position: 'absolute', top: 0, bottom: 0, width: `${100 / options.length}%`, borderRadius: 999, background: 'var(--brand)' }}
        />
        <div className="row" style={{ position: 'relative', height: '100%' }}>
          {options.map((label, index) => (
            <div key={label} className="grow center" style={{ height: '100%', cursor: 'pointer' }}
              onClick={() => { if (index !== selected) { haptic(); onSelect(index) } }}>
              <motion.span initial={false} animate={{ color: index === selected ? '#FFFFFF' : '#A4A8B5' }} transition={spring()}
                style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{label}</motion.span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Scrollable chip tabs; the selected chip fills with the brand gradient and shows its count. */
export function ChipTabs({ options, selected, onSelect, style }: { options: [string, number | null][]; selected: number; onSelect: (i: number) => void; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.children[selected] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [selected])
  return (
    <div ref={ref} className="hscroll row" style={{ gap: 8, padding: '0 20px', ...style }}>
      {options.map(([label, count], index) => {
        const active = index === selected
        return (
          <Press key={label} pressed={0.92} className="row"
            onClick={() => { if (!active) haptic(); onSelect(index) }}
            style={{ height: 40, flex: 'none', borderRadius: 20, background: 'var(--raised)', padding: '0 16px', position: 'relative', overflow: 'hidden' }}>
            <motion.div initial={false} animate={{ opacity: active ? 1 : 0 }} transition={tween(260)} className="fill" style={{ background: 'var(--brand)', borderRadius: 20 }} />
            <motion.div initial={false} animate={{ opacity: active ? 0 : 1 }} transition={tween(260)} className="fill" style={{ borderRadius: 20, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08)' }} />
            <span style={{ position: 'relative', color: active ? '#fff' : 'rgba(247,245,243,.8)', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{label}</span>
            {count != null && (
              <span className="center" style={{ position: 'relative', marginLeft: 8, height: 22, minWidth: 22, padding: '0 4px', borderRadius: 11, background: active ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.08)', color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: '22px', letterSpacing: 0.5 }}>{count}</span>
            )}
          </Press>
        )
      })}
    </div>
  )
}

export type NavItem = { label: string; icon: IconName }

/** Floating glass navigation pill: the active destination widens and reveals its label. */
export function FloatingNavBar({ items, selected, onSelect }: { items: NavItem[]; selected: number; onSelect: (i: number) => void }) {
  return (
    <div className="nav-pad dock" style={{ padding: '10px 18px', paddingBottom: 'calc(10px + var(--safe-bottom))' }}>
      <div className="glass row" style={{ ['--glass-alpha' as string]: 0.94, borderRadius: 33, padding: 6, gap: 4, boxShadow: '0 14px 28px rgba(0,0,0,.55)', overflow: 'visible' }}>
        {items.map((item, index) => {
          const active = index === selected
          return (
            <motion.div key={item.label} initial={false} animate={{ flexGrow: active ? 2 : 1 }} transition={spring(0.7, 420)}
              style={{ flexBasis: 0, minWidth: 0, height: 54 }}>
              <Press pressed={0.9} onClick={() => { if (!active) haptic(); onSelect(index) }} className="center"
                style={{ height: '100%', borderRadius: 27, position: 'relative', overflow: 'hidden' }}>
                <motion.div initial={false} animate={{ opacity: active ? 1 : 0 }} transition={tween(280)} className="fill" style={{ background: 'var(--brand)', borderRadius: 27 }} />
                <div className="row" style={{ position: 'relative' }}>
                  <motion.div initial={false} animate={{ scale: active ? 1.08 : 1 }} transition={spring(0.35, 500)}>
                    <Icon name={item.icon} size={23} color={active ? '#fff' : 'var(--muted)'} />
                  </motion.div>
                  <AnimatePresence initial={false}>
                    {active && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto', transition: { width: tween(260), opacity: tween(220, undefined, 80) } }}
                        exit={{ opacity: 0, width: 0, transition: { width: tween(220), opacity: tween(90) } }}
                        style={{ overflow: 'hidden', whiteSpace: 'nowrap', display: 'block' }}>
                        <span style={{ display: 'block', paddingLeft: 7, color: '#fff', fontWeight: 700, fontSize: 13 }}>{item.label}</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </Press>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

export function SectionHeader({ title, eyebrow, action, onAction, style }: { title: string; eyebrow?: string | null; action?: string; onAction?: ((rect: Rect | null) => void) | null; style?: CSSProperties }) {
  return (
    <div className="row" style={{ alignItems: 'flex-end', padding: '0 12px 0 20px', ...style }}>
      <div className="grow col">
        {eyebrow && <span style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 900, letterSpacing: 1.6 }}>{eyebrow.toUpperCase()}</span>}
        <span style={{ color: 'var(--ink)', fontSize: 21, fontWeight: 800, letterSpacing: -0.3, lineHeight: '28px' }}>{title}</span>
      </div>
      {onAction && (
        <Press pressed={0.9} onClick={(el) => onAction(boundsOf(el))} style={{ margin: '0 8px 2px 8px' }}>
          <SeeAllChipArt label={action ?? 'Vedi tutto'} />
        </Press>
      )}
    </div>
  )
}

/** The "Vedi tutto" chip's look, shared by the header and by the page transition that grows out of it. */
export function SeeAllChipArt({ label, style }: { label: string; style?: CSSProperties }) {
  return (
    <div className="row" style={{ height: 34, borderRadius: 17, background: 'rgba(255,89,100,.12)', boxShadow: 'inset 0 0 0 1px rgba(255,89,100,.35)', padding: '0 7px 0 13px', justifyContent: 'center', ...style }}>
      <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{label}</span>
      <Icon name="chevronRight" size={17} color="var(--accent)" style={{ marginLeft: 2 }} />
    </div>
  )
}

/** Small translucent pill used for metadata on artwork (rating, year, labels). */
export function MetaPill({ text, icon, tint = 'var(--ink)', background = 'rgba(0,0,0,.55)', style }: { text: string; icon?: IconName; tint?: string; background?: string; style?: CSSProperties }) {
  return (
    <div className="row" style={{ borderRadius: 999, background, padding: '4px 8px', ...style }}>
      {icon && <Icon name={icon} size={12} color={tint} />}
      <span style={{ color: tint, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', marginLeft: icon ? 3 : 0, lineHeight: '16px' }}>{text}</span>
    </div>
  )
}

/** Pulsing dot used for "live" states. */
export function PulsingDot({ color, size = 8, style }: { color: string; size?: number; style?: CSSProperties }) {
  const box = size * 2.4
  return (
    <div style={{ width: box, height: box, position: 'relative', flex: 'none', ...style }}>
      <motion.div
        animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
        transition={{ duration: 1.3, ease: 'linear', repeat: Infinity }}
        style={{ position: 'absolute', left: (box - size) / 2, top: (box - size) / 2, width: size, height: size, borderRadius: '50%', background: color }}
      />
      <div style={{ position: 'absolute', left: (box - size) / 2, top: (box - size) / 2, width: size, height: size, borderRadius: '50%', background: color }} />
    </div>
  )
}

/** Slowly drifting ember glows behind the app content (16 s, back and forth). */
export function AuroraBackground() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let frame = 0
    const started = performance.now()
    const draw = (now: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const cycle = ((now - started) / 16000) % 2
      const phase = cycle < 1 ? cycle : 2 - cycle
      ctx.fillStyle = '#0A0B10'
      ctx.fillRect(0, 0, w, h)
      const glow = (x: number, y: number, r: number, color: string) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, color)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
      glow(w * (0.05 + 0.45 * phase), h * (0.02 + 0.08 * phase), w * 0.85, 'rgba(215,20,43,.22)')
      glow(w * (0.95 - 0.35 * phase), h * (0.18 + 0.12 * phase), w * 0.7, 'rgba(255,75,69,.14)')
      glow(w * (0.2 + 0.5 * phase), h * (0.85 - 0.1 * phase), w * 0.9, 'rgba(76,141,255,.08)')
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])
  return <canvas ref={ref} className="fill" style={{ width: '100%', height: '100%' }} />
}

/** Diagonal light sweep over gradient call-to-action cards (Modifier.lightSweep). */
export function LightSweep({ period = 3800 }: { period?: number }) {
  const x = useMotionValue(-1)
  useEffect(() => {
    const controls = animate(x, 2.2, { duration: period / 1000, ease: 'linear', repeat: Infinity })
    return () => controls.stop()
  }, [period, x])
  const background = useTransform(x, (v) => {
    const center = v * 100
    return `linear-gradient(115deg, transparent ${center - 35}%, rgba(255,255,255,.22) ${center - 12}%, transparent ${center + 10}%)`
  })
  return <motion.div className="fill" style={{ background, pointerEvents: 'none', borderRadius: 'inherit' }} />
}

const revealed = new Set<string>()

/** Modifier.reveal(delay, distance): fades and lifts content the first time it appears. */
export function Reveal({ id, delay = 0, distance = 36, children, style, className }: { id?: string; delay?: number; distance?: number; children: ReactNode; style?: CSSProperties; className?: string }) {
  const seen = id != null && revealed.has(id)
  useEffect(() => { if (id) revealed.add(id) }, [id])
  return (
    <motion.div className={className} style={style}
      initial={seen ? false : { opacity: 0, y: distance }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.56, ease: decelerate, delay: delay / 1000 }}>
      {children}
    </motion.div>
  )
}

/** AnimatedCount: counts up from 0 in 900 ms with Sw.Decelerate. */
export function AnimatedCount({ value, render }: { value: number; render: (n: number) => ReactNode }) {
  const [shown, setShown] = useState(0)
  const motionValue = useMotionValue(0)
  useEffect(() => {
    const controls = animate(motionValue, value, { duration: 0.9, ease: decelerate, onUpdate: (v) => setShown(Math.trunc(v)) })
    return () => controls.stop()
  }, [value, motionValue])
  return <>{render(shown)}</>
}

export function LoadingSkeleton({ style, className }: { style?: CSSProperties; className?: string }) {
  return <div className={'skeleton ' + (className ?? '')} aria-label="Caricamento in corso" style={style} />
}

export function Spinner({ size = 24, color = 'var(--secondary)', stroke = 3, style }: { size?: number; color?: string; stroke?: number; style?: CSSProperties }) {
  return <div className="spinner" style={{ width: size, height: size, borderWidth: stroke, color, flex: 'none', ...style }} />
}

const loadedImages = new Set<string>()

/** RemoteImage: crossfades in once loaded; a gradient (or a shimmer) while there is nothing to show. */
export function RemoteImage({ url, style, className, fit = 'cover', fallbackIcon, background, animatedPlaceholder = false, position }: {
  url: string; style?: CSSProperties; className?: string; fit?: 'cover' | 'contain'; fallbackIcon?: IconName; background?: string; animatedPlaceholder?: boolean; position?: string
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>(url && loadedImages.has(url) ? 'ok' : url ? 'loading' : 'failed')
  useLayoutEffect(() => {
    setState(url && loadedImages.has(url) ? 'ok' : url ? 'loading' : 'failed')
  }, [url])
  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden', background: background ?? 'var(--raised)', ...style }}>
      <AnimatePresence initial={false}>
        {state !== 'ok' && (
          <motion.div key="placeholder" className="fill" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(300)}>
            {animatedPlaceholder && state === 'loading'
              ? <LoadingSkeleton style={{ position: 'absolute', inset: 0 }} />
              : <div className="fill center" style={{ background: 'linear-gradient(135deg, var(--raised), var(--surface))' }}>
                  {fallbackIcon && <Icon name={fallbackIcon} size={34} color="var(--secondary)" />}
                </div>}
          </motion.div>
        )}
      </AnimatePresence>
      {url && state !== 'failed' && (
        <motion.img src={url} alt="" draggable={false} decoding="async"
          initial={false} animate={{ opacity: state === 'ok' ? 1 : 0 }} transition={tween(300)}
          onLoad={() => { loadedImages.add(url); setState('ok') }}
          onError={() => setState('failed')}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, objectPosition: position }} />
      )}
    </div>
  )
}

/** Material 3 Button / OutlinedButton / TextButton, drawn like the native ones in this app. */
export function PillButton({ children, onClick, disabled, background, color = '#fff', height = 54, style, outlined = false, shadow }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; background?: string; color?: string; height?: number; style?: CSSProperties; outlined?: boolean; shadow?: string
}) {
  return (
    <Press pressed={disabled ? 1 : 0.97} disabled={disabled} onClick={() => !disabled && onClick?.()} className="row"
      style={{
        height, borderRadius: height / 2, justifyContent: 'center', padding: '0 24px', gap: 8,
        background: outlined ? 'transparent' : disabled ? 'rgba(247,245,243,.12)' : background ?? 'var(--primary)',
        boxShadow: outlined ? 'inset 0 0 0 1px var(--outline-strong)' : disabled ? undefined : shadow,
        color: outlined ? 'var(--primary)' : disabled ? 'rgba(247,245,243,.38)' : color,
        fontSize: 14, fontWeight: 700, letterSpacing: 0.1, lineHeight: '20px', ...style,
      }}>
      {children}
    </Press>
  )
}

export function TextButton({ children, onClick, color = 'var(--primary)', disabled, style }: { children: ReactNode; onClick: () => void; color?: string; disabled?: boolean; style?: CSSProperties }) {
  return (
    <button disabled={disabled} onClick={onClick}
      style={{ height: 40, padding: '0 12px', borderRadius: 20, color: disabled ? 'rgba(247,245,243,.38)' : color, fontSize: 14, fontWeight: 700, letterSpacing: 0.1, ...style }}>
      {children}
    </button>
  )
}

/** LinearProgressIndicator with a rounded track. */
export function LinearProgress({ value, color, track = 'var(--raised)', height = 6, style }: { value: number; color: string; track?: string; height?: number; style?: CSSProperties }) {
  return (
    <div style={{ height, borderRadius: height, background: track, overflow: 'hidden', ...style }}>
      <motion.div initial={false} animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} transition={tween(300)} style={{ height: '100%', borderRadius: height, background: color }} />
    </div>
  )
}

/** Material 3 Switch on the dark scheme. */
export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{ width: 52, height: 32, borderRadius: 16, flex: 'none', position: 'relative', cursor: 'pointer', background: checked ? 'var(--primary)' : 'var(--raised)', boxShadow: checked ? undefined : 'inset 0 0 0 2px var(--outline-strong)', transition: 'background .2s' }}>
      <motion.div initial={false} animate={{ left: checked ? 24 : 8, width: checked ? 24 : 16, height: checked ? 24 : 16, top: checked ? 4 : 8 }} transition={spring(0.7, 600)}
        style={{ position: 'absolute', borderRadius: '50%', background: checked ? '#fff' : 'var(--outline-strong)' }} />
    </div>
  )
}

export const rating = (value: number) => (value > 0 ? value.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : 'n.d.')
