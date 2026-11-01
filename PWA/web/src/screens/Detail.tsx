import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { today } from '../../../shared/dates.ts'
import { describeFollow, worthFollowing } from '../../../shared/follows.ts'
import { flatten } from '../../../shared/library.ts'
import { isSeries, newReleaseFollow, type Media, type Provider } from '../../../shared/model.ts'
import { initializeFollow } from '../../../shared/follows.ts'
import type { ReleaseInfo } from '../../../shared/tmdb.ts'
import { MediaRail, RailSkeleton, ReactionBadge, ReactionIcon } from '../components/cards.tsx'
import { emphasized, spring, tween } from '../components/motion.ts'
import { AlertDialog, Dialog, toast } from '../components/Overlay.tsx'
import { PeopleRail } from '../components/people.tsx'
import { alpha, C, EmptyState, GlassIconButton, Icon, MetaPill, Pressable, RemoteImage, Reveal, Spinner, TextButton } from '../components/ui.tsx'
import { enablePush, pushSupported } from '../lib/push.ts'
import { close, open, replacePage, useBackHandler, type AdvisorRequest } from '../lib/nav.ts'
import { follow, getData, library, unfollow, useData, useStore } from '../lib/store.ts'
import { attempt, tmdb } from '../lib/tmdb.ts'
import { openActions, openPerson, rating } from '../lib/ui.ts'
import { chooseAdvisorTitle } from './Advisor.tsx'
import { AiSimilarSection } from './Ai.tsx'
import { SearchPosterCard } from './Discover.tsx'

export function durationLabel(media: Media): string | null {
  const minutes = isSeries(media) ? media.episodeRuntime : media.runtime
  if (minutes <= 0) return null
  const duration = minutes >= 60 ? (minutes % 60 === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`) : `${minutes} min`
  return isSeries(media) ? `${duration} a episodio` : duration
}

export function DetailPage({ pageKey, initial, advisor }: { pageKey: number; initial: Media; advisor: AdvisorRequest | null }) {
  const [media, setMedia] = useState(initial)
  const [related, setRelated] = useState<Media[]>([])
  const [relatedPage, setRelatedPage] = useState(1)
  const [relatedHasMore, setRelatedHasMore] = useState(false)
  const [relatedLoadingMore, setRelatedLoadingMore] = useState(false)
  const [saga, setSaga] = useState<Media[]>([])
  const [gallery, setGallery] = useState<string[]>([])
  const [hideConfirm, setHideConfirm] = useState(false)
  const [showReaction, setShowReaction] = useState(false)
  const [quickLoading, setQuickLoading] = useState(false)
  const [pendingReaction, setPendingReaction] = useState<((liked: boolean) => void) | null>(null)
  const [poster, setPoster] = useState(false)
  const [reload, setReload] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [rerolling, setRerolling] = useState(false)
  const data = useData()
  const scroller = useRef<HTMLDivElement>(null)
  const scrollY = useMotionValue(0)
  const entry = data.library.get(media.id)
  const state = entry?.state ?? ''
  const inList = state === 'saved' || state === 'progress' || state === 'watched'
  const watched = state === 'watched'
  const reaction = entry?.liked ?? null

  useEffect(() => {
    let cancelled = false
    const manual = reload > 0
    if (manual) setRefreshing(true)
    void (async () => {
      const detailed = await attempt(() => tmdb.details(initial), null)
      if (cancelled) return
      if (detailed) {
        detailed.backdrops = await attempt(() => tmdb.backdrops(detailed), [])
        if (cancelled) return
        setMedia(detailed)
        setGallery(detailed.backdrops)
        if (getData().library.has(detailed.id)) void library.mergeDetails(detailed)
        if (getData().library.get(detailed.id)?.state === 'watched') {
          const seasons = await attempt(() => tmdb.seasons(detailed, false), [])
          library.reopenForNewEpisodes(detailed, seasons)
        }
        const sagaList = await attempt(() => tmdb.saga(detailed), [])
        const first = await attempt(() => tmdb.related(detailed, 1), [])
        if (cancelled) return
        setSaga(sagaList)
        setRelatedPage(1)
        setRelatedHasMore(first.length >= 20)
        setRelated(first.filter((c) => c.id !== detailed.id && !sagaList.some((s) => s.id === c.id)))
      } else if (manual) toast('Aggiornamento dei dati non riuscito')
      if (manual) setRefreshing(false)
    })()
    return () => { cancelled = true }
  }, [initial.id, reload])

  const loadMoreRelated = () => {
    if (relatedLoadingMore || !relatedHasMore) return
    setRelatedLoadingMore(true)
    void (async () => {
      const nextPage = relatedPage + 1
      const next = await attempt(() => tmdb.related(media, nextPage), [])
      setRelated((list) => {
        const all = [...list, ...next.filter((c) => c.id !== media.id && !saga.some((s) => s.id === c.id))]
        return all.filter((m, i) => all.findIndex((x) => x.id === m.id) === i)
      })
      setRelatedPage(nextPage)
      setRelatedHasMore(next.length >= 20)
      setRelatedLoadingMore(false)
    })()
  }

  useBackHandler(poster, () => setPoster(false))

  const markNext = () => {
    if (quickLoading || !entry) return
    setQuickLoading(true)
    const season = entry.nextSeason, episode = entry.nextEpisode
    void (async () => {
      const seasons = await attempt(() => tmdb.seasons(media, true), [])
      const all = flatten(seasons)
      const next = all.find((e) => e.season === season && e.number === episode)
      if (next && next === all[all.length - 1]) setPendingReaction(() => (liked: boolean) => { void library.markEpisode(media, next, seasons, liked) })
      else if (next) void library.markEpisode(media, next, seasons, null)
      setQuickLoading(false)
    })()
  }

  const reroll = advisor ? () => {
    if (rerolling) return
    setRerolling(true)
    void chooseAdvisorTitle(advisor, media.id).then((next) => {
      if (next) replacePage(pageKey, { kind: 'detail', media: next, advisor })
      setRerolling(false)
    })
  } : null

  const backdropUrl = media.backdrop || initial.backdrop || initial.poster
  const parallaxY = useTransform(scrollY, (y) => y * 0.5)
  const parallaxScale = useTransform(scrollY, (y) => 1 + y / 4000)
  const [barSolid, setBarSolid] = useState(false)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const on = () => { scrollY.set(Math.max(0, el.scrollTop)); setBarSolid(el.scrollTop > 330) }
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  }, [])

  const reactionColor = reaction === true ? C.like : reaction === false ? C.dislike : C.accent
  const [overviewExpanded, setOverviewExpanded] = useState(false)
  useEffect(() => setOverviewExpanded(false), [media.id])

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg }}>
      <div ref={scroller} className="scroll" style={{ position: 'absolute', inset: 0, paddingBottom: 44 }}>
        <div style={{ position: 'relative', height: 520 }}>
          {/* Parallax: the backdrop drifts at half speed but stays clipped to its own area. */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 420, overflow: 'hidden' }}>
            <motion.div style={{ position: 'absolute', inset: 0, y: parallaxY, scale: parallaxScale }}>
              <RemoteImage url={backdropUrl} animatedPlaceholder style={{ position: 'absolute', inset: 0 }} />
            </motion.div>
          </div>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 422, background: `linear-gradient(180deg, rgba(0,0,0,.55) 0%, transparent 30%, ${alpha(C.bg, 0.55)} 68%, ${C.bg} 100%)` }} />
          <div style={{ position: 'absolute', left: 20, right: 20, bottom: 0, display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ width: 134, aspectRatio: '0.68', borderRadius: 20, boxShadow: `0 13px 26px ${alpha(C.red, 0.35)}`, flex: 'none', position: 'relative' }}>
              <AnimatePresence>
                {!poster && (
                  <motion.div layoutId={`poster-${initial.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(220)}
                    onClick={() => setPoster(true)}
                    style={{ position: 'absolute', inset: 0, borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,.14)', cursor: 'zoom-in' }}>
                    <RemoteImage url={initial.poster || initial.backdrop} animatedPlaceholder style={{ position: 'absolute', inset: 0 }} />
                    {reaction != null && <ReactionBadge liked={reaction} style={{ position: 'absolute', top: 8, right: 8, transform: 'scale(.85)', transformOrigin: 'top right' }} />}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div style={{ marginLeft: 16, paddingBottom: 4, flex: 1, minWidth: 0 }}>
              <div style={{ color: C.accent, fontSize: 11, fontWeight: 900, letterSpacing: 1.6 }}>{isSeries(media) ? 'SERIE TV' : 'FILM'}</div>
              <div className="t-headline-medium" style={{ color: C.ink, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{media.title}</div>
              {media.tagline.trim() && <div className="clamp2" style={{ color: C.muted, fontSize: 13, lineHeight: '17px', fontStyle: 'italic', marginTop: 6 }}>{media.tagline}</div>}
            </div>
          </div>
        </div>
        <Reveal distance={20} style={{ padding: '0 20px' }}>
          <div className="hscroll" style={{ gap: 7, marginTop: 18, alignItems: 'center' }}>
            {media.rating > 0 && <MetaPill text={rating(media.rating)} icon="star" tint={C.amber} background={alpha(C.amber, 0.14)} />}
            <MetaPill text={media.year} background={C.raised} />
            {durationLabel(media) && <MetaPill text={durationLabel(media)!} background={C.raised} />}
            {media.genres.slice(0, 3).map((genre, i) => {
              // Names and ids come from the same TMDB list, so the first entries line up.
              const id = media.genreIds[i]
              return id != null ? (
                <Pressable key={genre} onClick={(rect) => open({ kind: 'genre', type: media.mediaType, genreId: id, genreName: genre }, { rect, corner: 14 })} style={{ flex: 'none' }}>
                  <GenrePill genre={genre} clickable />
                </Pressable>
              ) : <GenrePill key={genre} genre={genre} clickable={false} />
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, height: 56 }}>
            <Pressable pressed={0.97} className="brand-glow" onClick={() => void (inList ? library.remove(media) : library.save(media))}
              style={{ flex: 1, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px', color: '#fff', overflow: 'hidden' }}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div key={inList ? 'in' : 'out'} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={tween(220)} style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                  <Icon name={inList ? 'check' : 'add'} size={20} />
                  <span className="ellipsis" style={{ marginLeft: 6, fontSize: 13, fontWeight: 700, letterSpacing: 0.1 }}>{inList ? 'Nella mia lista' : 'Aggiungi alla lista'}</span>
                </motion.div>
              </AnimatePresence>
            </Pressable>
            {isSeries(media) ? (
              <Pressable pressed={0.97} className="brand-glow" onClick={(rect) => open({ kind: 'episodes', media }, { rect, corner: 18 })}
                style={{ flex: 1, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <Icon name="tv" size={20} style={{ position: 'relative' }} />
                <span style={{ marginLeft: 6, fontSize: 13, fontWeight: 700, letterSpacing: 0.1, position: 'relative' }}>Episodi</span>
              </Pressable>
            ) : (
              <Pressable pressed={0.97} className={watched ? 'brand-glow' : undefined} onClick={() => { if (watched) void library.markMovieUnwatched(media); else setShowReaction(true) }}
                style={{ flex: 1, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: watched ? undefined : C.raised, color: watched ? '#fff' : C.ink, ['--glow-blur' as string]: '6px', padding: '0 10px' }}>
                <Icon name="check" size={20} style={{ position: 'relative' }} />
                <span className="ellipsis" style={{ marginLeft: 6, fontSize: 13, fontWeight: 700, letterSpacing: 0.1, position: 'relative' }}>{watched ? 'Già visto' : 'Segna come visto'}</span>
              </Pressable>
            )}
          </div>
          {isSeries(media) && entry?.state === 'progress' && (
            <Pressable pressed={0.97} onClick={markNext} disabled={quickLoading}
              style={{ marginTop: 12, height: 54, borderRadius: 18, background: quickLoading ? C.raised : alpha(C.like, 0.15), border: `1px solid ${alpha(C.like, 0.48)}`, color: quickLoading ? C.muted : C.like, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
              {quickLoading ? <Spinner size={20} color={C.like} stroke={2} /> : <Icon name="check" size={21} />}
              <span className="ellipsis" style={{ marginLeft: 8, fontWeight: 700, fontSize: 14, letterSpacing: 0.1 }}>{quickLoading ? 'Aggiornamento…' : `Segna S${entry.nextSeason} · E${entry.nextEpisode} come visto`}</span>
            </Pressable>
          )}
          {reroll && (
            <Pressable pressed={0.97} onClick={reroll} disabled={rerolling} className={rerolling ? undefined : 'brand-glow'}
              style={{ marginTop: 12, height: 54, borderRadius: 18, background: rerolling ? C.raised : undefined, color: rerolling ? C.muted : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', ['--glow-blur' as string]: '8px' }}>
              {rerolling ? <Spinner size={21} color={C.accent} stroke={2} /> : <Icon name="sparkles" size={22} style={{ position: 'relative' }} />}
              <span style={{ marginLeft: 9, fontWeight: 700, fontSize: 14, letterSpacing: 0.1, position: 'relative' }}>{rerolling ? 'Sto scegliendo…' : 'Sorprendimi ancora'}</span>
            </Pressable>
          )}
          {watched && (
            <Pressable pressed={0.97} onClick={() => setShowReaction(true)}
              style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', borderRadius: 16, background: alpha(reactionColor, 0.13), border: `1px solid ${alpha(reactionColor, 0.48)}`, padding: '9px 13px' }}>
              {reaction != null ? <ReactionIcon liked={reaction} size={20} /> : <Icon name="thumb_up" size={20} color={C.accent} />}
              <span style={{ marginLeft: 9, color: reactionColor, fontWeight: 600 }}>{reaction === true ? 'Ti è piaciuto · Cambia voto' : reaction === false ? 'Non ti è piaciuto · Cambia voto' : 'Valuta questo titolo'}</span>
            </Pressable>
          )}
          <FollowReleaseCard media={media} />
          <div className="t-title-large" style={{ color: C.ink, marginTop: 26 }}>Trama</div>
          <motion.div layout="size" transition={tween(320, emphasized)} onClick={() => setOverviewExpanded(!overviewExpanded)}
            style={{ color: C.muted, fontSize: 16, lineHeight: '24px', marginTop: 8, overflow: 'hidden', ...(overviewExpanded ? {} : { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }) }}>
            {media.overview}
          </motion.div>
          {media.overview.length > 220 && (
            <div onClick={() => setOverviewExpanded(!overviewExpanded)} style={{ color: C.accent, fontWeight: 700, fontSize: 14, marginTop: 6, cursor: 'pointer' }}>{overviewExpanded ? 'Mostra meno' : 'Leggi tutto'}</div>
          )}
        </Reveal>
        {gallery.length > 0 && <MediaImageCarousel images={gallery} />}
        {media.directors.length > 0 && <PeopleRail people={media.directors} title="Regia" onPerson={openPerson} />}
        {media.cast.length > 0 && <PeopleRail people={media.cast} onPerson={openPerson} />}
        <ProviderGroups media={media} />
        {saga.length > 0 && <div style={{ padding: '18px 0 6px' }}><MediaRail title="Della stessa saga" media={saga} /></div>}
        {related.length > 0 && <div style={{ padding: '18px 0 6px' }}><MediaRail title="Potrebbe piacerti" media={related} loadMore={relatedHasMore ? loadMoreRelated : null} loadingMore={relatedLoadingMore} /></div>}
        <AiSimilarSection media={media} />
      </div>
      <motion.div initial={false} animate={{ backgroundColor: `rgba(10,11,16,${barSolid ? 0.96 : 0})` }} transition={tween(240)}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 'var(--status-top)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 14px' }}>
          <GlassIconButton icon="back" label="Indietro" onClick={() => close(pageKey)} />
          <motion.div initial={false} animate={{ opacity: barSolid ? 1 : 0, y: barSolid ? 0 : 12 }} transition={tween(240)}
            className="ellipsis" style={{ flex: 1, padding: '0 12px', color: C.ink, fontWeight: 800, fontSize: 17 }}>{media.title}</motion.div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Pressable pressed={0.88} className="glass" onClick={() => { if (!refreshing) setReload(reload + 1) }} aria-label="Aggiorna i dati"
              style={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {refreshing ? <Spinner size={20} color="#fff" stroke={2} /> : <Icon name="refresh" size={21} color="#fff" />}
            </Pressable>
            {inList && <GlassIconButton icon="push_pin" label={entry?.pinned ? 'Rimuovi dai fissati' : 'Fissa in cima alla home'} highlighted={!!entry?.pinned} onClick={() => void library.togglePinned(media)} />}
            <GlassIconButton icon="visibility_off" label="Nascondi" onClick={() => setHideConfirm(true)} />
          </div>
        </div>
      </motion.div>
      <AnimatePresence>
        {poster && <PosterViewer url={(initial.poster || initial.backdrop).replace('/w342/', '/original/').replace('/w780/', '/original/')} layoutId={`poster-${initial.id}`} onClose={() => setPoster(false)} />}
      </AnimatePresence>
      <ReactionDialog open={showReaction} title={media.title} alreadyWatched={watched}
        onChoice={(liked) => { void (watched ? library.setLiked(media, liked) : library.watched(media, liked)); setShowReaction(false) }}
        onDismiss={() => setShowReaction(false)} />
      <ReactionDialog open={pendingReaction != null} title={media.title}
        onChoice={(liked) => { pendingReaction?.(liked); setPendingReaction(null) }} onDismiss={() => setPendingReaction(null)} />
      <AlertDialog open={hideConfirm} onDismiss={() => setHideConfirm(false)} title="Nascondere questo titolo?"
        text="Il film o la serie verrà nascosto dal catalogo e dalle proposte."
        dismiss={<TextButton onClick={() => setHideConfirm(false)}>Annulla</TextButton>}
        confirm={<TextButton onClick={() => { void library.hide(media); setHideConfirm(false); close(pageKey) }}>Nascondi</TextButton>} />
    </div>
  )
}

/** Full screen poster with pinch zoom (1×–5×). */
function PosterViewer({ url, layoutId, onClose }: { url: string; layoutId: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const last = useRef<{ dist: number; cx: number; cy: number } | null>(null)
  const measure = () => {
    const pts = [...pointers.current.values()]
    if (pts.length === 1) return { dist: 0, cx: pts[0].x, cy: pts[0].y }
    const [a, b] = pts
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(180)}
      style={{ position: 'absolute', inset: 0, background: '#000', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none' }}
      onPointerDown={(e) => { pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); last.current = measure() }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const now = measure(), before = last.current
        if (before) {
          const factor = before.dist && now.dist ? now.dist / before.dist : 1
          const next = Math.min(5, Math.max(1, zoom * factor))
          setZoom(next)
          setPan(next === 1 ? { x: 0, y: 0 } : { x: pan.x + now.cx - before.cx, y: pan.y + now.cy - before.cy })
        }
        last.current = now
      }}
      onPointerUp={(e) => { pointers.current.delete(e.pointerId); last.current = pointers.current.size ? measure() : null }}
      onPointerCancel={(e) => { pointers.current.delete(e.pointerId); last.current = null }}
      onWheel={(e) => { const next = Math.min(5, Math.max(1, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); setZoom(next); if (next === 1) setPan({ x: 0, y: 0 }) }}>
      <motion.div layoutId={layoutId} transition={tween(360)} style={{ width: '100%', maxHeight: 760, aspectRatio: '0.68', maxWidth: 'calc(760px * .68)' }}>
        <div style={{ width: '100%', height: '100%', transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <RemoteImage url={url} fit="contain" backgroundColor="transparent" style={{ width: '100%', height: '100%' }} />
        </div>
      </motion.div>
      <Pressable onClick={() => onClose()} aria-label="Chiudi locandina"
        style={{ position: 'absolute', top: 'calc(var(--status-top) + 16px)', left: 16, width: 40, height: 40, borderRadius: '50%', background: 'rgba(20,22,30,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="close" color="#FFDAD2" />
      </Pressable>
      {zoom > 1 && (
        <Pressable onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
          style={{ position: 'absolute', bottom: 'calc(var(--nav-bottom) + 18px)', height: 40, borderRadius: 40, padding: '0 24px', background: 'rgba(20,22,30,.8)', display: 'flex', alignItems: 'center' }}>
          <span className="t-label-large" style={{ color: '#FFDAD2' }}>Ripristina zoom</span>
        </Pressable>
      )}
    </motion.div>
  )
}

/** Genre tag in the detail header; tappable ones show a chevron and open that genre's titles. */
export function GenrePill({ genre, clickable, style }: { genre: string; clickable: boolean; style?: CSSProperties }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 40, background: C.raised, border: `1px solid ${clickable ? alpha(C.accent, 0.3) : 'transparent'}`, padding: `4px ${clickable ? 5 : 9}px 4px 9px`, flex: 'none', ...style }}>
      <span style={{ color: C.ink, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: '14px' }}>{genre}</span>
      {clickable && <Icon name="chevron_right" size={13} color={C.accent} style={{ marginLeft: 1 }} />}
    </div>
  )
}

function MediaImageCarousel({ images }: { images: string[] }) {
  const row = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  useEffect(() => {
    const el = row.current
    if (!el) return
    const on = () => {
      const w = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 1
      setPage(Math.round(el.scrollLeft / (w + 10)))
    }
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  }, [])
  return (
    <div style={{ paddingTop: 26 }}>
      <div className="t-title-large" style={{ color: C.ink, padding: '10px 20px' }}>Immagini</div>
      <div ref={row} className="hscroll" style={{ gap: 10, padding: '0 20px', scrollSnapType: 'x mandatory', scrollPadding: '0 20px' }}>
        {images.map((url) => (
          <div key={url} style={{ flex: 'none', width: 'calc(100% - 40px)', scrollSnapAlign: 'start', aspectRatio: '16 / 9', borderRadius: 20, overflow: 'hidden' }}>
            <RemoteImage url={url} style={{ width: '100%', height: '100%' }} />
          </div>
        ))}
        <div style={{ flex: 'none', width: 10 }} />
      </div>
      <div style={{ textAlign: 'center', color: C.muted, fontSize: 12, marginTop: 10 }}>{page + 1} / {images.length}</div>
    </div>
  )
}

// --- Dove guardarlo ------------------------------------------------------------------------------

export function providerServiceUrl(provider: Provider): string | null {
  const name = provider.name.toLowerCase()
  const id = provider.id
  if (id === 8 || name.includes('netflix')) return 'https://www.netflix.com/'
  if (id === 9 || id === 10 || id === 119 || name.includes('prime video') || name.includes('amazon')) return 'https://www.primevideo.com/'
  if (id === 2 || id === 350 || name.includes('apple tv')) return 'https://tv.apple.com/it/'
  if (id === 3 || name.includes('google play')) return 'https://play.google.com/store/movies'
  if (id === 35 || name.includes('rakuten')) return 'https://www.rakuten.tv/it'
  if (id === 40 || name.includes('chili')) return 'https://www.chili.com/it'
  if (id === 337 || name.includes('disney')) return 'https://www.disneyplus.com/it-it'
  if (id === 531 || name.includes('paramount')) return 'https://www.paramountplus.com/it/'
  if (id === 1899 || name === 'max' || name.includes('hbo max')) return 'https://play.max.com/'
  if (name.includes('timvision')) return 'https://www.timvision.it/'
  if (name.includes('sky')) return 'https://www.sky.it/sky-go'
  if (name === 'now' || name.includes('now tv')) return 'https://www.nowtv.it/'
  if (name.includes('raiplay') || name.includes('rai play')) return 'https://www.raiplay.it/'
  if (name.includes('mediaset') || name.includes('infinity')) return 'https://mediasetinfinity.mediaset.it/'
  if (name.includes('discovery')) return 'https://www.discoveryplus.com/it/'
  if (name.includes('crunchyroll')) return 'https://www.crunchyroll.com/it/'
  if (name.includes('mubi')) return 'https://mubi.com/it/'
  if (name.includes('dazn')) return 'https://www.dazn.com/it-IT/home'
  if (name.includes('pluto')) return 'https://pluto.tv/it/'
  if (name.includes('plex')) return 'https://watch.plex.tv/it/'
  if (name.includes('youtube')) return 'https://www.youtube.com/'
  return null
}

function ProviderGroups({ media }: { media: Media }) {
  const seen = new Set<number>()
  const streaming = media.flatrate.filter((p) => !seen.has(p.id) && !!seen.add(p.id)).map((p) => [p, 'Incluso'] as [Provider, string])
  const groups = new Map<number, [Provider, string[]]>()
  for (const [p, label] of [...media.rent.map((p) => [p, 'Noleggio'] as const), ...media.buy.map((p) => [p, 'Acquisto'] as const)]) {
    const g = groups.get(p.id)
    if (g) { if (!g[1].includes(label)) g[1].push(label) } else groups.set(p.id, [p, [label]])
  }
  const paid = [...groups.values()].map(([p, labels]) => [p, labels.join(' / ')] as [Provider, string])
  return (
    <div style={{ padding: '30px 20px 22px' }}>
      <div className="t-title-large" style={{ color: C.ink, fontWeight: 900, paddingBottom: 12 }}>Dove guardarlo</div>
      {streaming.length > 0 && <ProviderGridCard title="Streaming incluso" subtitle="Disponibile con l’abbonamento" providers={streaming} included />}
      {paid.length > 0 && <ProviderGridCard title="Noleggio e acquisto" subtitle="Disponibile per il noleggio o l’acquisto" providers={paid} included={false} />}
      {streaming.length === 0 && paid.length === 0 && (
        <div style={{ background: C.panel, borderRadius: 17, border: '1px solid #302D34', padding: 16, display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: alpha(C.accent, 0.14), padding: 10, flex: 'none' }}><Icon name="visibility_off" size={22} color={C.accent} /></div>
          <div style={{ marginLeft: 12 }}>
            <div style={{ color: C.ink, fontWeight: 700, fontSize: 13, lineHeight: '18px' }}>Nessuna disponibilità rilevata in Italia</div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 3, lineHeight: '15px' }}>I risultati possono variare in base alla posizione.</div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProviderGridCard({ title, subtitle, providers, included }: { title: string; subtitle: string; providers: [Provider, string][]; included: boolean }) {
  const secondary = '#9C9BAA'
  const columns = 3
  const rows: [Provider, string][][] = []
  for (let i = 0; i < providers.length; i += columns) rows.push(providers.slice(i, i + columns))
  return (
    <div style={{ borderRadius: 25, border: `1px solid ${included ? '#4A2A22' : '#292C34'}`, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ background: included ? 'linear-gradient(135deg, #261611, #0A0B10, #15100E)' : 'linear-gradient(135deg, #12141B, #090B10)', padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 13 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'radial-gradient(circle, #5A2418, #2A1510)', border: '1px solid #5A2A1E', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Icon name={included ? 'broadcast' : 'cart'} size={23} color={C.accent} />
          </div>
          <div style={{ flex: 1, marginLeft: 10 }}>
            <div style={{ color: '#F4F3F7', fontWeight: 700, fontSize: 17, lineHeight: '21px' }}>{title}</div>
            <div style={{ color: secondary, fontSize: 12, lineHeight: '16px', marginTop: 3 }}>{subtitle}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {rows.map((row, r) => (
            <div key={r} style={{ display: 'flex', gap: 7 }}>
              {row.map(([provider, label]) => {
                const url = providerServiceUrl(provider)
                const content = (
                  <div style={{ background: '#0F1117', borderRadius: 17, border: '1px solid #30313B', padding: '11px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
                    <RemoteImage url={provider.logo} fit="contain" style={{ width: 46, height: 46, borderRadius: 13 }} />
                    <div style={{ color: '#F4F3F7', fontWeight: 700, fontSize: 12, lineHeight: '15px', textAlign: 'center', minHeight: 30, width: '100%', paddingTop: 8, boxSizing: 'content-box' }}>{provider.name}</div>
                    <div style={{ flex: 1 }} />
                    <div style={{ marginTop: 8, width: '100%', borderRadius: 40, background: included ? '#40201A' : 'transparent', border: `1px solid ${included ? '#7A3A2A' : '#494854'}`, padding: '6px 5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={included ? 'check' : 'cart'} size={13} color={included ? C.accent : secondary} />
                      <span style={{ marginLeft: 4, color: included ? C.accent : secondary, fontSize: 9, lineHeight: '12px', fontWeight: included ? 600 : 400, textAlign: 'center' }}>{label}</span>
                    </div>
                  </div>
                )
                return url ? (
                  <Pressable key={provider.id} onClick={() => { window.open(url, '_blank', 'noopener') }} style={{ flex: 1, minWidth: 0 }}>{content}</Pressable>
                ) : <div key={provider.id} style={{ flex: 1, minWidth: 0 }}>{content}</div>
              })}
              {Array.from({ length: columns - row.length }, (_, i) => <div key={'s' + i} style={{ flex: 1 }} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Segui l'uscita ------------------------------------------------------------------------------

function FollowReleaseCard({ media }: { media: Media }) {
  const data = useData()
  const permission = useStore((s) => s.settings.remindersEnabled)
  const [info, setInfo] = useState<ReleaseInfo | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    void attempt(() => tmdb.releaseInfo(media), null).then((i) => { if (!cancelled) { setInfo(i); setLoaded(true) } })
    return () => { cancelled = true }
  }, [media.id])
  const stored = data.follows.find((f) => f.media.id === media.id) ?? null
  const followed = stored != null
  const td = today()
  // Fresh data describes the title; the stored follow is the fallback while offline.
  const state = info ? (() => { const f = newReleaseFollow(media); initializeFollow(f, info, td); return f })() : stored?.initialized ? stored : null
  const visible = followed || (info != null && worthFollowing(media, info))
  const accent = followed ? C.amber : C.accent
  // Follows or unfollows, asking for the notification permission the first time it is needed.
  const toggle = async () => {
    if (followed) { void unfollow(media.id); return }
    void follow(media, info)
    if (!permission && !(await enablePush())) toast('Senza notifiche non potrò avvisarti delle uscite')
  }
  return (
    <AnimatePresence initial={false}>
      {visible && (loaded || followed) && (
        <motion.div key="follow" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto', transition: { opacity: tween(220), height: spring(1, 400) } }} exit={{ opacity: 0, height: 0, transition: { opacity: tween(160), height: spring(1, 400) } }} style={{ overflow: 'hidden' }}>
          <div style={{ marginTop: 14, borderRadius: 22, background: followed ? alpha(C.amber, 0.1) : C.raised, border: `1px solid ${followed ? alpha(C.amber, 0.45) : C.outline}`, padding: '14px 15px', transition: 'background 300ms, border-color 300ms' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: alpha(accent, 0.16), display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', transition: 'background 300ms' }}>
                <Icon name={followed ? 'notifications' : 'notifications_none'} size={24} color={accent} />
              </div>
              <div style={{ flex: 1, padding: '0 8px 0 12px', minWidth: 0 }}>
                <div style={{ color: C.ink, fontWeight: 700, fontSize: 16 }}>{followed ? 'Stai seguendo' : isSeries(media) ? 'Segui la serie' : 'Segui l’uscita'}</div>
                <div style={{ color: followed ? C.amber : C.muted, fontSize: 13, lineHeight: '18px', marginTop: 2 }}>{state ? describeFollow(state, td) : 'Dati di uscita non disponibili'}</div>
              </div>
              {followed ? (
                <Pressable pressed={0.95} onClick={() => void toggle()} style={{ height: 40, borderRadius: 16, padding: '0 12px', border: `1px solid ${alpha(C.amber, 0.6)}`, color: C.amber, display: 'flex', alignItems: 'center', flex: 'none' }}>
                  <Icon name="check" size={17} /><span style={{ marginLeft: 5, fontSize: 13, fontWeight: 700 }}>Seguito</span>
                </Pressable>
              ) : (
                <Pressable pressed={0.95} className="brand-glow" onClick={() => void toggle()} style={{ height: 40, borderRadius: 16, padding: '0 14px', color: '#fff', display: 'flex', alignItems: 'center', flex: 'none', ['--glow-blur' as string]: '5px' }}>
                  <Icon name="add" size={17} style={{ position: 'relative' }} /><span style={{ marginLeft: 5, fontSize: 13, fontWeight: 700, position: 'relative' }}>Segui</span>
                </Pressable>
              )}
            </div>
            <div style={{ color: C.muted, fontSize: 12, lineHeight: '17px', marginTop: 10 }}>
              {isSeries(media) ? 'Ti avviso con una notifica il giorno di uscita di ogni nuovo episodio e quando viene annunciata una nuova stagione.' : 'Ti avviso con una notifica il giorno dell’uscita in Italia e quando arriva in streaming in abbonamento.'}
            </div>
            {followed && !permission && (
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
                <div style={{ flex: 1, color: C.error, fontSize: 13 }}>Le notifiche sono disattivate.</div>
                <TextButton onClick={() => void enablePush().then((ok) => { if (!ok) toast(pushSupported() ? 'Consenti le notifiche nelle impostazioni del browser' : 'Apri StreamWise in HTTPS e installala come app per ricevere le notifiche') })}>Attiva</TextButton>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// --- Ti è piaciuto? --------------------------------------------------------------------------------

export function ReactionDialog({ open, title, onChoice, onDismiss, alreadyWatched = false }: { open: boolean; title: string; onChoice: (liked: boolean) => void; onDismiss: () => void; alreadyWatched?: boolean }) {
  const [selected, setSelected] = useState<boolean | null>(null)
  useEffect(() => { if (open) setSelected(null) }, [open, title])
  useEffect(() => {
    if (selected == null) return
    const id = window.setTimeout(() => onChoice(selected), 340)
    return () => window.clearTimeout(id)
  }, [selected])
  return (
    <Dialog open={open} onDismiss={() => { if (selected == null) onDismiss() }}>
      <div style={{ background: C.panel, borderRadius: 30, border: `1px solid ${C.outline}`, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className="brand-glow" style={{ width: 58, height: 58, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', ['--glow-blur' as string]: '10px' }}>
          <Icon name="check" size={29} color="#fff" style={{ position: 'relative' }} />
        </div>
        <div className="t-headline-medium" style={{ color: C.ink, marginTop: 18 }}>Ti è piaciuto?</div>
        <div style={{ color: C.muted, textAlign: 'center', lineHeight: '21px', marginTop: 8, marginBottom: 20 }}>
          {alreadyWatched ? `Aggiorna il tuo voto per “${title}”.` : `Scegli per completare “${title}” e rendere i consigli più tuoi.`}
        </div>
        <div style={{ display: 'flex', gap: 12, width: '100%' }}>
          {[true, false].map((liked) => {
            const active = selected === liked
            const accent = liked ? C.like : C.dislike
            return (
              <motion.div key={String(liked)} animate={{ scale: active ? 1.08 : 1 }} transition={spring(0.5, 1500)}
                onClick={() => { if (selected == null) setSelected(liked) }}
                style={{ flex: 1, height: 105, borderRadius: 22, background: alpha(accent, active ? 0.28 : 0.12), border: `1px solid ${alpha(accent, active ? 1 : 0.55)}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <ReactionIcon liked={liked} size={35} />
                <span style={{ color: accent, fontWeight: 700, marginTop: 8 }}>{liked ? 'Mi piace' : 'Non mi piace'}</span>
              </motion.div>
            )
          })}
        </div>
        <TextButton onClick={onDismiss} disabled={selected != null} color={C.muted} style={{ marginTop: 8 }}>Non adesso</TextButton>
      </div>
    </Dialog>
  )
}

// --- genre page ---------------------------------------------------------------------------------

export function GenrePage({ pageKey, type, genreId, genreName }: { pageKey: number; type: string; genreId: number; genreName: string }) {
  const data = useData()
  const [results, setResults] = useState<Media[] | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void attempt(() => tmdb.discover(type, 1, genreId, null, 'popular'), []).then((first) => { setResults(first); setHasMore(first.length > 0) })
  }, [type, genreId])
  const loadMore = () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const next = page + 1
    void attempt(() => tmdb.discover(type, next, genreId, null, 'popular'), []).then((more) => {
      setPage(next)
      if (!more.length) setHasMore(false)
      else setResults((list) => { const all = [...(list ?? []), ...more]; return all.filter((m, i) => all.findIndex((x) => x.id === m.id) === i) })
      setLoadingMore(false)
    })
  }
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const on = () => { if (el.scrollTop + el.clientHeight >= el.scrollHeight - 600) loadMore() }
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  })
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', paddingTop: 'var(--status-top)' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px 0' }}>
        <GlassIconButton icon="back" label="Indietro" onClick={() => close(pageKey)} />
        <div style={{ flex: 1, padding: '0 14px', minWidth: 0 }}>
          <div style={{ color: C.accent, fontSize: 11, fontWeight: 900, letterSpacing: 1.4 }}>{type === 'tv' ? 'SERIE TV · PIÙ POPOLARI' : 'FILM · PIÙ POPOLARI'}</div>
          <div className="t-headline-medium ellipsis" style={{ color: C.ink }}>{genreName}</div>
        </div>
      </div>
      {results == null ? <div style={{ paddingTop: 24 }}><RailSkeleton title={null} /></div>
        : results.length === 0 ? <EmptyState icon="search" title="Nessun titolo trovato" body="Non ci sono titoli disponibili per questo genere al momento." />
          : (
            <div ref={scroller} className="scroll" style={{ flex: 1 }}>
              <PosterGrid style={{ padding: '16px 20px 32px' }}>
                {results.map((m, i) => (
                  <Reveal key={m.id} delay={(i % 12) * 40} distance={24}><SearchPosterCard media={m} entry={data.library.get(m.id)} onLongPress={() => openActions(m)} /></Reveal>
                ))}
                {loadingMore && <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', padding: 12 }}><Spinner size={26} color={C.accent} stroke={2.5} /></div>}
              </PosterGrid>
            </div>
          )}
    </div>
  )
}

/** GridCells.Adaptive(104.dp) with 12 dp columns and 16 dp rows. */
export function PosterGrid({ children, style, min = 104 }: { children: ReactNode; style?: CSSProperties; min?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, columnGap: 12, rowGap: 16, ...style }}>{children}</div>
}

