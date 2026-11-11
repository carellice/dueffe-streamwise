// DiscoverScreen and CatalogScreen of MainActivity.kt: featured carousel, new releases, Top 10,
// taste, spotlight and genre rails, each with "Vedi tutto" growing into CatalogExpandedScreen.
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { Media } from '../../../shared/model.ts'
import { GENRES, genreValue, uniqueMedia, type Genre } from '../../../shared/tmdb.ts'
import { todayRome } from '../../../shared/dates.ts'
import * as lib from '../../../shared/library.ts'
import { byState, entries, entryOf, removeEntry, saveEntry, stateOf, useStore } from '../lib/store.ts'
import { tmdb } from '../lib/tmdb.ts'
import { emphasized, tween } from '../components/motion.ts'
import { ExpandingPage } from '../components/Transform.tsx'
import { GlassIconButton, Icon, LinearProgress, LoadingSkeleton, Press, SeeAllChipArt, SegmentedPills, boundsOf, type Rect } from '../components/ui.tsx'
import {
  DiscoveryRail, EmptyState, FeaturedCarousel, HolidayRail, MediaRail, RailSkeleton, TasteRail, currentHoliday, MASTERPIECES_RAIL, TASTE_RAIL, type OpenMedia,
} from '../components/cards.tsx'
import { FilterChip } from '../lib/subscriptions.tsx'
import { CatalogExpandedScreen, usePullToRefresh } from './Library.tsx'

const NEW_RELEASES_RAIL = 'Novità'
const TRUE_STORIES_RAIL = 'Storie vere'
const TRUE_CRIME_RAIL = 'True crime'
const APOCALYPTIC_RAIL = 'Apocalittici'
const HOLIDAY_RAIL = 'Speciale festività'
const TOP_RAIL = 'Top 10 oggi'

const shuffle = <T,>(list: T[]): T[] => {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}
const randomBetween = (from: number, to: number) => from + Math.floor(Math.random() * (to - from + 1))

function matchingGenre(seed: Media, targetType: string): number | null {
  const mapping: Record<number, number> = targetType === 'tv'
    ? { 28: 10759, 35: 35, 18: 18, 53: 80, 80: 80, 878: 10765, 14: 10765, 99: 99, 16: 16, 9648: 9648 }
    : { 10759: 28, 35: 35, 18: 18, 80: 80, 10765: 878, 99: 99, 16: 16, 9648: 9648, 10751: 10751 }
  for (const id of seed.genreIds) if (mapping[id] != null) return mapping[id]
  return null
}

async function tastePage(type: string, seeds: Media[], page: number, excluded: Set<string>): Promise<Media[]> {
  const lists = await Promise.all(seeds.slice(0, 3).map(async (seed) => {
    try {
      if (seed.mediaType === type) {
        const recs = await tmdb.recommendations(seed, page)
        if (recs.length > 0) return recs
        return seed.genreIds[0] != null ? await tmdb.discover(type, page, seed.genreIds[0], null, 'popular') : []
      }
      const genre = matchingGenre(seed, type)
      return genre != null ? await tmdb.discover(type, page, genre, null, 'popular') : []
    } catch { return [] }
  }))
  return shuffle(uniqueMedia(lists.flat().filter((m) => !excluded.has(m.id) && m.poster.trim() !== ''))).slice(0, 18)
}

/** A rail whose pages come from [load]: load more, refresh from page [first]. The native code repeats this per rail. */
function usePaged(load: (page: number) => Promise<Media[]>, deps: unknown[]) {
  const [media, setMedia] = useState<Media[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const busy = useRef(false)
  const reset = (list: Media[], at = 1) => { setMedia(list); setPage(at); setHasMore(list.length > 0) }
  useEffect(() => { reset([]) }, deps)
  return {
    media, page, hasMore, loadingMore, refreshing, reset, setMedia,
    loadMore: async () => {
      if (busy.current || !hasMore) return
      busy.current = true
      setLoadingMore(true)
      const next = page + 1
      try {
        const more = await load(next)
        setPage(next)
        if (more.length === 0) setHasMore(false)
        else setMedia((m) => uniqueMedia([...m, ...more]))
      } catch { /* keep what we have */ }
      setLoadingMore(false)
      busy.current = false
    },
    refresh: async (from = 1) => {
      if (busy.current) return
      busy.current = true
      setRefreshing(true)
      const replacement = await load(from).catch(() => [] as Media[])
      if (replacement.length > 0) { setMedia(replacement); setPage(from); setHasMore(true) }
      setRefreshing(false)
      busy.current = false
    },
  }
}

type Rail = { name: string; genre: Genre; media: Media[] }

function useNewReleases(type: string, reload: number) {
  const [upcoming, setUpcoming] = useState(false)
  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [paginationError, setPaginationError] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [retry, setRetry] = useState(0)
  const generation = useRef(0)
  useEffect(() => {
    const gen = ++generation.current
    setMedia([]); setPage(1); setHasMore(true); setLoading(true); setLoadingMore(false); setError(false); setPaginationError(false)
    tmdb.newReleasesPage(type, 1, upcoming).then((r) => { if (gen === generation.current) { setMedia(r.media); setHasMore(r.hasMore); setPage(r.nextPage) } })
      .catch(() => { if (gen === generation.current) setError(true) })
      .finally(() => { if (gen === generation.current) setLoading(false) })
  }, [type, upcoming, reload, retry])
  const loadMore = () => {
    if (loading || loadingMore || !hasMore) return
    const gen = generation.current
    setLoadingMore(true); setPaginationError(false)
    tmdb.newReleasesPage(type, page, upcoming, new Set(media.map((m) => m.id)))
      .then((r) => { if (gen === generation.current) { setPage(r.nextPage); setMedia((m) => uniqueMedia([...m, ...r.media])); setHasMore(r.hasMore) } })
      .catch(() => { if (gen === generation.current) setPaginationError(true) })
      .finally(() => { if (gen === generation.current) setLoadingMore(false) })
  }
  return { media, upcoming, setUpcoming, loading, loadingMore, error, paginationError, hasMore, loadMore, retry: () => setRetry((r) => r + 1) }
}

function CatalogScreen({ kind, onOpen, onAction, onFilters, onExpandedChange, scroller }: {
  kind: string; onOpen: OpenMedia; onAction: (m: Media) => void; onFilters: (r: Rect | null) => void; onExpandedChange: (v: boolean) => void; scroller: React.RefObject<HTMLDivElement>
}) {
  const { version } = useStore()
  const type = kind
  const [reload, setReload] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{ trending: Media[]; featured: Media[] } | null>(null)
  const [rails, setRails] = useState<Rail[]>([])
  const [railPages, setRailPages] = useState<Record<string, number>>({})
  const [loadingRail, setLoadingRail] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<{ name: string; origin: Rect | null } | null>(null)
  const releases = useNewReleases(type, reload)
  const holiday = currentHoliday(todayRome())
  const masterpieces = usePaged((p) => tmdb.masterpieces(type, p), [type])
  const trueStories = usePaged((p) => tmdb.trueStories(type, p), [type])
  const apocalyptic = usePaged((p) => tmdb.apocalyptic(type, p), [type])
  const trueCrime = usePaged((p) => tmdb.trueCrime(type, p), [type])
  const holidayRail = usePaged((p) => (holiday ? tmdb.holiday(holiday.id, type, p) : Promise.resolve([])), [type])
  const likedSeeds = entries().filter((e) => e.liked === true && e.state !== 'hidden').map((e) => e.media)
  const [tasteSeeds, setTasteSeeds] = useState<Media[]>([])
  const [tasteVersion, setTasteVersion] = useState(0)
  const taste = usePaged((p) => tastePage(type, tasteSeeds, p, new Set([...entries().map((e) => e.media.id)])), [type])
  const [tasteRefreshing, setTasteRefreshing] = useState(false)
  useEffect(() => () => onExpandedChange(false), [])
  useEffect(() => {
    let alive = true
    setError(null)
    if (reload > 0) setRailPages({})
    const firstMasterpiecesPage = randomBetween(2, 10)
    ;(async () => {
      try {
        const [top, featured, master, stories, apoc, crime, railList] = await Promise.all([
          tmdb.trending(type),
          tmdb.featured(type).catch(() => [] as Media[]),
          tmdb.masterpieces(type, firstMasterpiecesPage),
          tmdb.trueStories(type, 1).catch(() => [] as Media[]),
          tmdb.apocalyptic(type, 1).catch(() => [] as Media[]),
          tmdb.trueCrime(type, 1).catch(() => [] as Media[]),
          Promise.all(GENRES.filter((g) => genreValue(g, type) !== 0).map(async (genre) => ({
            name: genre.label, genre, media: genre.id === 'erotic' ? await tmdb.eroticDiscover(type, 1) : await tmdb.discover(type, 1, genreValue(genre, type), null, 'popular'),
          }))),
        ])
        if (!alive) return
        setData({ trending: top, featured })
        masterpieces.reset(master, firstMasterpiecesPage)
        trueStories.reset(stories); apocalyptic.reset(apoc); trueCrime.reset(crime)
        setRails(railList)
      } catch {
        if (alive) setError('Non riesco a caricare il catalogo.')
      }
      if (alive) setRefreshing(false)
    })()
    if (holiday) tmdb.holiday(holiday.id, type, 1).catch(() => [] as Media[]).then((first) => { if (alive) holidayRail.reset(first) })
    return () => { alive = false }
  }, [type, reload])
  useEffect(() => {
    let alive = true
    if (likedSeeds.length === 0) { taste.reset([]); setTasteSeeds([]); setTasteRefreshing(false); return }
    setTasteRefreshing(true)
    const shuffled = shuffle(likedSeeds)
    const same = shuffled.filter((m) => m.mediaType === type)
    const other = shuffled.filter((m) => m.mediaType !== type && matchingGenre(m, type) != null)
    let seeds = [...same.slice(0, 2), ...other.slice(0, same.length === 0 ? 3 : 1)]
    if (seeds.length === 0) seeds = other.slice(0, 3)
    tastePage(type, seeds, 1, new Set(entries().map((e) => e.media.id))).then((first) => {
      if (!alive) return
      setTasteSeeds(seeds)
      taste.reset(first)
      taste.setMedia(first)
      setTasteRefreshing(false)
    })
    return () => { alive = false }
  }, [type, reload, tasteVersion, likedSeeds.length > 0])

  const loadMoreRail = async (rail: Rail) => {
    if (loadingRail) return
    setLoadingRail(rail.name)
    const next = (railPages[rail.name] ?? 1) + 1
    const more = await (rail.genre.id === 'erotic' ? tmdb.eroticDiscover(type, next) : tmdb.discover(type, next, genreValue(rail.genre, type), null, 'popular')).catch(() => [] as Media[])
    if (more.length > 0) {
      setRails((list) => list.map((r) => (r.name === rail.name ? { ...r, media: uniqueMedia([...r.media, ...more]) } : r)))
      setRailPages((p) => ({ ...p, [rail.name]: next }))
    }
    setLoadingRail(null)
  }
  const refreshMasterpieces = () => {
    let next = randomBetween(2, 10)
    if (next === masterpieces.page) next = next === 10 ? 2 : next + 1
    void masterpieces.refresh(next)
  }
  const expand = (name: string, origin: Rect | null) => { setExpanded({ name, origin }); onExpandedChange(true) }
  const hidden = new Set(byState('hidden').map((e) => e.media.id))
  const visible = (list: Media[]) => list.filter((m) => !hidden.has(m.id))
  const pull = usePullToRefresh(() => { if (!refreshing) { setRefreshing(true); setError(null); setReload((r) => r + 1) } }, refreshing)
  void version

  let content
  if (error) content = <div className="fill center"><EmptyState icon="refresh" title="Catalogo non disponibile" body={error} action="Riprova" onAction={() => { setRefreshing(true); setError(null); setReload((r) => r + 1) }} /></div>
  else if (!data) content = (
    <div className="fill col" style={{ paddingTop: 'calc(var(--safe-top) + 136px)' }}>
      <LoadingSkeleton style={{ margin: '0 20px', height: 500, borderRadius: 30 }} />
      <div style={{ height: 26 }} />
      <RailSkeleton title={null} />
    </div>
  )
  else {
    const featured = uniqueMedia([...data.featured, ...data.trending].filter((m) => !hidden.has(m.id) && m.backdrop.trim() !== '')).slice(0, 8)
    const releasesVisible = visible(releases.media)
    content = (
      <div ref={(el) => { pull.ref.current = el; (scroller as React.MutableRefObject<HTMLDivElement | null>).current = el }} className="fill scroll" {...pull.handlers}>
        <div className="col" style={{ paddingTop: 'calc(var(--safe-top) + 136px)', paddingBottom: 132, gap: 28 }}>
          {featured.length > 0 && (
            <FeaturedCarousel media={featured} type={type} onOpen={onOpen} paused={false}
              isSaved={(m) => ['saved', 'progress', 'watched'].includes(stateOf(m))}
              onToggle={(m, save) => { if (save) void saveEntry(lib.save(entryOf(m), m)); else void removeEntry(m) }} />
          )}
          <Press pressed={0.97} onClick={(el) => onFilters(boundsOf(el))} className="glass row" style={{ margin: '0 20px', height: 56, borderRadius: 20, padding: '0 16px' }}>
            <div className="center" style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,89,100,.16)', flex: 'none' }}><Icon name="tune" size={19} color="var(--accent)" /></div>
            <div className="grow col" style={{ paddingLeft: 12 }}>
              <span style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 15, lineHeight: '20px' }}>Filtra per piattaforma e genere</span>
              <span style={{ color: 'var(--muted)', fontSize: 12, lineHeight: '16px' }}>Netflix, Prime Video, Disney+ e altri</span>
            </div>
            <Icon name="chevronRight" color="var(--muted)" />
          </Press>
          {holiday && visible(holidayRail.media).length > 0 && (
            <HolidayRail holiday={holiday} media={visible(holidayRail.media)} onOpen={onOpen} onAction={onAction} onSeeAll={(r) => expand(HOLIDAY_RAIL, r)}
              onLoadMore={holidayRail.hasMore ? () => void holidayRail.loadMore() : null} loadingMore={holidayRail.loadingMore} />
          )}
          <MediaRail title="Novità" media={releasesVisible} onOpen={onOpen} onAction={onAction} releaseDates revealId={'releases:' + type}
            onSeeAll={releasesVisible.length > 0 ? (r) => expand(NEW_RELEASES_RAIL, r) : null}
            loadMore={releases.hasMore && !releases.loading && releasesVisible.length > 0 ? releases.loadMore : null} loadingMore={releases.loadingMore}
            headerContent={
              <div style={{ padding: '8px 20px' }}>
                <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: '16px' }}>{type === 'movie' ? 'Uscite italiane · cinema e digitale' : 'Serie in Italia · date di prima TV'}</div>
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <FilterChip selected={!releases.upcoming} onClick={() => releases.setUpcoming(false)}>Appena usciti</FilterChip>
                  <FilterChip selected={releases.upcoming} onClick={() => releases.setUpcoming(true)}>In arrivo</FilterChip>
                </div>
                {releases.paginationError && <button onClick={releases.loadMore} style={{ height: 40, color: 'var(--primary)', fontSize: 14, fontWeight: 700 }}>Caricamento non riuscito · Riprova</button>}
                {releases.loading ? <div style={{ padding: '12px 0' }}><IndeterminateBar /></div>
                  : releases.error ? <button onClick={releases.retry} style={{ height: 40, color: 'var(--primary)', fontSize: 14, fontWeight: 700 }}>Caricamento non riuscito · Riprova</button>
                    : releasesVisible.length === 0 ? (
                      <>
                        <div style={{ color: 'var(--muted)', marginTop: 8 }}>{releases.upcoming ? 'Nessuna uscita confermata per l’Italia nei dati disponibili.' : 'Nessuna novità disponibile in Italia in questa selezione.'}</div>
                        {releases.hasMore && <button disabled={releases.loadingMore} onClick={releases.loadMore} style={{ height: 40, color: 'var(--primary)', fontSize: 14, fontWeight: 700 }}>{releases.loadingMore ? 'Caricamento…' : 'Cerca altre uscite'}</button>}
                      </>
                    ) : null}
              </div>
            } />
          <MediaRail title={TOP_RAIL} media={visible(data.trending)} onOpen={onOpen} onAction={onAction} ranked onSeeAll={(r) => expand(TOP_RAIL, r)} revealId={'top:' + type} />
          {likedSeeds.length > 0 && taste.media.length > 0 && (
            <TasteRail media={visible(taste.media)} onOpen={onOpen} onAction={onAction} onSeeAll={(r) => expand(TASTE_RAIL, r)} onLoadMore={() => void taste.loadMore()} loadingMore={taste.loadingMore} hasMore={taste.hasMore && taste.page < 20} />
          )}
          {visible(masterpieces.media).length > 0 && (
            <DiscoveryRail media={visible(masterpieces.media)} onOpen={onOpen} onAction={onAction} onLoadMore={() => void masterpieces.loadMore()} loadingMore={masterpieces.loadingMore} onSeeAll={(r) => expand(MASTERPIECES_RAIL, r)} />
          )}
          {([[TRUE_STORIES_RAIL, trueStories], [APOCALYPTIC_RAIL, apocalyptic], [TRUE_CRIME_RAIL, trueCrime]] as const).map(([name, rail]) => visible(rail.media).length > 0 && (
            <MediaRail key={name} title={name} media={visible(rail.media)} onOpen={onOpen} onAction={onAction} revealId={name + type}
              loadMore={rail.hasMore ? () => void rail.loadMore() : null} loadingMore={rail.loadingMore} onSeeAll={(r) => expand(name, r)} />
          ))}
          {rails.map((rail) => (
            <MediaRail key={rail.name} title={rail.name} media={visible(rail.media)} onOpen={onOpen} onAction={onAction} revealId={rail.name + type}
              loadMore={() => void loadMoreRail(rail)} loadingMore={loadingRail === rail.name} onSeeAll={(r) => expand(rail.name, r)} />
          ))}
        </div>
      </div>
    )
  }

  const expandedPage = expanded && data ? (() => {
    const name = expanded.name
    const rail = rails.find((r) => r.name === name)
    const pick = {
      [NEW_RELEASES_RAIL]: { media: releases.media, loadingMore: releases.loadingMore, refreshing: releases.loading, onLoadMore: releases.hasMore ? releases.loadMore : null, onRefresh: releases.retry },
      [HOLIDAY_RAIL]: { media: holidayRail.media, loadingMore: holidayRail.loadingMore, refreshing: false, onLoadMore: holidayRail.hasMore ? () => void holidayRail.loadMore() : null, onRefresh: null },
      [MASTERPIECES_RAIL]: { media: masterpieces.media, loadingMore: masterpieces.loadingMore, refreshing: masterpieces.refreshing, onLoadMore: () => void masterpieces.loadMore(), onRefresh: refreshMasterpieces },
      [TASTE_RAIL]: { media: taste.media, loadingMore: taste.loadingMore, refreshing: tasteRefreshing, onLoadMore: taste.hasMore ? () => void taste.loadMore() : null, onRefresh: () => { if (!tasteRefreshing && !taste.loadingMore) setTasteVersion((v) => v + 1) } },
      [TRUE_STORIES_RAIL]: { media: trueStories.media, loadingMore: trueStories.loadingMore, refreshing: trueStories.refreshing, onLoadMore: trueStories.hasMore ? () => void trueStories.loadMore() : null, onRefresh: () => void trueStories.refresh(1) },
      [TRUE_CRIME_RAIL]: { media: trueCrime.media, loadingMore: trueCrime.loadingMore, refreshing: trueCrime.refreshing, onLoadMore: trueCrime.hasMore ? () => void trueCrime.loadMore() : null, onRefresh: () => void trueCrime.refresh(1) },
      [APOCALYPTIC_RAIL]: { media: apocalyptic.media, loadingMore: apocalyptic.loadingMore, refreshing: apocalyptic.refreshing, onLoadMore: apocalyptic.hasMore ? () => void apocalyptic.loadMore() : null, onRefresh: () => void apocalyptic.refresh(1) },
      [TOP_RAIL]: { media: data.trending, loadingMore: false, refreshing: false, onLoadMore: null, onRefresh: null },
    }[name] ?? { media: rail?.media ?? [], loadingMore: rail != null && loadingRail === rail.name, refreshing: false, onLoadMore: rail ? () => void loadMoreRail(rail) : null, onRefresh: null }
    const title = name === NEW_RELEASES_RAIL ? `Novità · ${releases.upcoming ? 'In arrivo' : 'Appena usciti'}` : name === HOLIDAY_RAIL ? holiday?.title ?? name : name
    return (
      <ExpandingPage source={expanded.origin} sourceCorner={17} onClosed={() => { setExpanded(null); onExpandedChange(false) }}
        sourceArt={<SeeAllChipArt label={name === MASTERPIECES_RAIL || name === TASTE_RAIL || name === HOLIDAY_RAIL ? 'Tutti' : 'Vedi tutto'} style={{ width: '100%', height: '100%', background: 'var(--page)' }} />}>
        {(close) => (
          <CatalogExpandedScreen title={title} media={visible(pick.media)} loadingMore={pick.loadingMore} refreshing={pick.refreshing} onDismiss={close}
            onOpen={onOpen} onAction={onAction} onLoadMore={pick.onLoadMore} onRefresh={pick.onRefresh}
            releaseDates={name === NEW_RELEASES_RAIL} paginationError={name === NEW_RELEASES_RAIL && releases.paginationError} />
        )}
      </ExpandingPage>
    )
  })() : null

  return (
    <div className="fill">
      {pull.indicator(150)}
      {content}
      {expandedPage}
    </div>
  )
}

/** Indeterminate LinearProgressIndicator. */
function IndeterminateBar() {
  return (
    <div style={{ height: 4, borderRadius: 2, background: '#3B161B', overflow: 'hidden', position: 'relative' }}>
      <motion.div animate={{ left: ['-40%', '100%'] }} transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
        style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', borderRadius: 2, background: 'var(--primary)' }} />
    </div>
  )
}
void LinearProgress

export function DiscoverScreen({ kind, onKind, chromeVisible, onOpen, onAction, onSearch, onFilters, onExpandedChange }: {
  kind: string; onKind: (k: string) => void; chromeVisible: boolean; onOpen: OpenMedia; onAction: (m: Media) => void
  onSearch: (r: Rect | null) => void; onFilters: (r: Rect | null) => void; onExpandedChange: (v: boolean) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [solid, setSolid] = useState(false)
  const previous = useRef(kind)
  const forward = kind === 'tv' && previous.current === 'movie' ? 1 : kind === 'movie' && previous.current === 'tv' ? -1 : 1
  useEffect(() => { previous.current = kind }, [kind])
  useEffect(() => {
    const el = scroller.current
    const update = () => setSolid((scroller.current?.scrollTop ?? 0) > 8)
    const id = window.setInterval(update, 150)
    el?.addEventListener('scroll', update, { passive: true })
    return () => { window.clearInterval(id); el?.removeEventListener('scroll', update) }
  }, [kind])
  return (
    <div className="fill">
      <AnimatePresence initial={false} custom={forward}>
        <motion.div key={kind} className="fill"
          initial={{ opacity: 0, x: `${forward * 20}%` }}
          animate={{ opacity: 1, x: 0, transition: { opacity: tween(260), x: tween(420, emphasized) } }}
          exit={{ opacity: 0, x: `${-forward * 12.5}%`, transition: { opacity: tween(140), x: tween(320, emphasized) } }}>
          <CatalogScreen kind={kind} onOpen={onOpen} onAction={onAction} onFilters={onFilters} onExpandedChange={onExpandedChange} scroller={scroller} />
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {chromeVisible && (
          <motion.div key="chrome" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: tween(200) }} exit={{ opacity: 0, transition: tween(120) }}
            className="status-pad" style={{ position: 'absolute', left: 0, right: 0, top: 0, paddingBottom: 12, zIndex: 3 }}>
            <motion.div className="fill" initial={false} animate={{ opacity: solid ? 1 : 0 }} transition={tween(280)} style={{ background: 'rgba(10,11,16,.95)' }} />
            <div className="row" style={{ position: 'relative', padding: '6px 16px 0 20px' }}>
              <span className="grow" style={{ color: '#fff', fontSize: 30, fontWeight: 900, letterSpacing: -0.9, lineHeight: '40px' }}>Scopri</span>
              <GlassIconButton icon="search" label="Cerca" onClick={onSearch} />
              <div style={{ width: 10 }} />
              <GlassIconButton icon="tune" label="Piattaforma e genere" onClick={onFilters} />
            </div>
            <SegmentedPills options={['Film', 'Serie TV']} selected={kind === 'tv' ? 1 : 0} style={{ position: 'relative', margin: '12px 20px 0' }} onSelect={(i) => onKind(i === 1 ? 'tv' : 'movie')} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
