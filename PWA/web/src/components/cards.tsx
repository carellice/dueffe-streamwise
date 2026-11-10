// Cards and rails of MainActivity.kt: PosterCard, MediaRail, ContinueCard, the spotlight rails,
// the featured carousel and the small home cards.
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { LibraryEntry, Media } from '../../../shared/model.ts'
import { isSeries } from '../../../shared/model.ts'
import { formatIt } from '../../../shared/dates.ts'
import { entryOf } from '../lib/store.ts'
import type { IconName } from '../lib/icons.gen.ts'
import { emphasized, fastOutSlowIn, spring, tween } from './motion.ts'
import { ArrowButton } from './hscroll.tsx'
import { Icon, LoadingSkeleton, MetaPill, Press, PulsingDot, RemoteImage, SectionHeader, LightSweep, Reveal, Spinner, boundsOf, rating, type Rect } from './ui.tsx'

/** What a tapped artwork looks like on screen, so a page can grow out of exactly that image. */
export type ArtSource = { rect: Rect | null; url: string; corner: number; el?: HTMLElement | null; overlay?: ReactNode }
export type OpenMedia = (media: Media, source?: ArtSource | null) => void

export function artSource(el: HTMLElement | null, url: string, corner: number, overlay?: ReactNode): ArtSource {
  return { rect: boundsOf(el), url, corner, el, overlay }
}

export const posterUrl = (m: Media) => m.poster || m.backdrop

export function ReactionIcon({ liked, size = 24 }: { liked: boolean; size?: number }) {
  return <Icon name="thumbUp" size={size} color={liked ? 'var(--like)' : 'var(--dislike)'} style={{ transform: liked ? undefined : 'rotate(180deg)' }} />
}

export function ReactionBadge({ liked, style }: { liked: boolean; style?: CSSProperties }) {
  return (
    <div className="center" style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(21,25,27,.933)', boxShadow: `inset 0 0 0 1px ${liked ? 'rgba(61,220,151,.65)' : 'rgba(255,92,122,.65)'}`, ...style }}>
      <ReactionIcon liked={liked} size={19} />
    </div>
  )
}

/** Like/dislike, pinned and library-state badges on a poster. */
export function PosterStatusBadges({ liked, pinned, state }: { liked: boolean | null | undefined; pinned: boolean; state: string | null | undefined }) {
  const listed = state === 'saved' || state === 'progress' || state === 'watched'
  return (
    <>
      {liked != null && <ReactionBadge liked={liked} style={{ position: 'absolute', top: 8, right: 8 }} />}
      {pinned && (
        <div className="center" style={{ position: 'absolute', left: 8, bottom: 8, width: 34, height: 34, borderRadius: '50%', background: 'var(--red)' }}>
          <Icon name="pushPin" size={18} color="#fff" />
        </div>
      )}
      {listed && (
        <div className="center" style={{ position: 'absolute', right: 8, ...(liked == null ? { top: 8 } : { bottom: 8 }), width: 34, height: 34, borderRadius: '50%', background: 'rgba(26,27,33,.9)' }}>
          <Icon name={state === 'watched' ? 'check' : 'play'} size={18} color="var(--secondary)" />
        </div>
      )}
    </>
  )
}

/** "Uscita: 3 nov 2025" for the release rails. */
export function releaseLabel(media: Media): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(media.releaseDate) ? 'Uscita: ' + formatIt(media.releaseDate, 'd MMM yyyy') : 'Data da confermare'
}

/** Poster image that can be the source of a detail page. */
export function ArtworkImage({ media, url, corner, style, onEl }: { media: Media; url?: string; corner: number; style?: CSSProperties; onEl?: (el: HTMLDivElement | null) => void }) {
  return (
    <div ref={onEl} data-art={media.id} style={{ position: 'relative', borderRadius: corner, overflow: 'hidden', ...style }}>
      <RemoteImage url={url ?? posterUrl(media)} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}

export function PosterCard({ media, rank, progress = false, open, actions, onLongPress, releaseDates = false, footerOverride }: {
  media: Media; rank?: number | null; progress?: boolean; open: OpenMedia; actions: (m: Media) => void; onLongPress?: (m: Media) => void; releaseDates?: boolean; footerOverride?: string | null
}) {
  const entry = entryOf(media)
  const art = useRef<HTMLDivElement | null>(null)
  const rankInset = 82
  const posterWidth = 136
  const footer = progress && entry ? `S${entry.nextSeason} · E${entry.nextEpisode}` : `${media.year} · ${isSeries(media) ? 'Serie TV' : 'Film'}`
  return (
    <Press className="col" style={{ width: rank != null ? posterWidth + rankInset : posterWidth, flex: 'none' }}
      onClick={() => open(media, artSource(art.current, posterUrl(media), 18))}
      onLongPress={() => (onLongPress ?? actions)(media)}>
      <div style={{ position: 'relative', width: '100%' }}>
        {rank != null && <RankNumber rank={rank} slot={rankInset + 10} />}
        <div style={{ width: posterWidth, marginLeft: 'auto', position: 'relative', aspectRatio: '0.68' }}>
          <ArtworkImage media={media} corner={18} style={{ position: 'absolute', inset: 0 }} onEl={(el) => { art.current = el }} />
          <div className="fill" style={{ borderRadius: 18, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.07)', pointerEvents: 'none' }} />
          {media.rating > 0 && <MetaPill text={rating(media.rating)} icon="star" tint="var(--amber)" style={{ position: 'absolute', top: 7, left: 7 }} />}
          <PosterStatusBadges liked={entry?.liked} pinned={entry?.pinned === true} state={entry?.state} />
        </div>
      </div>
      <span className="ellipsis" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 14, marginTop: 9, paddingLeft: rank != null ? rankInset : 2 }}>{media.title}</span>
      <span className="ellipsis" style={{ color: progress || footerOverride != null ? 'var(--secondary)' : 'var(--muted)', fontSize: 12, marginTop: 2, paddingLeft: rank != null ? rankInset : 2 }}>
        {footerOverride ?? (releaseDates ? releaseLabel(media) : footer)}
      </span>
    </Press>
  )
}

/** The big outlined numeral of the ranked rails: all share one size, so the widest ("10") fits the slot. */
function RankNumber({ rank, slot }: { rank: number; slot: number }) {
  // Roboto Black "10" at 124 sp with -14 sp spacing is about 128 px wide: scaled to the 92 px slot.
  const scale = Math.min(1, slot / 128)
  const size = 124 * scale
  const spacing = (rank >= 10 ? -14 : -6) * scale
  return (
    <span style={{
      position: 'absolute', left: 0, bottom: -14 * scale, width: slot, textAlign: 'right', fontSize: size, fontWeight: 900, lineHeight: 1,
      letterSpacing: spacing, whiteSpace: 'nowrap', paddingRight: -spacing,
      background: 'linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,89,100,.35), transparent)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
    }}>{rank}</span>
  )
}

export function LoadMoreTile({ onClick, loading, accent = 'var(--accent)' }: { onClick: () => void; loading: boolean; accent?: string }) {
  return (
    <Press className="glass col center" disabled={loading} onClick={() => !loading && onClick()}
      style={{ width: 136, aspectRatio: '0.68', borderRadius: 18, flex: 'none', alignSelf: 'flex-start' }}>
      {loading ? <Spinner size={28} color={accent} stroke={3} /> : (
        <>
          <div className="brand-glow center" style={{ width: 50, height: 50, borderRadius: '50%', ['--glow' as string]: '8px' }}>
            <Icon name="add" size={24} color="#fff" />
          </div>
          <span style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 13, marginTop: 10 }}>Carica altri</span>
        </>
      )}
    </Press>
  )
}

export type RailProps = {
  title: string
  media: Media[]
  onOpen: OpenMedia
  onAction: (m: Media) => void
  ranked?: boolean
  progress?: boolean
  loadMore?: (() => void) | null
  loadingMore?: boolean
  onSeeAll?: ((rect: Rect | null) => void) | null
  spacious?: boolean
  onLongPress?: (m: Media) => void
  headerContent?: ReactNode
  releaseDates?: boolean
  footerFor?: (m: Media) => string | null | undefined
  eyebrow?: string | null
  revealId?: string
}

export function MediaRail({ title, media, onOpen, onAction, ranked = false, progress = false, loadMore, loadingMore = false, onSeeAll, spacious = false, onLongPress, headerContent, releaseDates = false, footerFor, eyebrow, revealId }: RailProps) {
  if (media.length === 0 && headerContent == null) return null
  return (
    <Reveal id={revealId ?? 'rail:' + title} style={{ paddingTop: spacious ? 18 : 0, paddingBottom: spacious ? 6 : 0 }}>
      <SectionHeader title={title} eyebrow={eyebrow} onAction={onSeeAll} />
      {headerContent}
      <div className="hscroll row" style={{ marginTop: 12, padding: '0 20px', gap: ranked ? 6 : 12, alignItems: 'flex-start' }}>
        {media.map((item, index) => (
          <PosterCard key={item.id} media={item} rank={ranked ? index + 1 : null} progress={progress} open={onOpen} actions={onAction}
            onLongPress={onLongPress} releaseDates={releaseDates} footerOverride={footerFor?.(item) ?? null} />
        ))}
        {loadMore && <LoadMoreTile onClick={loadMore} loading={loadingMore} />}
      </div>
    </Reveal>
  )
}

export function RailSkeleton({ title }: { title: string | null }) {
  return (
    <div>
      {title != null ? <SectionHeader title={title} /> : <LoadingSkeleton style={{ margin: '0 20px', width: 160, height: 20, borderRadius: 8 }} />}
      <div className="row" style={{ marginTop: 12, padding: '0 20px', gap: 12, alignItems: 'flex-start' }}>
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

export function ContinueCard({ entry, open, actions }: { entry: LibraryEntry; open: OpenMedia; actions: (m: Media) => void }) {
  const media = entry.media
  const art = useRef<HTMLDivElement | null>(null)
  const url = media.backdrop || media.poster
  const label = isSeries(media) ? `Prossimo · S${entry.nextSeason} E${entry.nextEpisode}` : 'Film · da finire'
  return (
    <Press style={{ width: 284, aspectRatio: '16 / 9.5', position: 'relative', flex: 'none' }}
      onClick={() => open(media, artSource(art.current, url, 22))} onLongPress={() => actions(media)}>
      <ArtworkImage media={media} url={url} corner={22} style={{ position: 'absolute', inset: 0 }} onEl={(el) => { art.current = el }} />
      <div className="fill" style={{ borderRadius: 22, background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,.15) 45%, rgba(0,0,0,.9) 100%)' }} />
      <div className="fill" style={{ borderRadius: 22, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08)' }} />
      {entry.pinned && (
        <div className="center" style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%', background: 'var(--brand)' }}>
          <Icon name="pushPin" size={16} color="#fff" />
        </div>
      )}
      <div className="row" style={{ position: 'absolute', left: 12, bottom: 12, right: 12 }}>
        <div className="brand-glow center" style={{ width: 40, height: 40, borderRadius: '50%', flex: 'none', ['--glow' as string]: '8px' }}>
          <Icon name="play" size={20} color="#fff" />
        </div>
        <div className="col grow" style={{ marginLeft: 11 }}>
          <span className="ellipsis" style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>{media.title}</span>
          <span className="ellipsis" style={{ color: 'rgba(255,255,255,.78)', fontSize: 12, fontWeight: 600 }}>{label}</span>
        </div>
      </div>
    </Press>
  )
}

/** Floating icon above a title, with a body and an optional glowing button. */
export function EmptyState({ icon, title, body, action, onAction, style }: { icon: IconName; title: string; body: string; action?: string; onAction?: () => void; style?: CSSProperties }) {
  return (
    <Reveal className="col" style={{ alignItems: 'center', padding: 36, width: '100%', ...style }}>
      <motion.div animate={{ y: [-5, 5] }} transition={{ duration: 2.2, ease: fastOutSlowIn, repeat: Infinity, repeatType: 'reverse' }}
        className="brand-glow center" style={{ width: 84, height: 84, borderRadius: 28, ['--glow' as string]: '18px' }}>
        <Icon name={icon} size={38} color="#fff" />
      </motion.div>
      <span className="t-headline-small" style={{ color: 'var(--ink)', textAlign: 'center', marginTop: 24 }}>{title}</span>
      <span style={{ color: 'var(--muted)', fontSize: 15, lineHeight: '21px', textAlign: 'center', marginTop: 8 }}>{body}</span>
      {action && onAction && (
        <Press pressed={0.96} onClick={onAction} className="brand-glow center"
          style={{ marginTop: 22, height: 50, borderRadius: 25, padding: '0 26px', ['--glow' as string]: '8px', color: '#fff', fontWeight: 700, fontSize: 14 }}>
          {action}
        </Press>
      )}
    </Reveal>
  )
}

export function EmptyLibrary({ openMovies }: { openMovies: () => void }) {
  return (
    <Reveal delay={120} className="glass col" style={{ margin: '0 20px', borderRadius: 30, padding: 24 }}>
      <div className="brand-glow center" style={{ width: 54, height: 54, borderRadius: 18, ['--glow' as string]: '10px' }}>
        <Icon name="add" size={28} color="#fff" />
      </div>
      <span className="t-headline-medium" style={{ color: 'var(--ink)', marginTop: 20 }}>Costruisci la tua lista</span>
      <span style={{ color: 'var(--muted)', fontSize: 15, lineHeight: '21px', marginTop: 7, marginBottom: 20 }}>Salva film e serie: StreamWise terrà il filo per te, episodio dopo episodio.</span>
      <Press pressed={0.96} onClick={openMovies} className="row" style={{ alignSelf: 'flex-start', height: 50, borderRadius: 25, padding: '0 24px', gap: 8, background: 'var(--ink)', color: 'var(--bg)', fontWeight: 700, fontSize: 14 }}>
        <Icon name="compass" size={24} /> Esplora il catalogo
      </Press>
    </Reveal>
  )
}

export function SearchPill({ onSearch, style }: { onSearch: (rect: Rect | null) => void; style?: CSSProperties }) {
  return (
    <Press pressed={0.97} onClick={(el) => onSearch(boundsOf(el))} className="glass row" style={{ height: 54, borderRadius: 27, padding: '0 18px', ...style }}>
      <Icon name="search" size={22} color="var(--accent)" />
      <span className="grow" style={{ color: 'var(--muted)', fontSize: 15, marginLeft: 12 }}>Film, serie, attori, registi…</span>
    </Press>
  )
}

function AdvisorCard({ title, subtitle, icon, primary, onClick }: { title: string; subtitle: string; icon: IconName; primary: boolean; onClick: () => void }) {
  return (
    <Press pressed={0.96} onClick={onClick} className={'grow col ' + (primary ? 'brand-glow' : 'glass')}
      style={{ borderRadius: 26, padding: 18, overflow: 'hidden', ['--glow' as string]: '14px' }}>
      {primary && <LightSweep />}
      <div className="center" style={{ width: 42, height: 42, borderRadius: '50%', background: primary ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.08)', position: 'relative' }}>
        <motion.div animate={primary ? { rotate: [-10, 10] } : undefined} transition={{ duration: 1.8, ease: fastOutSlowIn, repeat: Infinity, repeatType: 'reverse' }}>
          <Icon name={icon} size={22} color={primary ? '#fff' : 'var(--accent)'} />
        </motion.div>
      </div>
      <span style={{ color: '#fff', fontWeight: 800, fontSize: 18, marginTop: 14, position: 'relative' }}>{title}</span>
      <span style={{ color: primary ? 'rgba(255,255,255,.86)' : 'rgba(255,255,255,.6)', fontSize: 13, lineHeight: '17px', marginTop: 3, position: 'relative' }}>{subtitle}</span>
    </Press>
  )
}

export function AdvisorCards({ hasLibrary, onAdvisor }: { hasLibrary: boolean; onAdvisor: (fromLibrary: boolean) => void }) {
  return (
    <div className="row" style={{ padding: '0 20px', gap: 12, alignItems: 'stretch' }}>
      <AdvisorCard title="Sorprendimi" subtitle="Un titolo a caso dal catalogo, su misura" icon="sparkles" primary onClick={() => onAdvisor(false)} />
      {hasLibrary && <AdvisorCard title="Dalla mia lista" subtitle="Scelgo io tra i titoli che hai salvato" icon="library" primary={false} onClick={() => onAdvisor(true)} />}
    </div>
  )
}

export const FIND_TITLE = 'Ritrova un titolo'
export const FIND_TITLE_SUBTITLE = 'Non ricordi il nome? Rispondi a qualche domanda e lo cerco io'

/** Look of the "Chiedi all'IA" card; also drawn by the page transition that grows out of it. */
export function AiCardArt({ title = "Chiedi all'IA", subtitle = 'Dimmi cosa ti va: ti consiglio titoli su misura dei tuoi gusti', icon = 'sparkles', style }: { title?: string; subtitle?: string; icon?: IconName; style?: CSSProperties }) {
  return (
    <div className="row" style={{
      borderRadius: 26, padding: 16, position: 'relative',
      background: 'linear-gradient(135deg, #26123F, #1A1426, #3A0F1E)', ...style,
    }}>
      <div className="fill" style={{ borderRadius: 26, padding: 1, background: 'linear-gradient(135deg, rgba(165,123,255,.55), rgba(215,20,43,.35))', WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none' }} />
      <div className="center" style={{ width: 46, height: 46, borderRadius: '50%', flex: 'none', background: 'linear-gradient(135deg, #A57BFF, #D7142B)' }}>
        <Icon name={icon} size={23} color="#fff" />
      </div>
      <div className="grow col" style={{ padding: '0 14px' }}>
        <div className="row">
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>{title}</span>
          <span style={{ marginLeft: 8, borderRadius: 999, background: 'rgba(165,123,255,.22)', padding: '2px 7px', color: 'var(--violet)', fontSize: 9, fontWeight: 900, letterSpacing: 1, lineHeight: '14px' }}>NUOVO</span>
        </div>
        <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, lineHeight: '17px', marginTop: 2 }}>{subtitle}</span>
      </div>
      <Icon name="chevronRight" size={24} color="rgba(255,255,255,.7)" />
    </div>
  )
}

export function AiCard({ onOpen, title, subtitle, icon, delay }: { onOpen: (rect: Rect | null) => void; title?: string; subtitle?: string; icon?: IconName; delay: number }) {
  return (
    <Reveal id={'aicard:' + (title ?? 'ai')} delay={delay} style={{ padding: '0 20px' }}>
      <Press pressed={0.97} onClick={(el) => onOpen(boundsOf(el))}>
        <AiCardArt title={title} subtitle={subtitle} icon={icon} />
      </Press>
    </Reveal>
  )
}

export function GuideTeaser({ onOpen }: { onOpen: () => void }) {
  return (
    <Reveal id="guide-teaser" style={{ padding: '0 20px' }}>
      <Press pressed={0.97} onClick={onOpen} className="row" style={{ borderRadius: 26, padding: 18, background: 'linear-gradient(135deg, #1B2542, #141826)', boxShadow: 'inset 0 0 0 1px rgba(76,141,255,.35)' }}>
        <div className="center" style={{ width: 52, height: 52, borderRadius: 17, background: 'rgba(76,141,255,.18)', flex: 'none' }}>
          <Icon name="tvGuide" size={27} color="var(--blue)" />
        </div>
        <div className="grow col" style={{ padding: '0 14px' }}>
          <div className="row">
            <PulsingDot color="var(--like)" size={4} />
            <span style={{ color: 'var(--like)', fontSize: 11, fontWeight: 900, letterSpacing: 1.4, marginLeft: 4 }}>STASERA IN TV</span>
          </div>
          <span style={{ color: 'var(--ink)', fontWeight: 800, fontSize: 17 }}>Film e serie in chiaro</span>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>Palinsesti, canali e promemoria</span>
        </div>
        <Icon name="chevronRight" size={24} color="var(--muted)" />
      </Press>
    </Reveal>
  )
}

// --- spotlight rails --------------------------------------------------------------------------

export function SpotlightRail({ eyebrow, title, subtitle, icon, accent, background, media, onOpen, onAction, onSeeAll, onLoadMore, loadingMore }: {
  eyebrow: string; title: string; subtitle: string; icon: ReactNode; accent: string; background: string; media: Media[]
  onOpen: OpenMedia; onAction: (m: Media) => void; onSeeAll: (rect: Rect | null) => void; onLoadMore: (() => void) | null; loadingMore: boolean
}) {
  return (
    <Reveal id={'spot:' + title} style={{ padding: '0 12px' }}>
      <div style={{ borderRadius: 30, background, padding: '18px 0', position: 'relative' }}>
        <div className="fill" style={{ borderRadius: 30, padding: 1, background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 55%, transparent), color-mix(in srgb, ${accent} 8%, transparent))`, WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none' }} />
        <div className="row" style={{ padding: '0 4px 0 16px' }}>
          {icon}
          <div className="grow col" style={{ paddingLeft: 12 }}>
            <span style={{ color: accent, fontSize: 10, fontWeight: 900, letterSpacing: 1.3, lineHeight: '16px' }}>{eyebrow}</span>
            <span className="t-title-large" style={{ color: 'var(--ink)' }}>{title}</span>
          </div>
          <div style={{ width: 110 }}><SectionHeader title="" action="Tutti" onAction={onSeeAll} /></div>
        </div>
        <span style={{ display: 'block', color: 'var(--muted)', fontSize: 14, padding: '8px 16px' }}>{subtitle}</span>
        <div className="hscroll row" style={{ marginTop: 4, padding: '0 16px', gap: 12, alignItems: 'flex-start' }}>
          {media.map((item) => <PosterCard key={item.id} media={item} open={onOpen} actions={onAction} />)}
          {onLoadMore && <LoadMoreTile onClick={onLoadMore} loading={loadingMore} accent={accent} />}
        </div>
      </div>
    </Reveal>
  )
}

export type Holiday = { id: string; title: string; eyebrow: string; subtitle: string; emoji: string; accent: string; background: string }

const HALLOWEEN: Holiday = { id: 'halloween', title: 'Speciale Halloween', eyebrow: 'BRIVIDI DI STAGIONE', subtitle: 'Streghe, zucche e notti da paura: film e serie a tema.', emoji: '🎃', accent: '#FF8A1E', background: 'linear-gradient(135deg, #2B1608, #15111C, #1E0F1F)' }
const CHRISTMAS: Holiday = { id: 'christmas', title: 'Speciale Natale', eyebrow: 'ATMOSFERA NATALIZIA', subtitle: 'Film e serie da guardare sotto l’albero.', emoji: '🎄', accent: '#3DDC84', background: 'linear-gradient(135deg, #0F2A1C, #15131A, #2A0F14)' }

/** Seasonal sections: Halloween for all of October, Christmas from mid November to Epiphany. */
export function currentHoliday(today: string): Holiday | null {
  const month = Number(today.slice(5, 7))
  const day = Number(today.slice(8, 10))
  if (month === 10) return HALLOWEEN
  if (month === 11 && day >= 15) return CHRISTMAS
  if (month === 12) return CHRISTMAS
  if (month === 1 && day <= 6) return CHRISTMAS
  return null
}

export function HolidayRail({ holiday, ...rest }: { holiday: Holiday; media: Media[]; onOpen: OpenMedia; onAction: (m: Media) => void; onSeeAll: (rect: Rect | null) => void; onLoadMore: (() => void) | null; loadingMore: boolean }) {
  return (
    <SpotlightRail {...rest} eyebrow={holiday.eyebrow} title={holiday.title} subtitle={holiday.subtitle} accent={holiday.accent} background={holiday.background}
      icon={
        <motion.div animate={{ y: [-4, 4], rotate: [-6, 6] }} transition={{ duration: 1.4, ease: fastOutSlowIn, repeat: Infinity, repeatType: 'reverse' }}
          className="center" style={{ width: 44, height: 44, borderRadius: '50%', flex: 'none', background: `color-mix(in srgb, ${holiday.accent} 18%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${holiday.accent} 55%, transparent)` }}>
          <span style={{ fontSize: 22, lineHeight: '28px' }}>{holiday.emoji}</span>
        </motion.div>
      } />
  )
}

export const MASTERPIECES_RAIL = 'Capolavori da scoprire'
export const TASTE_RAIL = 'Consigliati per te'

export function DiscoveryRail(props: { media: Media[]; onOpen: OpenMedia; onAction: (m: Media) => void; onLoadMore: () => void; loadingMore: boolean; onSeeAll: (rect: Rect | null) => void }) {
  return (
    <SpotlightRail {...props} eyebrow="SCELTI PER SORPRENDERTI" title={MASTERPIECES_RAIL} subtitle="Titoli molto apprezzati, anche fuori dai soliti riflettori."
      accent="#FF4B45" background="linear-gradient(135deg, #2A1216, #15131A, #1C1014)"
      icon={<div className="brand-glow center" style={{ width: 44, height: 44, borderRadius: '50%', flex: 'none', ['--glow' as string]: '8px' }}><Icon name="sparkles" size={22} color="#fff" /></div>} />
  )
}

export function TasteRail({ hasMore, onLoadMore, ...props }: { media: Media[]; onOpen: OpenMedia; onAction: (m: Media) => void; onSeeAll: (rect: Rect | null) => void; onLoadMore: () => void; loadingMore: boolean; hasMore: boolean }) {
  return (
    <SpotlightRail {...props} onLoadMore={hasMore ? onLoadMore : null} eyebrow="IN BASE AI TUOI MI PIACE" title={TASTE_RAIL} subtitle="Storie affini ai titoli che hai apprezzato."
      accent="#3DDC97" background="linear-gradient(135deg, #10241D, #13161C, #0F1D19)"
      icon={<div className="center" style={{ width: 44, height: 44, borderRadius: '50%', flex: 'none', background: 'rgba(61,220,151,.16)', boxShadow: 'inset 0 0 0 1px rgba(61,220,151,.5)' }}><ReactionIcon liked size={22} /></div>} />
  )
}

// --- featured carousel ------------------------------------------------------------------------

/** Ken Burns zoom shared by every hero card (1 → 1.06 in 16 s, back and forth). */
function useKenBurns(): MotionValue<number> {
  const zoom = useMotionValue(1)
  useEffect(() => {
    const controls = animate(zoom, 1.06, { duration: 16, ease: 'linear', repeat: Infinity, repeatType: 'reverse' })
    return () => controls.stop()
  }, [zoom])
  return zoom
}

/** Visual content of a carousel card; also drawn by the page transition so the card morphs as a whole. */
export function HeroCardArt({ media, type, saved, zoom, pageOffset, onDetails, onToggle }: {
  media: Media; type: string; saved: boolean; zoom: MotionValue<number> | number; pageOffset: MotionValue<number> | number; onDetails: () => void; onToggle: () => void
}) {
  const offset = typeof pageOffset === 'number' ? useMotionValue(pageOffset) : pageOffset
  const imageX = useTransform(offset, (o) => `${o * 30}%`)
  const textX = useTransform(offset, (o) => `${o * 35}%`)
  const textOpacity = useTransform(offset, (o) => Math.min(1, Math.max(0, 1 - Math.abs(o) * 1.4)))
  return (
    <div className="fill" style={{ borderRadius: 30, overflow: 'hidden' }}>
      <motion.div className="fill" style={{ x: imageX, scale: zoom }}>
        <RemoteImage url={media.backdrop || media.poster} style={{ position: 'absolute', inset: 0 }} />
      </motion.div>
      <div className="fill" style={{ background: 'linear-gradient(180deg, transparent 0%, transparent 40%, rgba(0,0,0,.55) 68%, rgba(0,0,0,.94) 100%)' }} />
      <div className="fill hairline" style={{ borderRadius: 30, pointerEvents: 'none' }} />
      <motion.div className="col" style={{ position: 'absolute', left: 18, right: 18, bottom: 18, x: textX, opacity: textOpacity }}>
        <div className="row">
          <span style={{ borderRadius: 999, background: 'var(--brand)', padding: '4px 10px', color: '#fff', fontWeight: 900, letterSpacing: 1.4, fontSize: 10, lineHeight: '14px' }}>IN EVIDENZA</span>
          <span style={{ color: 'rgba(255,255,255,.75)', fontWeight: 700, fontSize: 12, marginLeft: 10 }}>{type === 'tv' ? 'Serie TV' : 'Film'}</span>
        </div>
        <span className="t-display-small clamp2" style={{ color: '#fff', marginTop: 10 }}>{media.title}</span>
        <div className="row" style={{ marginTop: 10, gap: 6 }}>
          {media.rating > 0 && <MetaPill text={rating(media.rating)} icon="star" tint="var(--amber)" background="rgba(255,255,255,.12)" />}
          <MetaPill text={media.year} background="rgba(255,255,255,.12)" />
          <span className="ellipsis" style={{ color: 'rgba(255,255,255,.75)', fontSize: 13 }}>{media.genres.slice(0, 2).join(' · ')}</span>
        </div>
        <div className="row" style={{ marginTop: 18, height: 54, gap: 10 }}>
          <Press pressed={0.96} onClick={(_el) => onDetails()} className="grow brand-glow center"
            style={{ height: '100%', borderRadius: 27, ['--glow' as string]: '10px', gap: 7, color: '#fff', fontSize: 14, fontWeight: 700, padding: '0 10px' }}>
            <Icon name="play" size={20} /> Scopri di più
          </Press>
          <Press pressed={0.96} onClick={(_el) => onToggle()} className="grow glass center"
            style={{ ['--glass-alpha' as string]: saved ? 0.5 : 0.7, height: '100%', borderRadius: 27, color: saved ? 'var(--like)' : '#fff', fontSize: 14, fontWeight: 700, padding: '0 10px' }}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={String(saved)} className="row" style={{ gap: 7 }}
                initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1, transition: { opacity: tween(200), scale: spring(0.5, 500) } }} exit={{ opacity: 0, transition: tween(100) }}>
                <Icon name={saved ? 'check' : 'add'} size={20} />
                <span className="ellipsis">{saved ? 'In lista' : 'La mia lista'}</span>
              </motion.div>
            </AnimatePresence>
          </Press>
        </div>
      </motion.div>
    </div>
  )
}

/** Infinite pager of 500 dp cards with 20 dp side padding and 12 dp spacing, auto-advancing every 6.5 s. */
export function FeaturedCarousel({ media, type, onOpen, isSaved, onToggle, paused }: {
  media: Media[]; type: string; onOpen: OpenMedia; isSaved: (m: Media) => boolean; onToggle: (m: Media, save: boolean) => void; paused: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const position = useMotionValue(0)
  const [page, setPage] = useState(0)
  const zoom = useKenBurns()
  const dragging = useRef(false)
  const step = width - 40 + 12
  useEffect(() => {
    const el = ref.current!
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])
  const goTo = (target: number, duration = 0.9) => {
    setPage(target)
    animate(position, target, { duration, ease: emphasized })
  }
  useEffect(() => {
    if (paused || media.length <= 1) return
    const id = window.setTimeout(() => { if (!dragging.current) goTo(page + 1) }, 6500)
    return () => window.clearTimeout(id)
  }, [page, paused, media.length])
  // Preload every artwork, like the native image cache warm-up.
  useEffect(() => { for (const m of media) for (const u of [m.backdrop, m.poster]) if (u) { const i = new Image(); i.src = u } }, [media])
  const visible = [-1, 0, 1].map((d) => page + d)
  const pointer = useRef<{ x: number; y: number; start: number; id: number; axis: 'x' | 'y' | null; t: number } | null>(null)
  return (
    <div>
      <div ref={ref} style={{ position: 'relative', height: 500, touchAction: 'pan-y', overflow: 'hidden' }}
        onPointerDown={(e) => { pointer.current = { x: e.clientX, y: e.clientY, start: position.get(), id: e.pointerId, axis: null, t: performance.now() } }}
        onPointerMove={(e) => {
          const p = pointer.current
          if (!p || media.length <= 1) return
          const dx = e.clientX - p.x
          const dy = e.clientY - p.y
          if (p.axis == null && Math.hypot(dx, dy) > 8) p.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
          if (p.axis === 'x') {
            dragging.current = true
            position.set(p.start - dx / step)
          }
        }}
        onPointerUp={(e) => {
          const p = pointer.current
          pointer.current = null
          if (!p || p.axis !== 'x') return
          const dx = e.clientX - p.x
          const velocity = dx / Math.max(1, performance.now() - p.t)
          let target = Math.round(position.get())
          if (Math.abs(velocity) > 0.4) target = Math.round(p.start) + (velocity < 0 ? 1 : -1)
          dragging.current = false
          goTo(target, 0.45)
        }}
        onPointerCancel={() => { pointer.current = null; dragging.current = false; goTo(Math.round(position.get()), 0.45) }}
        onClickCapture={(e) => { if (dragging.current) { e.stopPropagation(); e.preventDefault() } }}>
        {width > 0 && visible.map((index) => (
          <HeroPage key={index} index={index} item={media[((index % media.length) + media.length) % media.length]} position={position}
            step={step} width={width - 40} type={type} zoom={zoom} onOpen={onOpen} isSaved={isSaved} onToggle={onToggle} />
        ))}
        {media.length > 1 && <>
          <ArrowButton back onClick={() => goTo(page - 1, 0.6)} style={{ position: 'absolute', left: 30, top: 230 }} />
          <ArrowButton onClick={() => goTo(page + 1, 0.6)} style={{ position: 'absolute', right: 30, top: 230 }} />
        </>}
      </div>
      {media.length > 1 && (
        <div className="row" style={{ justifyContent: 'center', paddingTop: 4 }}>
          {media.map((m, index) => {
            const active = ((page % media.length) + media.length) % media.length === index
            return (
              <motion.div key={m.id} initial={false} animate={{ width: active ? 24 : 6 }} transition={spring(0.7, 400)}
                style={{ margin: '0 3px', height: 6, borderRadius: 3, background: active ? 'var(--brand)' : 'rgba(164,168,181,.35)' }} />
            )
          })}
        </div>
      )}
    </div>
  )
}

function HeroPage({ index, item, position, step, width, type, zoom, onOpen, isSaved, onToggle }: {
  index: number; item: Media; position: MotionValue<number>; step: number; width: number; type: string; zoom: MotionValue<number>
  onOpen: OpenMedia; isSaved: (m: Media) => boolean; onToggle: (m: Media, save: boolean) => void
}) {
  const [saved, setSaved] = useState(isSaved(item))
  useEffect(() => setSaved(isSaved(item)), [isSaved(item)])
  const ref = useRef<HTMLDivElement>(null)
  const x = useTransform(position, (p) => 20 + (index - p) * step)
  const offset = useTransform(position, (p) => p - index)
  const scale = useTransform(offset, (o) => 1 - 0.08 * Math.min(1, Math.abs(o)))
  const open = () => onOpen(item, {
    rect: boundsOf(ref.current), url: item.backdrop || item.poster, corner: 30, el: ref.current,
    overlay: <HeroCardArt media={item} type={type} saved={saved} zoom={zoom.get()} pageOffset={0} onDetails={() => {}} onToggle={() => {}} />,
  })
  return (
    <motion.div ref={ref} data-art={item.id} style={{ position: 'absolute', top: 0, left: 0, width, height: 500, x, scale, borderRadius: 30, boxShadow: '0 9px 18px rgba(0,0,0,.45)', cursor: 'pointer' }}
      onClick={open}>
      <HeroCardArt media={item} type={type} saved={saved} zoom={zoom} pageOffset={offset} onDetails={open}
        onToggle={() => { const next = !saved; setSaved(next); onToggle(item, next) }} />
    </motion.div>
  )
}
