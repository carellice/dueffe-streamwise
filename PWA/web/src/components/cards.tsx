import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { formatDate, isDate } from '../../../shared/dates.ts'
import { isSeries, type LibraryEntry, type Media } from '../../../shared/model.ts'
import { open } from '../lib/nav.ts'
import { library, useData } from '../lib/store.ts'
import { openActions, openMedia, rating } from '../lib/ui.ts'
import type { IconName } from '../lib/icons.gen.ts'
import { emphasized, fastOutSlowIn, spring, tween } from './motion.ts'
import { alpha, brand, C, Icon, LoadingSkeleton, MetaPill, Pressable, RemoteImage, Reveal, SectionHeader, Spinner } from './ui.tsx'

// The cards and rails of MainActivity.kt (PosterCard, MediaRail, SpotlightRail, FeaturedCarousel...).

export const posterUrl = (m: Media) => m.poster || m.backdrop

export function releaseLabel(media: Media): string {
  return isDate(media.releaseDate) ? 'Uscita: ' + formatDate(media.releaseDate, 'd MMM yyyy') : 'Data da confermare'
}

/** Opens the detail growing out of the artwork element [el]. */
export function openFrom(media: Media, el: HTMLElement | null, url: string, corner: number) {
  openMedia(media, { rect: el?.getBoundingClientRect() ?? null, url, corner })
}

// --- reactions and badges ------------------------------------------------------------------

export function ReactionIcon({ liked, size = 24 }: { liked: boolean; size?: number }) {
  return <Icon name="thumb_up" size={size} color={liked ? C.like : C.dislike} style={{ transform: liked ? undefined : 'rotate(180deg)' }} />
}

export function ReactionBadge({ liked, style }: { liked: boolean; style?: CSSProperties }) {
  return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(21,25,27,.933)', border: `1px solid ${alpha(liked ? C.like : C.dislike, 0.65)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      <ReactionIcon liked={liked} size={19} />
    </div>
  )
}

/** PosterStatusBadges: reaction top-right, pin bottom-left, library state top- or bottom-right. */
export function PosterStatusBadges({ entry }: { entry: LibraryEntry | undefined }) {
  const liked = entry?.liked ?? null
  const state = entry?.state
  return (
    <>
      {liked != null && <ReactionBadge liked={liked} style={{ position: 'absolute', top: 8, right: 8 }} />}
      {entry?.pinned && (
        <div style={{ position: 'absolute', left: 8, bottom: 8, width: 34, height: 34, borderRadius: '50%', background: C.red, padding: 8 }}>
          <Icon name="push_pin" size={18} color="#fff" />
        </div>
      )}
      {(state === 'saved' || state === 'progress' || state === 'watched') && (
        <div style={{ position: 'absolute', right: 8, ...(liked == null ? { top: 8 } : { bottom: 8 }), width: 34, height: 34, borderRadius: '50%', background: 'rgba(26,27,33,.902)', padding: 8 }}>
          <Icon name={state === 'watched' ? 'check' : 'play'} size={18} color={C.accent} />
        </div>
      )}
    </>
  )
}

// --- PosterCard ---------------------------------------------------------------------------

const POSTER = 136
const RANK_INSET = 82
const RANK_SLOT = RANK_INSET + 10

/** The ranked numerals all share one size, chosen so the widest ("10") fits the slot. */
function useRankScale(): number {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const canvas = document.createElement('canvas').getContext('2d')
    if (!canvas) return
    canvas.font = '900 124px Roboto'
    // Letter spacing -14sp applies after each glyph.
    const width = canvas.measureText('10').width - 14 * 2
    setScale(width > RANK_SLOT ? RANK_SLOT / width : 1)
  }, [])
  return scale
}

export function PosterCard({ media, entry, rank, progress = false, footerOverride, releaseDates = false, onLongPress, onOpen, style }: {
  media: Media; entry: LibraryEntry | undefined; rank?: number | null; progress?: boolean; footerOverride?: string | null; releaseDates?: boolean
  onLongPress?: () => void; onOpen?: () => void; style?: CSSProperties
}) {
  const art = useRef<HTMLDivElement>(null)
  const scale = useRankScale()
  const url = posterUrl(media)
  const footer = progress && entry ? `S${entry.nextSeason} · E${entry.nextEpisode}` : `${media.year} · ${isSeries(media) ? 'Serie TV' : 'Film'}`
  return (
    <Pressable style={{ width: rank != null ? POSTER + RANK_INSET : POSTER, flex: 'none', ...style }}
      onClick={() => (onOpen ? onOpen() : openFrom(media, art.current, url, 18))}
      onLongPress={onLongPress ?? (() => openActions(media))}>
      <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
        {rank != null && (
          <div style={{ position: 'absolute', left: 0, bottom: 0, width: RANK_SLOT, textAlign: 'right', transform: `translateY(${14 * scale}px)`, fontSize: 124 * scale, lineHeight: 1.17, fontWeight: 900, letterSpacing: (rank >= 10 ? -14 : -6) * scale, whiteSpace: 'nowrap', background: `linear-gradient(180deg, rgba(255,255,255,.92), ${alpha(C.accent, 0.35)}, transparent)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', pointerEvents: 'none' }}>
            {rank}
          </div>
        )}
        <div style={{ width: POSTER, position: 'relative' }}>
          <div ref={art} style={{ width: '100%', aspectRatio: '0.68', borderRadius: 18, overflow: 'hidden' }}>
            <RemoteImage url={url} style={{ width: '100%', height: '100%' }} />
          </div>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 18, border: '1px solid rgba(255,255,255,.07)', pointerEvents: 'none' }} />
          {media.rating > 0 && <MetaPill text={rating(media.rating)} icon="star" tint={C.amber} style={{ position: 'absolute', top: 7, left: 7 }} />}
          <PosterStatusBadges entry={entry} />
        </div>
      </div>
      <div className="ellipsis" style={{ color: C.ink, fontWeight: 700, fontSize: 14, marginTop: 9, paddingLeft: rank != null ? RANK_INSET : 2, lineHeight: '24px' }}>{media.title}</div>
      <div className="ellipsis" style={{ color: progress || footerOverride != null ? C.accent : C.muted, fontSize: 12, marginTop: 2, paddingLeft: rank != null ? RANK_INSET : 2, lineHeight: '24px' }}>
        {footerOverride ?? (releaseDates ? releaseLabel(media) : footer)}
      </div>
    </Pressable>
  )
}

/** LoadMoreTile: the "Carica altri" card at the end of a rail. */
export function LoadMoreTile({ onClick, loading, accent = C.accent }: { onClick: () => void; loading: boolean; accent?: string }) {
  return (
    <Pressable onClick={() => { if (!loading) onClick() }} className="glass"
      style={{ width: 136, aspectRatio: '0.68', borderRadius: 18, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' }}>
      {loading ? <Spinner size={28} color={accent} stroke={3} /> : (
        <>
          <div className="brand-glow" style={{ width: 50, height: 50, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', ['--glow-blur' as string]: '8px' }}>
            <Icon name="add" size={24} color="#fff" />
          </div>
          <div style={{ color: C.ink, fontWeight: 700, fontSize: 13, marginTop: 10 }}>Carica altri</div>
        </>
      )}
    </Pressable>
  )
}

/** A horizontally scrolling row with the native content padding and spacing. */
export function Row({ children, gap = 12, padding = 20, style }: { children: ReactNode; gap?: number; padding?: number; style?: CSSProperties }) {
  return (
    <div className="hscroll" style={{ gap, padding: `0 ${padding}px`, scrollPaddingLeft: padding, ...style }}>
      {children}
      <div style={{ flex: 'none', width: Math.max(0, padding - gap) }} />
    </div>
  )
}

export function MediaRail({ title, media, ranked = false, progress = false, loadMore, loadingMore = false, onSeeAll, footerFor, eyebrow, releaseDates = false, onLongPress, header }: {
  title: string; media: Media[]; ranked?: boolean; progress?: boolean; loadMore?: (() => void) | null; loadingMore?: boolean
  onSeeAll?: ((rect: DOMRect | null) => void) | null; footerFor?: (m: Media) => string | null | undefined; eyebrow?: string | null
  releaseDates?: boolean; onLongPress?: (m: Media) => void; header?: ReactNode
}) {
  const { library } = useData()
  if (!media.length && !header) return null
  return (
    <Reveal>
      <SectionHeader title={title} eyebrow={eyebrow} onAction={onSeeAll} />
      {header}
      <Row gap={ranked ? 6 : 12} style={{ marginTop: 12 }}>
        {media.map((item, i) => (
          <PosterCard key={item.id} media={item} entry={library.get(item.id)} rank={ranked ? i + 1 : null} progress={progress}
            footerOverride={footerFor?.(item) ?? null} releaseDates={releaseDates} onLongPress={onLongPress ? () => onLongPress(item) : undefined} />
        ))}
        {loadMore && <LoadMoreTile onClick={loadMore} loading={loadingMore} />}
      </Row>
    </Reveal>
  )
}

export function RailSkeleton({ title }: { title: string | null }) {
  return (
    <div>
      {title != null ? <SectionHeader title={title} /> : <LoadingSkeleton style={{ margin: '0 20px', width: 160, height: 20, borderRadius: 8 }} />}
      <div style={{ display: 'flex', gap: 12, marginTop: 12, padding: '0 20px' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 136, flex: 'none' }}>
            <LoadingSkeleton style={{ width: '100%', aspectRatio: '0.68', borderRadius: 18 }} />
            <LoadingSkeleton style={{ marginTop: 10, width: '80%', height: 12, borderRadius: 6 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// --- SpotlightRail and its variants ---------------------------------------------------------

export function SpotlightRail({ eyebrow, title, subtitle, icon, accent, background, media, onSeeAll, onLoadMore, loadingMore }: {
  eyebrow: string; title: string; subtitle: string; icon: ReactNode; accent: string; background: string; media: Media[]
  onSeeAll: (rect: DOMRect | null) => void; onLoadMore: (() => void) | null; loadingMore: boolean
}) {
  const { library } = useData()
  return (
    <Reveal style={{ padding: '0 12px' }}>
      <div style={{ position: 'relative', borderRadius: 30, background, padding: '18px 0', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 30, padding: 1, background: `linear-gradient(180deg, ${alpha(accent, 0.55)}, ${alpha(accent, 0.08)})`, WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px 0 16px' }}>
          {icon}
          <div style={{ marginLeft: 12, flex: 1, minWidth: 0 }}>
            <div style={{ color: accent, fontSize: 10, fontWeight: 900, letterSpacing: 1.3, lineHeight: '24px' }}>{eyebrow}</div>
            <div className="t-title-large" style={{ color: C.ink }}>{title}</div>
          </div>
          <SectionHeader title="" action="Tutti" onAction={onSeeAll} style={{ width: 110 }} />
        </div>
        <div style={{ color: C.muted, fontSize: 14, padding: '8px 16px' }}>{subtitle}</div>
        <Row padding={16} style={{ marginTop: 4 }}>
          {media.map((item) => <PosterCard key={item.id} media={item} entry={library.get(item.id)} />)}
          {onLoadMore && <LoadMoreTile onClick={onLoadMore} loading={loadingMore} accent={accent} />}
        </Row>
      </div>
    </Reveal>
  )
}

export type Holiday = { id: 'halloween' | 'christmas'; title: string; eyebrow: string; subtitle: string; emoji: string; accent: string; background: string }

const HALLOWEEN: Holiday = { id: 'halloween', title: 'Speciale Halloween', eyebrow: 'BRIVIDI DI STAGIONE', subtitle: 'Streghe, zucche e notti da paura: film e serie a tema.', emoji: '🎃', accent: '#FF8A1E', background: 'linear-gradient(135deg, #2B1608, #15111C, #1E0F1F)' }
const CHRISTMAS: Holiday = { id: 'christmas', title: 'Speciale Natale', eyebrow: 'ATMOSFERA NATALIZIA', subtitle: 'Film e serie da guardare sotto l’albero.', emoji: '🎄', accent: '#3DDC84', background: 'linear-gradient(135deg, #0F2A1C, #15131A, #2A0F14)' }

/** Seasonal sections: Halloween for all of October, Christmas from mid November to Epiphany. */
export function currentHoliday(today: string): Holiday | null {
  const month = Number(today.slice(5, 7)), day = Number(today.slice(8, 10))
  if (month === 10) return HALLOWEEN
  if (month === 11 && day >= 15) return CHRISTMAS
  if (month === 12) return CHRISTMAS
  if (month === 1 && day <= 6) return CHRISTMAS
  return null
}

export function HolidayRail({ holiday, ...rest }: { holiday: Holiday; media: Media[]; onSeeAll: (rect: DOMRect | null) => void; onLoadMore: (() => void) | null; loadingMore: boolean }) {
  return (
    <SpotlightRail eyebrow={holiday.eyebrow} title={holiday.title} subtitle={holiday.subtitle} accent={holiday.accent} background={holiday.background}
      icon={
        <motion.div animate={{ y: [-4, 4], rotate: [-6, 6] }} transition={{ duration: 1.4, ease: fastOutSlowIn, repeat: Infinity, repeatType: 'reverse' }}
          style={{ width: 44, height: 44, borderRadius: '50%', background: alpha(holiday.accent, 0.18), border: `1px solid ${alpha(holiday.accent, 0.55)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flex: 'none' }}>
          {holiday.emoji}
        </motion.div>
      } {...rest} />
  )
}

export function DiscoveryRail(props: { media: Media[]; onSeeAll: (rect: DOMRect | null) => void; onLoadMore: () => void; loadingMore: boolean }) {
  return (
    <SpotlightRail eyebrow="SCELTI PER SORPRENDERTI" title="Capolavori da scoprire" subtitle="Titoli molto apprezzati, anche fuori dai soliti riflettori." accent={C.coral}
      background="linear-gradient(135deg, #2A1216, #15131A, #1C1014)"
      icon={<div className="brand-glow" style={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', ['--glow-blur' as string]: '8px' }}><Icon name="sparkles" size={22} color="#fff" /></div>}
      {...props} />
  )
}

export function TasteRail({ hasMore, onLoadMore, ...props }: { media: Media[]; onSeeAll: (rect: DOMRect | null) => void; onLoadMore: () => void; loadingMore: boolean; hasMore: boolean }) {
  return (
    <SpotlightRail eyebrow="IN BASE AI TUOI MI PIACE" title="Consigliati per te" subtitle="Storie affini ai titoli che hai apprezzato." accent={C.like}
      background="linear-gradient(135deg, #10241D, #13161C, #0F1D19)" onLoadMore={hasMore ? onLoadMore : null}
      icon={<div style={{ width: 44, height: 44, borderRadius: '50%', background: alpha(C.like, 0.16), border: `1px solid ${alpha(C.like, 0.5)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><ReactionIcon liked size={22} /></div>}
      {...props} />
  )
}

// --- Home cards ---------------------------------------------------------------------------

export function ContinueCard({ entry }: { entry: LibraryEntry }) {
  const media = entry.media
  const art = useRef<HTMLDivElement>(null)
  const url = media.backdrop || media.poster
  const label = isSeries(media) ? `Prossimo · S${entry.nextSeason} E${entry.nextEpisode}` : 'Film · da finire'
  return (
    <Pressable style={{ width: 284, aspectRatio: `${16 / 9.5}`, position: 'relative', flex: 'none' }}
      onClick={() => openFrom(media, art.current, url, 22)} onLongPress={() => openActions(media)}>
      <div ref={art} style={{ position: 'absolute', inset: 0, borderRadius: 22, overflow: 'hidden' }}><RemoteImage url={url} style={{ width: '100%', height: '100%' }} /></div>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 22, background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,.15) 45%, rgba(0,0,0,.9) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: 22, border: '1px solid rgba(255,255,255,.08)' }} />
      {entry.pinned && (
        <div style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%', background: brand, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="push_pin" size={16} color="#fff" />
        </div>
      )}
      <div style={{ position: 'absolute', left: 12, bottom: 12, right: 12, display: 'flex', alignItems: 'center' }}>
        <div className="brand-glow" style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', ['--glow-blur' as string]: '8px' }}>
          <Icon name="play" size={20} color="#fff" />
        </div>
        <div style={{ marginLeft: 11, minWidth: 0 }}>
          <div className="ellipsis" style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>{media.title}</div>
          <div className="ellipsis" style={{ color: 'rgba(255,255,255,.78)', fontSize: 12, fontWeight: 600 }}>{label}</div>
        </div>
      </div>
    </Pressable>
  )
}

/** Look of the "Chiedi all'IA" card; also drawn by the page transition that grows out of it. */
export function AiCardArt({ title = "Chiedi all'IA", subtitle = 'Dimmi cosa ti va: ti consiglio titoli su misura dei tuoi gusti', icon = 'sparkles', style }: { title?: string; subtitle?: string; icon?: IconName; style?: CSSProperties }) {
  return (
    <div style={{ position: 'relative', borderRadius: 26, background: 'linear-gradient(135deg, #26123F, #1A1426, #3A0F1E)', padding: 16, display: 'flex', alignItems: 'center', overflow: 'hidden', ...style }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 26, padding: 1, background: `linear-gradient(135deg, ${alpha(C.violet, 0.55)}, ${alpha(C.red, 0.35)})`, WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none' }} />
      <div style={{ width: 46, height: 46, borderRadius: '50%', background: `linear-gradient(135deg, ${C.violet}, ${C.red})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Icon name={icon} size={23} color="#fff" />
      </div>
      <div style={{ flex: 1, padding: '0 14px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>{title}</span>
          <span style={{ marginLeft: 8, borderRadius: 20, background: alpha(C.violet, 0.22), padding: '2px 7px', color: C.violet, fontSize: 9, fontWeight: 900, letterSpacing: 1, lineHeight: '13px' }}>NUOVO</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, lineHeight: '17px', marginTop: 2 }}>{subtitle}</div>
      </div>
      <Icon name="chevron_right" color="rgba(255,255,255,.7)" />
    </div>
  )
}

export const FIND_TITLE = 'Ritrova un titolo'
export const FIND_TITLE_SUBTITLE = 'Non ricordi il nome? Rispondi a qualche domanda e lo cerco io'

export function AiAskCard({ find = false }: { find?: boolean }) {
  return (
    <Pressable pressed={0.97} onClick={(rect) => open(find ? { kind: 'findTitle' } : { kind: 'ai' }, { rect, corner: 26, art: find ? 'find' : 'ai' })}>
      {find ? <AiCardArt title={FIND_TITLE} subtitle={FIND_TITLE_SUBTITLE} icon="search" /> : <AiCardArt />}
    </Pressable>
  )
}

/** The advisor cards: "Sorprendimi" breathes with a wiggling icon and a light sweep. */
export function AdvisorCard({ title, subtitle, icon, primary, onClick }: { title: string; subtitle: string; icon: IconName; primary: boolean; onClick: () => void }) {
  return (
    <Pressable pressed={0.96} onClick={() => onClick()} className={primary ? 'brand-glow light-sweep' : 'glass'}
      style={{ flex: 1, borderRadius: 26, padding: 18, ['--glow-blur' as string]: '14px', minWidth: 0 }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: `rgba(255,255,255,${primary ? 0.22 : 0.08})`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <motion.div animate={primary ? { rotate: [-10, 10] } : undefined} transition={{ duration: 1.8, ease: fastOutSlowIn, repeat: Infinity, repeatType: 'reverse' }}>
          <Icon name={icon} size={22} color={primary ? '#fff' : C.accent} />
        </motion.div>
      </div>
      <div style={{ color: '#fff', fontWeight: 800, fontSize: 18, marginTop: 14, position: 'relative' }}>{title}</div>
      <div style={{ color: `rgba(255,255,255,${primary ? 0.86 : 0.6})`, fontSize: 13, lineHeight: '17px', marginTop: 3, position: 'relative' }}>{subtitle}</div>
    </Pressable>
  )
}

export function SagaCollectionCard({ id, name, movies, style }: { id: number; name: string; movies: Media[]; style?: CSSProperties }) {
  const cover = movies[0]
  return (
    <Pressable pressed={0.95} onClick={(rect) => open({ kind: 'saga', id, name, movies }, { rect, corner: 22, url: cover ? posterUrl(cover) : undefined })}
      style={{ width: 148, borderRadius: 22, background: C.raised, overflow: 'hidden', position: 'relative', aspectRatio: '0.68', ...style }}>
      {cover && <RemoteImage url={posterUrl(cover)} style={{ position: 'absolute', inset: 0 }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent, rgba(0,0,0,.82))' }} />
      <div style={{ position: 'absolute', top: 9, right: 9, background: C.red, borderRadius: 12, padding: '5px 8px', color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: '13px' }}>{movies.length} film</div>
      <div className="clamp3" style={{ position: 'absolute', left: 12, right: 12, bottom: 12, color: '#fff', fontSize: 15, fontWeight: 900, lineHeight: '20px' }}>{name || 'Saga'}</div>
    </Pressable>
  )
}

// --- FeaturedCarousel ---------------------------------------------------------------------

const heroSpring = spring(0.7, 400)

/** "In evidenza": an endless pager that moves on by itself every 6.5 s (900 ms, Emphasized). */
export function FeaturedCarousel({ media, type, paused }: { media: Media[]; type: string; paused: boolean }) {
  const track = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [page, setPage] = useState(0)
  const x = useMotionValue(0)
  const dragging = useRef(false)
  const pageWidth = width - 40 + 12
  const count = media.length

  useEffect(() => {
    const el = track.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const go = (target: number, ms = 900) => {
    setPage(target)
    void animate(x, -target * pageWidth, ms === 0 ? { duration: 0 } : { duration: ms / 1000, ease: emphasized })
  }

  useEffect(() => { x.set(-page * pageWidth) }, [pageWidth])

  useEffect(() => {
    if (paused || count <= 1) return
    const id = window.setTimeout(() => { if (!dragging.current) go(page + 1) }, 6500)
    return () => window.clearTimeout(id)
  }, [page, paused, count, pageWidth])

  const offset = useTransform(x, (v) => (pageWidth ? -v / pageWidth : 0))
  const pages = count > 1 ? [page - 1, page, page + 1, page + 2] : [0]
  const current = ((page % count) + count) % count

  return (
    <div>
      <div ref={track} style={{ height: 500, position: 'relative', overflow: 'hidden', touchAction: 'pan-y' }}>
        <motion.div style={{ x, position: 'absolute', inset: 0 }}
          drag={count > 1 ? 'x' : false} dragMomentum={false} dragElastic={0.04}
          onDragStart={() => { dragging.current = true }}
          onDragEnd={(_, info) => {
            dragging.current = false
            const raw = -x.get() / pageWidth
            let target = Math.round(raw)
            if (Math.abs(info.velocity.x) > 300) target = info.velocity.x < 0 ? Math.floor(raw) + 1 : Math.ceil(raw) - 1
            void animate(x, -target * pageWidth, heroSpring)
            setPage(target)
          }}>
          {pages.map((p) => {
            const item = media[((p % count) + count) % count]
            return (
              <div key={p} style={{ position: 'absolute', top: 0, left: 20 + p * pageWidth, width: width - 40, height: 500 }}>
                <HeroFeature media={item} type={type} offset={offset} page={p} />
              </div>
            )
          })}
        </motion.div>
      </div>
      {count > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 4 }}>
          {media.map((m, i) => (
            <motion.div key={m.id} initial={false} animate={{ width: i === current ? 24 : 6 }} transition={heroSpring}
              style={{ margin: '0 3px', height: 6, borderRadius: 6, background: i === current ? brand : alpha(C.muted, 0.35) }} />
          ))}
        </div>
      )}
    </div>
  )
}

function HeroFeature({ media, type, offset, page }: { media: Media; type: string; offset: MotionValue<number>; page: number }) {
  const data = useData()
  const state = data.library.get(media.id)?.state
  const inList = state === 'saved' || state === 'progress' || state === 'watched'
  const card = useRef<HTMLDivElement>(null)
  const delta = useTransform(offset, (o) => o - page)
  const scale = useTransform(delta, (d) => 1 - 0.08 * Math.min(1, Math.abs(d)))
  return (
    <motion.div ref={card} style={{ width: '100%', height: '100%', scale, borderRadius: 30, boxShadow: '0 9px 18px rgba(0,0,0,.5)' }}
      onClick={() => openMedia(media, { rect: card.current?.getBoundingClientRect() ?? null, corner: 30, url: media.backdrop || media.poster })}>
      <HeroCardArt media={media} type={type} saved={inList} delta={delta}
        onDetails={() => openMedia(media, { rect: card.current?.getBoundingClientRect() ?? null, corner: 30, url: media.backdrop || media.poster })} />
    </motion.div>
  )
}

/** Visual content of a carousel card. */
function HeroCardArt({ media, type, saved, delta, onDetails }: { media: Media; type: string; saved: boolean; delta: MotionValue<number>; onDetails: () => void }) {
  const imageX = useTransform(delta, (d) => `${d * 30}%`)
  const textX = useTransform(delta, (d) => `${d * 35}%`)
  const textOpacity = useTransform(delta, (d) => Math.min(1, Math.max(0, 1 - Math.abs(d) * 1.4)))
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 30, overflow: 'hidden', cursor: 'pointer' }}>
      <motion.div style={{ position: 'absolute', inset: 0, x: imageX }}>
        <motion.div style={{ position: 'absolute', inset: 0 }} animate={{ scale: [1, 1.06] }} transition={{ duration: 16, ease: 'linear', repeat: Infinity, repeatType: 'reverse' }}>
          <RemoteImage url={media.backdrop || media.poster} style={{ position: 'absolute', inset: 0 }} />
        </motion.div>
      </motion.div>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 0%, transparent 40%, rgba(0,0,0,.55) 68%, rgba(0,0,0,.94) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: 30, padding: 1, background: 'linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,.03))', WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none' }} />
      <motion.div style={{ position: 'absolute', left: 18, right: 18, bottom: 18, x: textX, opacity: textOpacity }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ borderRadius: 20, background: brand, padding: '4px 10px', color: '#fff', fontWeight: 900, letterSpacing: 1.4, fontSize: 10, lineHeight: '13px' }}>IN EVIDENZA</span>
          <span style={{ color: 'rgba(255,255,255,.75)', fontWeight: 700, fontSize: 12, marginLeft: 10 }}>{type === 'tv' ? 'Serie TV' : 'Film'}</span>
        </div>
        <div className="t-display-small clamp2" style={{ color: '#fff', marginTop: 10 }}>{media.title}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10 }}>
          {media.rating > 0 && <MetaPill text={rating(media.rating)} icon="star" tint={C.amber} background="rgba(255,255,255,.12)" />}
          <MetaPill text={media.year} background="rgba(255,255,255,.12)" />
          <span className="ellipsis" style={{ color: 'rgba(255,255,255,.75)', fontSize: 13 }}>{media.genres.slice(0, 2).join(' · ')}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, height: 54 }}>
          <Pressable pressed={0.97} onClick={() => onDetails()} className="brand-glow"
            style={{ flex: 1, borderRadius: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px', ['--glow-blur' as string]: '10px' }}>
            <Icon name="play" size={20} color="#fff" />
            <span style={{ marginLeft: 7, color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: 0.1 }}>Scopri di più</span>
          </Pressable>
          <HeroListButton media={media} saved={saved} />
        </div>
      </motion.div>
    </div>
  )
}

function HeroListButton({ media, saved }: { media: Media; saved: boolean }) {
  const [on, setOn] = useState(saved)
  useEffect(() => setOn(saved), [saved])
  return (
    <Pressable pressed={0.97} className="glass"
      onClick={() => {
        const next = !on
        setOn(next)
        void (next ? library.save(media) : library.remove(media))
      }}
      style={{ ['--glass-alpha' as string]: on ? 0.5 : 0.7, flex: 1, borderRadius: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px', color: on ? C.like : '#fff', overflow: 'hidden' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={on ? 'in' : 'out'} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1, transition: { opacity: tween(200), scale: spring(0.5, 500) } }} exit={{ opacity: 0, transition: tween(100) }}
          style={{ display: 'flex', alignItems: 'center' }}>
          <Icon name={on ? 'check' : 'add'} size={20} />
          <span className="ellipsis" style={{ marginLeft: 7, fontSize: 14, fontWeight: 700, letterSpacing: 0.1 }}>{on ? 'In lista' : 'La mia lista'}</span>
        </motion.div>
      </AnimatePresence>
    </Pressable>
  )
}
