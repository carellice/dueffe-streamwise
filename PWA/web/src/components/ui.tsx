import { animate, AnimatePresence, motion, useMotionValue, type HTMLMotionProps } from 'framer-motion'
import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react'
import { icons, type IconName } from '../lib/icons.gen.ts'
import { decelerate, haptic, spring, tween } from './motion.ts'

// DesignSystem.kt components, one by one.

export const C = {
  bg: '#0A0B10', surface: '#14161E', raised: '#1D2029', outline: '#2C303C', ink: '#F7F5F3', muted: '#A4A8B5',
  red: '#D7142B', coral: '#FF4B45', accent: '#FF5964', amber: '#FFC24D', blue: '#4C8DFF', primary: '#E5243A',
  like: '#3DDC97', dislike: '#FF5C7A', violet: '#A57BFF', panel: '#14161E', outlineVariant: '#2C303C', error: '#FF6B7D',
} as const

export const brand = `linear-gradient(135deg, ${C.red}, ${C.coral})`

/** Color with alpha, like Color.copy(alpha = a). */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

export function Icon({ name, size = 24, color = 'currentColor', style }: { name: IconName; size?: number; color?: string; style?: CSSProperties }) {
  const icon = icons[name]
  return (
    <svg viewBox={icon.vb} width={size} height={size} fill={color} style={{ color, flex: 'none', display: 'block', ...style }} aria-hidden
      dangerouslySetInnerHTML={{ __html: icon.svg }} />
  )
}

// --- press feedback (Modifier.pressScale, spring 0.45 / 650) -----------------------------------

const pressSpring = spring(0.45, 650)

type PressProps = Omit<HTMLMotionProps<'div'>, 'onClick'> & {
  pressed?: number
  onClick?: (rect: DOMRect | null) => void
  onLongPress?: () => void
  disabled?: boolean
}

/** A clickable without ripple that shrinks while pressed; onClick receives its bounds (boundsInRoot). */
export const Pressable = forwardRef<HTMLDivElement, PressProps>(function Pressable({ pressed = 0.95, onClick, onLongPress, disabled, children, style, ...rest }, forwarded) {
  const local = useRef<HTMLDivElement | null>(null)
  const timer = useRef<number | null>(null)
  const longFired = useRef(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const setRef = (el: HTMLDivElement | null) => {
    local.current = el
    if (typeof forwarded === 'function') forwarded(el)
    else if (forwarded) forwarded.current = el
  }
  const cancel = () => {
    if (timer.current != null) window.clearTimeout(timer.current)
    timer.current = null
  }
  return (
    <motion.div
      ref={setRef}
      role="button"
      whileTap={disabled ? undefined : { scale: pressed }}
      transition={pressSpring}
      style={{ cursor: disabled ? 'default' : 'pointer', ...style }}
      onPointerDown={(e) => {
        longFired.current = false
        start.current = { x: e.clientX, y: e.clientY }
        if (onLongPress && !disabled) {
          cancel()
          timer.current = window.setTimeout(() => {
            longFired.current = true
            haptic(true)
            onLongPress()
          }, 450)
        }
      }}
      onPointerMove={(e) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel()
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={onLongPress ? (e) => e.preventDefault() : undefined}
      onClick={(e) => {
        if (disabled) return
        if (longFired.current) { longFired.current = false; return }
        e.stopPropagation()
        onClick?.(local.current?.getBoundingClientRect() ?? null)
      }}
      {...rest}
    >
      {children}
    </motion.div>
  )
})

// --- GlassIconButton ---------------------------------------------------------------------------

export function GlassIconButton({ icon, label, size = 44, tint = C.ink, highlighted = false, onClick, style }: {
  icon: IconName; label?: string; size?: number; tint?: string; highlighted?: boolean; onClick: (rect: DOMRect | null) => void; style?: CSSProperties
}) {
  return (
    <Pressable pressed={0.88} onClick={onClick} aria-label={label}
      className={highlighted ? 'brand-glow' : 'glass'}
      style={{ width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', ['--glow-blur' as string]: '8px', ...style }}>
      <Icon name={icon} size={size * 0.48} color={highlighted ? '#fff' : tint} />
    </Pressable>
  )
}

// --- SegmentedPills: equal-width segments with a springy gradient thumb ----------------------

export function SegmentedPills({ options, selected, onSelect, height = 44, style }: { options: string[]; selected: number; onSelect: (i: number) => void; height?: number; style?: CSSProperties }) {
  return (
    <div className="glass" style={{ ['--glass-alpha' as string]: 0.85, height, borderRadius: height, padding: 4, position: 'relative', ...style }}>
      <div style={{ position: 'relative', height: '100%', display: 'flex' }}>
        <motion.div
          animate={{ left: `${(100 / options.length) * selected}%` }}
          transition={spring(0.72, 400)}
          initial={false}
          style={{ position: 'absolute', top: 0, bottom: 0, width: `${100 / options.length}%`, borderRadius: height, background: brand }}
        />
        {options.map((label, i) => (
          <div key={label} onClick={() => { if (i !== selected) { haptic(); onSelect(i) } }}
            style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <motion.span animate={{ color: i === selected ? '#FFFFFF' : C.muted }} transition={spring()} initial={false}
              style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{label}</motion.span>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- ChipTabs: scrollable chips, the selected one filled with the brand gradient --------------

export function ChipTabs({ options, selected, onSelect, style }: { options: [string, number | null][]; selected: number; onSelect: (i: number) => void; style?: CSSProperties }) {
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = row.current?.children[selected] as HTMLElement | undefined
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [selected])
  return (
    <div ref={row} className="hscroll" style={{ gap: 8, padding: '0 20px', ...style }}>
      {options.map(([label, count], i) => {
        const active = i === selected
        return (
          <Pressable key={label} pressed={0.92} onClick={() => { if (!active) haptic(); onSelect(i) }}
            style={{ height: 40, flex: 'none', borderRadius: 40, background: C.raised, position: 'relative', display: 'flex', alignItems: 'center', padding: '0 16px', overflow: 'hidden' }}>
            <motion.div initial={false} animate={{ opacity: active ? 1 : 0 }} transition={tween(260)} style={{ position: 'absolute', inset: 0, background: brand }} />
            <motion.div initial={false} animate={{ opacity: active ? 0 : 1 }} transition={tween(260)}
              style={{ position: 'absolute', inset: 0, borderRadius: 40, border: `1px solid ${alpha('#FFFFFF', 0.08)}` }} />
            <span style={{ position: 'relative', color: active ? '#fff' : alpha(C.ink, 0.8), fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{label}</span>
            {count != null && (
              <span style={{ position: 'relative', marginLeft: 8, height: 22, minWidth: 22, borderRadius: 22, padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? alpha('#FFFFFF', 0.25) : alpha('#FFFFFF', 0.08), color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: '11px', letterSpacing: 0 }}>{count}</span>
            )}
          </Pressable>
        )
      })}
    </div>
  )
}

// --- FloatingNavBar: the active destination widens and reveals its label ---------------------

export type NavItem = { label: string; icon: IconName }

export function FloatingNavBar({ items, selected, onSelect }: { items: NavItem[]; selected: number; onSelect: (i: number) => void }) {
  return (
    <div style={{ padding: '10px 18px', paddingBottom: 'calc(10px + var(--nav-bottom))' }}>
      <div className="glass" style={{ ['--glass-alpha' as string]: 0.94, borderRadius: 66, padding: 6, display: 'flex', gap: 4, alignItems: 'center', boxShadow: '0 14px 28px rgba(0,0,0,.55), 0 4px 10px rgba(0,0,0,.4)' }}>
        {items.map((item, i) => {
          const active = i === selected
          return (
            <motion.div key={item.label} initial={false} animate={{ flexGrow: active ? 2 : 1 }} transition={spring(0.7, 420)} style={{ flexBasis: 0, minWidth: 0 }}>
              <Pressable pressed={0.9} onClick={() => { if (!active) haptic(); onSelect(i) }} aria-label={item.label}
                style={{ height: 54, borderRadius: 54, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.div initial={false} animate={{ opacity: active ? 1 : 0 }} transition={tween(280)} style={{ position: 'absolute', inset: 0, background: brand }} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <motion.div initial={false} animate={{ scale: active ? 1.08 : 1 }} transition={spring(0.35, 500)}>
                    <Icon name={item.icon} size={23} color={active ? '#fff' : C.muted} />
                  </motion.div>
                  <AnimatePresence initial={false}>
                    {active && (
                      <motion.span key="label"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto', transition: { width: tween(260), opacity: tween(220, undefined, 80) } }}
                        exit={{ opacity: 0, width: 0, transition: { width: tween(220), opacity: tween(90) } }}
                        style={{ overflow: 'hidden', whiteSpace: 'nowrap', color: '#fff', fontWeight: 700, fontSize: 13, display: 'block' }}>
                        <span style={{ paddingLeft: 7, display: 'block' }}>{item.label}</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </Pressable>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// --- SectionHeader with the "Vedi tutto" chip ------------------------------------------------

export function SectionHeader({ title, eyebrow, action, onAction, style }: { title: string; eyebrow?: string | null; action?: string; onAction?: ((rect: DOMRect | null) => void) | null; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', padding: '0 12px 0 20px', ...style }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && <div style={{ color: C.accent, fontSize: 11, fontWeight: 900, letterSpacing: 1.6, lineHeight: '24px' }}>{eyebrow.toUpperCase()}</div>}
        <div style={{ color: C.ink, fontSize: 21, fontWeight: 800, letterSpacing: -0.3, lineHeight: '24px' }}>{title}</div>
      </div>
      {onAction && (
        <Pressable pressed={0.9} onClick={onAction} style={{ margin: '0 8px 2px 8px' }}>
          <SeeAllChipArt label={action ?? 'Vedi tutto'} />
        </Pressable>
      )}
    </div>
  )
}

export function SeeAllChipArt({ label, style }: { label: string; style?: CSSProperties }) {
  return (
    <div style={{ height: 34, borderRadius: 34, background: alpha(C.accent, 0.12), border: `1px solid ${alpha(C.accent, 0.35)}`, padding: '0 7px 0 13px', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      <span style={{ color: C.accent, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{label}</span>
      <Icon name="chevron_right" size={17} color={C.accent} style={{ marginLeft: 2 }} />
    </div>
  )
}

/** Small translucent pill for metadata on artwork (rating, year, labels). */
export function MetaPill({ text, icon, tint = C.ink, background = 'rgba(0,0,0,.55)', style }: { text: string; icon?: IconName; tint?: string; background?: string; style?: CSSProperties }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 40, background, padding: '4px 8px', ...style }}>
      {icon && <Icon name={icon} size={12} color={tint} />}
      <span style={{ color: tint, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', marginLeft: icon ? 3 : 0, lineHeight: '13px' }}>{text}</span>
    </div>
  )
}

/** Pulsing dot used for "live" states (1300 ms linear). */
export function PulsingDot({ color, size = 8 }: { color: string; size?: number }) {
  const box = size * 2.4
  const r = box / 2.4
  return (
    <div style={{ width: box, height: box, position: 'relative', flex: 'none' }}>
      <motion.div style={{ position: 'absolute', left: '50%', top: '50%', width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r, borderRadius: '50%', background: color }}
        animate={{ scale: [1, 2.4], opacity: [0.5, 0] }} transition={{ duration: 1.3, ease: 'linear', repeat: Infinity }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r, borderRadius: '50%', background: color }} />
    </div>
  )
}

/** Slowly drifting ember glows behind the content (16 s, reversing). */
export function AuroraBackground() {
  const phase = useMotionValue(0)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const controls = animate(phase, 1, { duration: 16, ease: 'linear', repeat: Infinity, repeatType: 'reverse' })
    const unsub = phase.on('change', (p) => {
      const el = ref.current
      if (!el) return
      const w = el.clientWidth, h = el.clientHeight
      const glow = (x: number, y: number, r: number, color: string) => `radial-gradient(circle ${r}px at ${x}px ${y}px, ${color}, transparent)`
      el.style.background = [
        glow(w * (0.05 + 0.45 * p), h * (0.02 + 0.08 * p), w * 0.85, alpha(C.red, 0.22)),
        glow(w * (0.95 - 0.35 * p), h * (0.18 + 0.12 * p), w * 0.7, alpha(C.coral, 0.14)),
        glow(w * (0.2 + 0.5 * p), h * (0.85 - 0.1 * p), w * 0.9, alpha(C.blue, 0.08)),
      ].join(',') + `, ${C.bg}`
    })
    return () => { controls.stop(); unsub() }
  }, [phase])
  return <div ref={ref} style={{ position: 'absolute', inset: 0, background: C.bg }} />
}

/** Modifier.reveal: fades and lifts content the first time it appears (560 ms, Decelerate). */
export function Reveal({ delay = 0, distance = 36, children, style }: { delay?: number; distance?: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <motion.div initial={{ opacity: 0, y: distance }} animate={{ opacity: 1, y: 0 }} transition={tween(560, decelerate, delay)} style={style}>
      {children}
    </motion.div>
  )
}

export function LoadingSkeleton({ style }: { style?: CSSProperties }) {
  return <div className="skeleton" style={style} />
}

export function Spinner({ size = 54, color = C.accent, stroke = 5 }: { size?: number; color?: string; stroke?: number }) {
  return <div className="spinner" style={{ width: size, height: size, color, ['--stroke' as string]: `${stroke}px` }} />
}

export function LoadingPane() {
  return <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>
}

/** Remote artwork: fades in once loaded, with an icon on a dark slate while missing. */
export function RemoteImage({ url, style, fit = 'cover', fallbackIcon, backgroundColor, animatedPlaceholder = false, className }: {
  url: string; style?: CSSProperties; fit?: 'cover' | 'contain'; fallbackIcon?: IconName; backgroundColor?: string; animatedPlaceholder?: boolean; className?: string
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(url ? 'loading' : 'error')
  const img = useRef<HTMLImageElement>(null)
  useLayoutEffect(() => {
    setState(url ? (img.current?.complete && img.current.naturalWidth > 0 ? 'ok' : 'loading') : 'error')
  }, [url])
  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden', background: backgroundColor ?? C.raised, ...style }}>
      {state !== 'ok' && animatedPlaceholder && <div className="skeleton" style={{ position: 'absolute', inset: 0 }} />}
      {state === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${C.raised}, ${C.panel})` }}>
          {fallbackIcon && <Icon name={fallbackIcon} size={34} color={C.accent} />}
        </div>
      )}
      {url && (
        <img ref={img} src={url} alt="" draggable={false} decoding="async" loading="lazy"
          onLoad={() => setState('ok')} onError={() => setState('error')}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, opacity: state === 'ok' ? 1 : 0, transition: 'opacity 220ms ease-out' }} />
      )}
    </div>
  )
}

/** EmptyState with the floating brand tile (2200 ms, reversing). */
export function EmptyState({ icon, title, body, action, onAction, style }: { icon: IconName; title: string; body: string; action?: string; onAction?: () => void; style?: CSSProperties }) {
  return (
    <Reveal style={{ padding: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', ...style }}>
      <motion.div className="brand-glow" animate={{ y: [-5, 5] }} transition={{ duration: 2.2, ease: [0.4, 0, 0.2, 1], repeat: Infinity, repeatType: 'reverse' }}
        style={{ width: 84, height: 84, borderRadius: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', ['--glow-blur' as string]: '18px' }}>
        <Icon name={icon} size={38} color="#fff" />
      </motion.div>
      <div className="t-headline-small" style={{ marginTop: 24, color: C.ink }}>{title}</div>
      <div style={{ color: C.muted, fontSize: 15, lineHeight: '21px', marginTop: 8 }}>{body}</div>
      {action && onAction && (
        <Pressable onClick={() => onAction()} className="brand-glow" style={{ marginTop: 22, height: 50, borderRadius: 50, padding: '0 26px', display: 'flex', alignItems: 'center', ['--glow-blur' as string]: '8px' }}>
          <span className="t-label-large" style={{ color: '#fff' }}>{action}</span>
        </Pressable>
      )}
    </Reveal>
  )
}

/** AnimatedCount: counts up to [value] in 900 ms (Decelerate). */
export function AnimatedCount({ value, children }: { value: number; children: (v: number) => ReactNode }) {
  const [shown, setShown] = useState(0)
  const mv = useMotionValue(0)
  useEffect(() => {
    const c = animate(mv, value, { ...tween(900, decelerate), onUpdate: (v) => setShown(Math.trunc(v)) })
    return () => c.stop()
  }, [value, mv])
  return <>{children(shown)}</>
}

// --- buttons --------------------------------------------------------------------------------

type ButtonProps = { children: ReactNode; onClick: () => void; disabled?: boolean; style?: CSSProperties; className?: string }

/** Filled button (Button with CircleShape). */
export function FilledButton({ children, onClick, disabled, style, className, background = C.primary, color = '#fff' }: ButtonProps & { background?: string; color?: string }) {
  return (
    <Pressable onClick={() => !disabled && onClick()} disabled={disabled} className={className} pressed={0.97}
      style={{ height: 40, borderRadius: 40, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: disabled ? alpha(C.ink, 0.12) : background, color: disabled ? alpha(C.ink, 0.38) : color, ...style }}>
      <span className="t-label-large" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit' }}>{children}</span>
    </Pressable>
  )
}

/** OutlinedButton with the M3 outline color. */
export function OutlinedButton({ children, onClick, disabled, style }: ButtonProps) {
  return (
    <Pressable onClick={() => !disabled && onClick()} disabled={disabled} pressed={0.97}
      style={{ height: 40, borderRadius: 40, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${disabled ? alpha(C.ink, 0.12) : '#4B505E'}`, color: disabled ? alpha(C.ink, 0.38) : C.primary, ...style }}>
      <span className="t-label-large" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit' }}>{children}</span>
    </Pressable>
  )
}

/** TextButton. */
export function TextButton({ children, onClick, disabled, style, color = C.primary }: ButtonProps & { color?: string }) {
  return (
    <Pressable onClick={() => !disabled && onClick()} disabled={disabled} pressed={0.97}
      style={{ height: 40, borderRadius: 40, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: disabled ? alpha(C.ink, 0.38) : color, ...style }}>
      <span className="t-label-large" style={{ color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>{children}</span>
    </Pressable>
  )
}

/** M3 Switch (52 × 32). */
export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div role="switch" aria-checked={checked} onClick={(e) => { e.stopPropagation(); haptic(); onChange(!checked) }}
      style={{ width: 52, height: 32, borderRadius: 32, flex: 'none', cursor: 'pointer', position: 'relative', background: checked ? C.primary : C.raised, border: `2px solid ${checked ? C.primary : '#4B505E'}`, transition: 'background 150ms, border-color 150ms' }}>
      <motion.div initial={false} animate={{ x: checked ? 20 : 0, width: checked ? 24 : 16, height: checked ? 24 : 16, top: checked ? 2 : 6, left: checked ? 2 : 6 }} transition={spring(0.8, 600)}
        style={{ position: 'absolute', borderRadius: '50%', background: checked ? '#fff' : '#4B505E' }} />
    </div>
  )
}

/** LinearProgressIndicator without stop indicator. */
export function LinearProgress({ value, color, track, height = 6, style }: { value: number; color: string; track: string; height?: number; style?: CSSProperties }) {
  return (
    <div style={{ height, borderRadius: height, background: track, overflow: 'hidden', ...style }}>
      <motion.div initial={false} animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} transition={spring(1, 50)} style={{ height: '100%', borderRadius: height, background: color }} />
    </div>
  )
}

/** OutlinedTextField look (M3, 56 dp, 4 dp corners). */
export function OutlinedField({ value, onChange, placeholder, label, type = 'text', autoComplete, onSubmit, enterKeyHint, style, autoFocus, inputMode, maxLength }: {
  value: string; onChange: (v: string) => void; placeholder?: string; label?: string; type?: string; autoComplete?: string; onSubmit?: () => void
  enterKeyHint?: 'search' | 'send' | 'done' | 'go' | 'next'; style?: CSSProperties; autoFocus?: boolean; inputMode?: 'text' | 'numeric' | 'search'; maxLength?: number
}) {
  const [focus, setFocus] = useState(false)
  return (
    <label style={{ display: 'block', position: 'relative', ...style }}>
      <div style={{ height: 56, borderRadius: 4, border: `${focus ? 2 : 1}px solid ${focus ? C.primary : '#4B505E'}`, padding: focus ? '0 15px' : '0 16px', display: 'flex', alignItems: 'center' }}>
        <input value={value} onChange={(e) => onChange(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)} placeholder={label ? undefined : placeholder} type={type} autoComplete={autoComplete}
          enterKeyHint={enterKeyHint} autoFocus={autoFocus} inputMode={inputMode}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit() } }}
          className="field" style={{ fontSize: 16, lineHeight: '24px' }} />
      </div>
      {label && (
        <span style={{ position: 'absolute', left: 12, top: value || focus ? -9 : 16, fontSize: value || focus ? 12 : 16, lineHeight: '16px', padding: '0 4px', background: value || focus ? C.surface : 'transparent', color: focus ? C.primary : C.muted, transition: 'all 150ms', pointerEvents: 'none' }}>{label}</span>
      )}
    </label>
  )
}

// --- Material 3 pieces used as they are by the native screens --------------------------------

/** M3 FilterChip: 32 dp, 8 dp corners, check icon when selected. */
export function FilterChip({ selected, label, onClick, style }: { selected: boolean; label: ReactNode; onClick: () => void; style?: CSSProperties }) {
  return (
    <div role="button" onClick={() => onClick()}
      style={{ height: 32, borderRadius: 8, flex: 'none', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', padding: selected ? '0 16px 0 8px' : '0 16px', background: selected ? '#331D20' : 'transparent', border: selected ? '1px solid transparent' : '1px solid #4B505E', color: selected ? '#FFDAD2' : C.muted, transition: 'background 150ms', ...style }}>
      {selected && <Icon name="check" size={18} color="#FFDAD2" style={{ marginRight: 8 }} />}
      <span style={{ fontSize: 14, lineHeight: '20px', fontWeight: 500, letterSpacing: 0.1, whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

/** FilledTonalIconButton (40 dp). */
export function TonalIconButton({ icon, label, onClick, background = '#3B161B', tint = '#FFDAD2', style }: { icon: IconName; label?: string; onClick: () => void; background?: string; tint?: string; style?: CSSProperties }) {
  return (
    <Pressable pressed={0.92} onClick={() => onClick()} aria-label={label}
      style={{ width: 40, height: 40, borderRadius: '50%', background, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', ...style }}>
      <Icon name={icon} size={24} color={tint} />
    </Pressable>
  )
}

/** IconButton (48 dp touch target, 24 dp icon). */
export function IconButton({ icon, label, onClick, tint = C.muted, size = 48, iconSize = 24, style }: { icon: IconName; label?: string; onClick: () => void; tint?: string; size?: number; iconSize?: number; style?: CSSProperties }) {
  return (
    <Pressable pressed={0.9} onClick={() => onClick()} aria-label={label}
      style={{ width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', ...style }}>
      <Icon name={icon} size={iconSize} color={tint} />
    </Pressable>
  )
}

export type MenuItem = { label: string; onClick: () => void; leading?: IconName; trailing?: ReactNode }

/** DropdownMenu anchored to its trigger. */
export function DropdownMenu({ open, onDismiss, items, header, radius = 4, align = 'right', style }: { open: boolean; onDismiss: () => void; items: MenuItem[]; header?: ReactNode; radius?: number; align?: 'left' | 'right'; style?: CSSProperties }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <div onClick={(e) => { e.stopPropagation(); onDismiss() }} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={tween(120)}
            style={{ position: 'absolute', top: '100%', [align]: 0, zIndex: 41, minWidth: 112, maxWidth: 280, background: C.surface, borderRadius: radius, padding: '8px 0', boxShadow: '0 2px 6px rgba(0,0,0,.4), 0 6px 16px rgba(0,0,0,.35)', transformOrigin: align === 'right' ? 'top right' : 'top left', ...style }}>
            {header}
            {items.map((item) => (
              <div key={item.label} role="menuitem" onClick={(e) => { e.stopPropagation(); item.onClick() }}
                style={{ height: 48, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {item.leading && <Icon name={item.leading} size={24} color={C.muted} />}
                <span style={{ flex: 1, color: C.ink, fontSize: 14, lineHeight: '20px', fontWeight: 500, letterSpacing: 0.1, paddingRight: 8 }}>{item.label}</span>
                {item.trailing}
              </div>
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/** OutlinedTextField with a leading icon and a clear button (the sections' search). */
export function SearchField({ value, onChange, placeholder, radius = 22, onSubmit, autoFocus, style, inputRef }: {
  value: string; onChange: (v: string) => void; placeholder: string; radius?: number; onSubmit?: () => void; autoFocus?: boolean; style?: CSSProperties; inputRef?: Ref<HTMLInputElement>
}) {
  const [focus, setFocus] = useState(false)
  return (
    <div style={{ height: 56, borderRadius: radius, border: `${focus ? 2 : 1}px solid ${focus ? C.primary : '#4B505E'}`, display: 'flex', alignItems: 'center', padding: focus ? '0 3px 0 11px' : '0 4px 0 12px', ...style }}>
      <Icon name="search" size={24} color={C.muted} />
      <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} enterKeyHint="search"
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit?.(); (e.target as HTMLInputElement).blur() } }}
        className="field" style={{ flex: 1, margin: '0 12px', fontSize: 16, lineHeight: '24px' }} />
      {value && <IconButton icon="close" label="Cancella ricerca" onClick={() => onChange('')} />}
    </div>
  )
}
