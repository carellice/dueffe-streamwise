// Mouse arrows for every horizontal row (.hscroll): with a mouse there is no swipe, so the row under
// the pointer gets a left and a right button that scroll it by most of its width.
import { useEffect, useState, type CSSProperties } from 'react'
import { Icon } from './ui.tsx'

export function HScrollArrows() {
  const [row, setRow] = useState<HTMLElement | null>(null)
  const [, redraw] = useState(0)
  useEffect(() => {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const target = e.target as Element
      if (target.closest?.('.hscroll-arrow')) return
      const el = target.closest?.('.hscroll') as HTMLElement | null
      setRow(el && el.scrollWidth > el.clientWidth + 1 ? el : null)
    }
    const leave = (e: PointerEvent) => { if (!e.relatedTarget) setRow(null) }
    const update = () => redraw((n) => n + 1)
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerout', leave)
    document.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerout', leave)
      document.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [])
  if (!row?.isConnected) return null
  const r = row.getBoundingClientRect()
  const top = r.top + r.height / 2 - 20
  const canBack = row.scrollLeft > 1
  const canForward = row.scrollLeft + row.clientWidth < row.scrollWidth - 1
  const by = (dir: number) => row.scrollBy({ left: dir * row.clientWidth * 0.8, behavior: 'smooth' })
  return (
    <>
      {canBack && <ArrowButton left={r.left + 6} top={top} back onClick={() => by(-1)} />}
      {canForward && <ArrowButton left={r.right - 46} top={top} onClick={() => by(1)} />}
    </>
  )
}

export function ArrowButton({ left, top, back, onClick, style }: { left?: number; top?: number; back?: boolean; onClick: () => void; style?: CSSProperties }) {
  return (
    <button type="button" className="hscroll-arrow center hoverable" aria-label={back ? 'Indietro' : 'Avanti'}
      onClick={(e) => { e.stopPropagation(); onClick() }} onPointerDown={(e) => e.stopPropagation()}
      style={{ left, top, ...style }}>
      <Icon name="chevronRight" size={26} style={back ? { transform: 'rotate(180deg)' } : undefined} />
    </button>
  )
}
