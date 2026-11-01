import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { today } from '../../../shared/dates.ts'
import { isSeries, type LibraryEntry, type Media } from '../../../shared/model.ts'
import {
  currentHoliday, DiscoveryRail, FeaturedCarousel, HolidayRail, MediaRail, openFrom, posterUrl, RailSkeleton, ReactionBadge,
  PosterStatusBadges, releaseLabel, TasteRail,
} from '../components/cards.tsx'
import { emphasized, tween } from '../components/motion.ts'
import { PullToRefresh } from '../components/Pull.tsx'
import {
  alpha, C, DropdownMenu, EmptyState, FilterChip, GlassIconButton, Icon, LoadingSkeleton, MetaPill, OutlinedButton,
  Pressable, RemoteImage, SearchField, SegmentedPills, Spinner, TextButton, TonalIconButton,
} from '../components/ui.tsx'
import { APOCALYPTIC, HOLIDAY, MASTERPIECES, NEW_RELEASES, TASTE, TOP10, TRUE_CRIME, TRUE_STORIES, useCatalog, type Catalog } from '../lib/catalog.ts'
import { close, open, setDiscoverKind, useNav } from '../lib/nav.ts'
import { useData, type LibrarySort } from '../lib/store.ts'
import { openActions, rating } from '../lib/ui.ts'

const KINDS: { type: 'movie' | 'tv'; label: string }[] = [{ type: 'movie', label: 'Film' }, { type: 'tv', label: 'Serie TV' }]

export function DiscoverScreen() {
  const kind = useNav((s) => s.discoverKind)
  const index = KINDS.findIndex((k) => k.type === kind)
  const previous = useRef(index)
  const forward = index > previous.current
  useEffect(() => { previous.current = index }, [index])
  const [scrolled, setScrolled] = useState(false)
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <AnimatePresence initial={false} custom={forward}>
        <motion.div key={kind} custom={forward} style={{ position: 'absolute', inset: 0 }}
          variants={{
            enter: (f: boolean) => ({ opacity: 0, x: f ? '20%' : '-20%' }),
            center: { opacity: 1, x: 0, transition: { opacity: tween(260), x: tween(420, emphasized) } },
            exit: (f: boolean) => ({ opacity: 0, x: f ? '-12.5%' : '12.5%', transition: { opacity: tween(140), x: tween(320, emphasized) } }),
          }}
          initial="enter" animate="center" exit="exit">
          <CatalogScreen type={kind} onScrolled={setScrolled} />
        </motion.div>
      </AnimatePresence>
      <motion.div initial={false} animate={{ backgroundColor: `rgba(10,11,16,${scrolled ? 0.95 : 0})` }} transition={tween(280)}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 'var(--status-top)', paddingBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 16px 0 20px' }}>
          <div style={{ flex: 1, color: '#fff', fontSize: 30, fontWeight: 900, letterSpacing: -0.9, lineHeight: '36px' }}>Scopri</div>
          <GlassIconButton icon="search" label="Cerca" onClick={(rect) => open({ kind: 'search' }, { rect, corner: 22 })} />
          <div style={{ width: 10 }} />
          <GlassIconButton icon="tune" label="Piattaforma e genere" onClick={(rect) => open({ kind: 'filters', type: kind }, { rect, corner: 22 })} />
        </div>
        <SegmentedPills options={KINDS.map((k) => k.label)} selected={index} onSelect={(i) => setDiscoverKind(KINDS[i].type)} style={{ margin: '12px 20px 0' }} />
      </motion.div>
    </div>
  )
}

function CatalogScreen({ type, onScrolled }: { type: 'movie' | 'tv'; onScrolled: (v: boolean) => void }) {
  const catalog = useCatalog(type)
  const data = useData()
  const scroller = useRef<HTMLDivElement>(null)
  const stackOpen = useNav((s) => s.stack.some((e) => e.page.kind === 'detail' && !e.closing))
  useEffect(() => { void catalog.load() }, [catalog])
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const on = () => onScrolled(el.scrollTop > 8)
    on()
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  }, [catalog.loaded])
  const hidden = useMemo(() => new Set([...data.library.values()].filter((e) => e.state === 'hidden').map((e) => e.media.id)), [data])
  const visible = (key: string) => (catalog.rail(key)?.media ?? []).filter((m) => !hidden.has(m.id))
  const seeAll = (key: string) => (rect: DOMRect | null) => {
    const label = key === MASTERPIECES || key === TASTE || key === HOLIDAY ? 'Tutti' : 'Vedi tutto'
    open({ kind: 'catalog', title: key, type, rail: key }, { rect, corner: 17, art: 'seeAll', label })
  }
  const holiday = currentHoliday(today())
  const liked = catalog.likedSeeds().length > 0

  if (catalog.error) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState icon="refresh" title="Catalogo non disponibile" body={catalog.error} action="Riprova" onAction={() => void catalog.load(true)} />
      </div>
    )
  }
  if (!catalog.loaded) {
    return (
      <div style={{ position: 'absolute', inset: 0, paddingTop: 'calc(var(--status-top) + 136px)' }}>
        <LoadingSkeleton style={{ margin: '0 20px', height: 500, borderRadius: 30 }} />
        <div style={{ height: 26 }} />
        <RailSkeleton title={null} />
      </div>
    )
  }
  const featured = [...catalog.featured, ...(catalog.rail(TOP10)?.media ?? [])]
    .filter((m, i, all) => !hidden.has(m.id) && !!m.backdrop && all.findIndex((x) => x.id === m.id) === i)
    .slice(0, 8)
  const paged = (key: string) => {
    const r = catalog.rail(key)
    return { loadMore: r?.hasMore ? () => void catalog.loadMore(key) : null, loadingMore: r?.loadingMore ?? false }
  }
  return (
    <PullToRefresh refreshing={catalog.refreshing} onRefresh={() => void catalog.load(true)} indicatorTop={150} scrollRef={scroller}>
      <div style={{ paddingTop: 'calc(var(--status-top) + 136px)', paddingBottom: 132, display: 'flex', flexDirection: 'column', gap: 28 }}>
        {featured.length > 0 && <FeaturedCarousel media={featured} type={type} paused={stackOpen} />}
        <div style={{ padding: '0 20px' }}>
          <Pressable pressed={0.97} className="glass" onClick={(rect) => open({ kind: 'filters', type }, { rect, corner: 20 })}
            style={{ height: 56, borderRadius: 20, display: 'flex', alignItems: 'center', padding: '0 16px' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: alpha(C.accent, 0.16), display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Icon name="tune" size={19} color={C.accent} />
            </div>
            <div style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
              <div style={{ color: C.ink, fontWeight: 700, fontSize: 15, lineHeight: '22px' }}>Filtra per piattaforma e genere</div>
              <div style={{ color: C.muted, fontSize: 12, lineHeight: '18px' }}>Netflix, Prime Video, Disney+ e altri</div>
            </div>
            <Icon name="chevron_right" color={C.muted} />
          </Pressable>
        </div>
        {holiday && visible(HOLIDAY).length > 0 && (
          <HolidayRail holiday={holiday} media={visible(HOLIDAY)} onSeeAll={seeAll(HOLIDAY)} onLoadMore={paged(HOLIDAY).loadMore} loadingMore={paged(HOLIDAY).loadingMore} />
        )}
        <NewReleasesSection catalog={catalog} hidden={hidden} onSeeAll={seeAll(NEW_RELEASES)} />
        <MediaRail title={TOP10} media={visible(TOP10)} ranked onSeeAll={seeAll(TOP10)} />
        {liked && visible(TASTE).length > 0 && (
          <TasteRail media={visible(TASTE)} onSeeAll={seeAll(TASTE)} onLoadMore={() => void catalog.loadMore(TASTE)} loadingMore={paged(TASTE).loadingMore} hasMore={catalog.rail(TASTE)?.hasMore ?? false} />
        )}
        {visible(MASTERPIECES).length > 0 && (
          <DiscoveryRail media={visible(MASTERPIECES)} onLoadMore={() => void catalog.loadMore(MASTERPIECES)} loadingMore={paged(MASTERPIECES).loadingMore} onSeeAll={seeAll(MASTERPIECES)} />
        )}
        {[TRUE_STORIES, APOCALYPTIC, TRUE_CRIME].map((key) => visible(key).length > 0 && (
          <MediaRail key={key} title={key} media={visible(key)} {...paged(key)} onSeeAll={seeAll(key)} />
        ))}
        {catalog.order.map((key) => (
          <MediaRail key={key} title={key} media={visible(key)} loadMore={() => void catalog.loadMore(key)} loadingMore={catalog.rail(key)?.loadingMore ?? false} onSeeAll={seeAll(key)} />
        ))}
      </div>
    </PullToRefresh>
  )
}

function NewReleasesSection({ catalog, hidden, onSeeAll }: { catalog: Catalog; hidden: Set<string>; onSeeAll: (rect: DOMRect | null) => void }) {
  const rail = catalog.rail(NEW_RELEASES)
  const visible = (rail?.media ?? []).filter((m) => !hidden.has(m.id))
  const loading = rail?.refreshing ?? true
  const loadMore = () => void catalog.loadMore(NEW_RELEASES)
  return (
    <MediaRail title={NEW_RELEASES} media={visible} releaseDates onSeeAll={visible.length ? onSeeAll : null}
      loadMore={rail?.hasMore && !loading && visible.length ? loadMore : null} loadingMore={rail?.loadingMore ?? false}
      header={
        <div style={{ padding: '8px 20px' }}>
          <div style={{ color: C.muted, fontSize: 12 }}>{catalog.type === 'movie' ? 'Uscite italiane · cinema e digitale' : 'Serie in Italia · date di prima TV'}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <FilterChip selected={!catalog.upcoming} label="Appena usciti" onClick={() => catalog.setUpcoming(false)} />
            <FilterChip selected={catalog.upcoming} label="In arrivo" onClick={() => catalog.setUpcoming(true)} />
          </div>
          {rail?.paginationError && <TextButton onClick={loadMore}>Caricamento non riuscito · Riprova</TextButton>}
          {loading ? <IndeterminateBar /> : catalog.newReleasesError ? (
            <TextButton onClick={() => void catalog.loadNewReleases()}>Caricamento non riuscito · Riprova</TextButton>
          ) : visible.length === 0 ? (
            <>
              <div style={{ color: C.muted }}>{catalog.upcoming ? 'Nessuna uscita confermata per l’Italia nei dati disponibili.' : 'Nessuna novità disponibile in Italia in questa selezione.'}</div>
              {rail?.hasMore && <TextButton onClick={loadMore} disabled={rail.loadingMore}>{rail.loadingMore ? 'Caricamento…' : 'Cerca altre uscite'}</TextButton>}
            </>
          ) : null}
        </div>
      } />
  )
}

/** LinearProgressIndicator without progress. */
export function IndeterminateBar({ color = C.primary }: { color?: string }) {
  return (
    <div style={{ height: 4, borderRadius: 4, background: alpha(color, 0.24), overflow: 'hidden', margin: '12px 0', position: 'relative' }}>
      <motion.div style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', borderRadius: 4, background: color }}
        animate={{ left: ['-40%', '100%'] }} transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }} />
    </div>
  )
}

// --- cards shared by grids ------------------------------------------------------------------

export function SearchPosterCard({ media, entry, releaseDates = false, onLongPress, onOpen }: { media: Media; entry: LibraryEntry | undefined; releaseDates?: boolean; onLongPress?: () => void; onOpen?: () => void }) {
  const art = useRef<HTMLDivElement>(null)
  const url = posterUrl(media)
  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <Pressable onClick={() => (onOpen ? onOpen() : openFrom(media, art.current, url, 18))} onLongPress={onLongPress} style={{ position: 'relative' }}>
        <div ref={art} style={{ width: '100%', aspectRatio: '0.68', borderRadius: 18, overflow: 'hidden' }}><RemoteImage url={url} style={{ width: '100%', height: '100%' }} /></div>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 18, border: '1px solid rgba(255,255,255,.07)', pointerEvents: 'none' }} />
        {media.rating > 0 && <MetaPill text={rating(media.rating)} icon="star" tint={C.amber} style={{ position: 'absolute', top: 7, left: 7 }} />}
        <PosterStatusBadges entry={entry} />
      </Pressable>
      <div className="ellipsis" style={{ color: C.ink, fontWeight: 700, fontSize: 14, padding: '8px 2px 0' }}>{media.title}</div>
      <div className="ellipsis" style={{ color: C.muted, fontSize: 12, padding: '2px 0 0 2px' }}>{releaseDates ? releaseLabel(media) : `${media.year} · ${isSeries(media) ? 'Serie TV' : 'Film'}`}</div>
    </div>
  )
}

function CatalogExpandedRow({ media, entry, releaseDates }: { media: Media; entry: LibraryEntry | undefined; releaseDates: boolean }) {
  const art = useRef<HTMLDivElement>(null)
  const url = posterUrl(media)
  return (
    <Pressable onClick={() => openFrom(media, art.current, url, 15)} onLongPress={() => openActions(media)}
      style={{ background: C.panel, borderRadius: 22, padding: 10, display: 'flex', alignItems: 'center' }}>
      <div style={{ width: 76, height: 110, position: 'relative', flex: 'none' }}>
        <div ref={art} style={{ position: 'absolute', inset: 0, borderRadius: 15, overflow: 'hidden' }}><RemoteImage url={url} style={{ width: '100%', height: '100%' }} /></div>
        {entry?.liked != null && <ReactionBadge liked={entry.liked} style={{ position: 'absolute', top: 3, right: 3, transform: 'scale(.78)', transformOrigin: 'top right' }} />}
      </div>
      <div style={{ marginLeft: 14, flex: 1, minWidth: 0 }}>
        <div className="clamp2" style={{ color: C.ink, fontWeight: 700, fontSize: 17 }}>{media.title}</div>
        <div style={{ color: C.accent, fontSize: 13, marginTop: 5 }}>{releaseDates ? releaseLabel(media) : `${media.year}  ·  ★ ${rating(media.rating)}`}</div>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 5 }}>{isSeries(media) ? 'Serie TV' : 'Film'}</div>
      </div>
      {(entry?.state === 'saved' || entry?.state === 'progress' || entry?.state === 'watched') && (
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(26,27,33,.902)', padding: 9, flex: 'none' }}>
          <Icon name={entry.state === 'watched' ? 'check' : 'play'} size={20} color={C.accent} />
        </div>
      )}
    </Pressable>
  )
}

export const SORTS: { id: LibrarySort; label: string }[] = [
  { id: 'ORIGINAL', label: 'Ordine sezione' }, { id: 'TITLE', label: 'Titolo A–Z' }, { id: 'NEWEST', label: 'Più recenti' },
  { id: 'OLDEST', label: 'Meno recenti' }, { id: 'RATING', label: 'Valutazione' },
]

const byTitle = (a: Media, b: Media) => a.title.toLowerCase().localeCompare(b.title.toLowerCase(), 'it')

export function sortMedia(list: Media[], sort: LibrarySort): Media[] {
  const out = [...list]
  switch (sort) {
    case 'ORIGINAL': return out
    case 'TITLE': return out.sort(byTitle)
    case 'NEWEST': return out.sort((a, b) => (a.releaseDate === b.releaseDate ? byTitle(a, b) : a.releaseDate < b.releaseDate ? 1 : -1))
    case 'OLDEST': return out.sort((a, b) => {
      const x = a.releaseDate || '9999-99-99', y = b.releaseDate || '9999-99-99'
      return x === y ? byTitle(a, b) : x < y ? -1 : 1
    })
    case 'RATING': return out.sort((a, b) => ((b.rating || 0) - (a.rating || 0)) || byTitle(a, b))
  }
}

/** CatalogExpandedScreen: the whole rail with search, sort and list or grid. */
export function CatalogExpandedPage({ pageKey, type, rail: key }: { pageKey: number; type: string; rail: string }) {
  const catalog = useCatalog(type)
  const data = useData()
  const rail = catalog.rail(key)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<LibrarySort>('ORIGINAL')
  const [grid, setGrid] = useState(false)
  const [menu, setMenu] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const releaseDates = key === NEW_RELEASES
  const holiday = currentHoliday(today())
  const title = key === NEW_RELEASES ? `Novità · ${catalog.upcoming ? 'In arrivo' : 'Appena usciti'}` : key === HOLIDAY ? holiday?.title ?? key : key
  const hidden = new Set([...data.library.values()].filter((e) => e.state === 'hidden').map((e) => e.media.id))
  const media = (rail?.media ?? []).filter((m) => !hidden.has(m.id))
  const visible = sortMedia(media.filter((m) => m.title.toLowerCase().includes(query.trim().toLowerCase())), sort)
  const canLoad = !!rail && (key === MASTERPIECES || catalog.order.includes(key) || (key !== TOP10 && rail.hasMore))
  const loadMore = canLoad ? () => void catalog.loadMore(key) : null

  // Novità keeps loading as the list reaches its end.
  useEffect(() => {
    const el = scroller.current
    if (!el || !releaseDates) return
    const check = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400 && rail && !rail.loadingMore && !rail.refreshing && !rail.paginationError && !query.trim()) loadMore?.()
    }
    el.addEventListener('scroll', check, { passive: true })
    check()
    return () => el.removeEventListener('scroll', check)
  }, [rail, query, grid])

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg }}>
      <PullToRefresh refreshing={rail?.refreshing ?? false} onRefresh={() => void catalog.refreshRail(key)} indicatorTop={92} enabled={catalog.canRefresh(key)} scrollRef={scroller}
        style={{ top: 'calc(var(--status-top) + 182px)', bottom: 'var(--nav-bottom)' }}>
        <div style={{ padding: '12px 20px' }}>
          {visible.length === 0 ? (
            <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>Nessun titolo corrisponde alla ricerca.</div>
          ) : grid ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 18 }}>
              {visible.map((m) => <SearchPosterCard key={m.id} media={m} entry={data.library.get(m.id)} releaseDates={releaseDates} />)}
              {loadMore && <div style={{ gridColumn: '1 / -1' }}><CatalogLoadMoreButton onClick={loadMore} loading={rail?.loadingMore ?? false} error={rail?.paginationError ?? false} /></div>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visible.map((m) => <CatalogExpandedRow key={m.id} media={m} entry={data.library.get(m.id)} releaseDates={releaseDates} />)}
              {loadMore && <CatalogLoadMoreButton onClick={loadMore} loading={rail?.loadingMore ?? false} error={rail?.paginationError ?? false} />}
            </div>
          )}
        </div>
      </PullToRefresh>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 'var(--status-top)', padding: 'var(--status-top) 20px 0', background: C.bg }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0' }}>
          <TonalIconButton icon="back" label="Indietro" onClick={() => close(pageKey)} />
          <div style={{ marginLeft: 14, flex: 1, minWidth: 0 }}>
            <div className="t-headline-medium ellipsis" style={{ color: C.ink }}>{title}</div>
            <div style={{ color: C.accent, fontWeight: 700 }}>{visible.length} {visible.length === 1 ? 'titolo' : 'titoli'}</div>
          </div>
          <div style={{ position: 'relative' }}>
            <Pressable onClick={() => setMenu(true)} aria-label="Opzioni di visualizzazione" style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="more_vert" color={C.muted} />
            </Pressable>
            <DropdownMenu open={menu} onDismiss={() => setMenu(false)} items={[
              { label: 'Visualizzazione elenco', leading: 'list', onClick: () => { setGrid(false); setMenu(false) }, trailing: !grid ? <Icon name="check" color={C.muted} /> : undefined },
              { label: 'Visualizzazione griglia', leading: 'grid', onClick: () => { setGrid(true); setMenu(false) }, trailing: grid ? <Icon name="check" color={C.muted} /> : undefined },
            ]} />
          </div>
        </div>
        <SearchField value={query} onChange={setQuery} placeholder="Cerca nella sezione" style={{ marginTop: 8 }} />
        <div className="hscroll" style={{ gap: 7, marginTop: 10 }}>
          {SORTS.map((s) => <FilterChip key={s.id} selected={sort === s.id} label={s.label} onClick={() => setSort(s.id)} />)}
        </div>
      </div>
    </div>
  )
}

function CatalogLoadMoreButton({ onClick, loading, error }: { onClick: () => void; loading: boolean; error: boolean }) {
  return (
    <div style={{ paddingTop: 6 }}>
      <OutlinedButton onClick={onClick} disabled={loading} style={{ height: 52, borderRadius: 18, width: '100%' }}>
        {loading ? <Spinner size={20} color={C.primary} stroke={3} /> : error ? 'Caricamento non riuscito · Riprova' : 'Carica altri'}
      </OutlinedButton>
    </div>
  )
}

