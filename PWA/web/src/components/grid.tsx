// SearchPosterCard and the LazyVerticalGrid(GridCells.Adaptive(104.dp)) grids it fills.
import { useEffect, useRef, type CSSProperties } from 'react'
import type { Media } from '../../../shared/model.ts'
import { isSeries } from '../../../shared/model.ts'
import { entryOf } from '../lib/store.ts'
import { ArtworkImage, PosterStatusBadges, artSource, posterUrl, releaseLabel, type OpenMedia } from './cards.tsx'
import { MetaPill, Press, Reveal, Spinner, rating } from './ui.tsx'

export function SearchPosterCard({ media, onOpen, onLongPress, releaseDates = false }: { media: Media; onOpen: OpenMedia; onLongPress?: (m: Media) => void; releaseDates?: boolean }) {
  const entry = entryOf(media)
  const art = useRef<HTMLDivElement | null>(null)
  return (
    <div className="col" style={{ width: '100%', minWidth: 0 }}>
      <Press style={{ position: 'relative', width: '100%', aspectRatio: '0.68' }}
        onClick={() => onOpen(media, artSource(art.current, posterUrl(media), 18))}
        onLongPress={onLongPress ? () => onLongPress(media) : undefined}>
        <ArtworkImage media={media} corner={18} style={{ position: 'absolute', inset: 0 }} onEl={(el) => { art.current = el }} />
        <div className="fill" style={{ borderRadius: 18, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.07)', pointerEvents: 'none' }} />
        {media.rating > 0 && <MetaPill text={rating(media.rating)} icon="star" tint="var(--amber)" style={{ position: 'absolute', top: 7, left: 7 }} />}
        <PosterStatusBadges liked={entry?.liked} pinned={entry?.pinned === true} state={entry?.state} />
      </Press>
      <span className="ellipsis" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 14, marginTop: 8, padding: '0 2px' }}>{media.title}</span>
      <span className="ellipsis" style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2, paddingLeft: 2 }}>
        {releaseDates ? releaseLabel(media) : `${media.year} · ${isSeries(media) ? 'Serie TV' : 'Film'}`}
      </span>
    </div>
  )
}

/** Adaptive grid of posters (min 104 dp per column); [onEnd] fires near the end, like the native atEnd check. */
export function PosterGrid({ media, onOpen, onLongPress, onEnd, loadingMore = false, padding = '4px 20px 132px', columns, header, footer, revealPrefix, releaseDates, style, rowGap = 16, columnGap = 12 }: {
  media: Media[]; onOpen: OpenMedia; onLongPress?: (m: Media) => void; onEnd?: () => void; loadingMore?: boolean; padding?: string
  columns?: number; header?: React.ReactNode; footer?: React.ReactNode; revealPrefix?: string; releaseDates?: boolean; style?: CSSProperties; rowGap?: number; columnGap?: number
}) {
  const sentinel = useRef<HTMLDivElement>(null)
  const end = useRef(onEnd)
  end.current = onEnd
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const observer = new IntersectionObserver((items) => { if (items.some((i) => i.isIntersecting)) end.current?.() }, { rootMargin: '600px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [media.length])
  return (
    <div className="scroll" style={{ flex: 1, minHeight: 0, ...style }}>
      <div style={{ padding }}>
        {header}
        <div style={{ display: 'grid', gridTemplateColumns: columns ? `repeat(${columns}, minmax(0, 1fr))` : 'repeat(auto-fill, minmax(var(--poster-min, 104px), 1fr))', columnGap, rowGap }}>
          {media.map((m, index) => (
            <Reveal key={m.id} id={revealPrefix ? `${revealPrefix}:${m.id}` : undefined} delay={(index % 12) * 40} distance={24}>
              <SearchPosterCard media={m} onOpen={onOpen} onLongPress={onLongPress} releaseDates={releaseDates} />
            </Reveal>
          ))}
        </div>
        {footer}
        {loadingMore && <div className="center" style={{ padding: 12 }}><Spinner size={26} color="var(--accent)" stroke={2.5} /></div>}
        <div ref={sentinel} style={{ height: 1 }} />
      </div>
    </div>
  )
}
