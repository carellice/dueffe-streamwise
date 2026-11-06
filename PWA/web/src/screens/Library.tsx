// LibraryScreen, LibrarySectionContent, FollowingContent, sagas and CatalogExpandedScreen of MainActivity.kt.
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LibraryEntry, Media, Person } from '../../../shared/model.ts'
import { isSeries } from '../../../shared/model.ts'
import { shortLabel, sortFollows, sortPeople, upcomingDate } from '../../../shared/follows.ts'
import { addReleaseToCalendar } from '../lib/calendar.ts'
import { todayRome } from '../../../shared/dates.ts'
import { useBackHandler } from '../lib/back.ts'
import { byState, entryOf, follows, people, prefs, setPrefs, useStore } from '../lib/store.ts'
import { tmdb } from '../lib/tmdb.ts'
import { filterIncludes, SubscriptionFilterBar, SubscriptionsPanel, useSubscriptionData, useSubscriptionFilter } from '../lib/subscriptions.tsx'
import { emphasized, spring, tween } from '../components/motion.ts'
import { AnimatedCount, ChipTabs, GlassIconButton, Icon, Press, RemoteImage, Reveal, SectionHeader, SegmentedPills, Spinner, rating, type Rect } from '../components/ui.tsx'
import { ArtworkImage, EmptyState, ReactionBadge, artSource, posterUrl, releaseLabel, type OpenMedia } from '../components/cards.tsx'
import { PosterGrid, SearchPosterCard } from '../components/grid.tsx'
import { FilterChip } from '../lib/subscriptions.tsx'
import { PeopleRail } from './Detail.tsx'

export type LibrarySection = 'PROGRESS' | 'SAVED' | 'WATCHED' | 'FOLLOWING' | 'SERVICES' | 'SAGAS' | 'HIDDEN'
const SECTIONS: [LibrarySection, string][] = [['PROGRESS', 'In corso'], ['SAVED', 'Da vedere'], ['WATCHED', 'Visti'], ['FOLLOWING', 'Seguiti'], ['SERVICES', 'Abbonamenti'], ['SAGAS', 'Saghe'], ['HIDDEN', 'Nascosti']]
const HOME: Record<string, { title: string; state: string }> = {
  PROGRESS: { title: 'Continua a guardare', state: 'progress' },
  SAVED: { title: 'La mia lista', state: 'saved' },
  WATCHED: { title: 'Già visti', state: 'watched' },
}

export type SortKey = 'ORIGINAL' | 'TITLE' | 'NEWEST' | 'OLDEST' | 'RATING'
export const SORTS: [SortKey, string][] = [['ORIGINAL', 'Ordine sezione'], ['TITLE', 'Titolo A–Z'], ['NEWEST', 'Più recenti'], ['OLDEST', 'Meno recenti'], ['RATING', 'Valutazione']]

const lower = (s: string) => s.toLocaleLowerCase('it-IT')
const byTitle = (a: Media, b: Media) => (lower(a.title) < lower(b.title) ? -1 : lower(a.title) > lower(b.title) ? 1 : 0)

export function sortMedia<T>(list: T[], sort: SortKey, media: (t: T) => Media): T[] {
  const out = [...list]
  switch (sort) {
    case 'ORIGINAL': return out
    case 'TITLE': return out.sort((a, b) => byTitle(media(a), media(b)))
    case 'NEWEST': return out.sort((a, b) => (media(a).releaseDate < media(b).releaseDate ? 1 : media(a).releaseDate > media(b).releaseDate ? -1 : byTitle(media(a), media(b))))
    case 'OLDEST': return out.sort((a, b) => {
      const x = media(a).releaseDate || '9999-99-99'
      const y = media(b).releaseDate || '9999-99-99'
      return x < y ? -1 : x > y ? 1 : byTitle(media(a), media(b))
    })
    case 'RATING': return out.sort((a, b) => media(b).rating - media(a).rating || byTitle(media(a), media(b)))
  }
}

export function continueWatchingOrder(list: LibraryEntry[]): LibraryEntry[] {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.nextSeason - a.nextSeason || b.nextEpisode - a.nextEpisode || byTitle(a.media, b.media))
}

export type SagaCollection = { id: number; name: string; movies: Media[] }

/** Material 3 DropdownMenu. */
export function DropdownMenu({ open, onDismiss, children, align = 'right', radius = 4 }: { open: boolean; onDismiss: () => void; children: React.ReactNode; align?: 'left' | 'right'; radius?: number }) {
  useBackHandler(open, onDismiss)
  return (
    <AnimatePresence>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 29 }} onClick={onDismiss} />
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={tween(150)}
            style={{ position: 'absolute', [align]: 0, top: '100%', zIndex: 30, minWidth: 200, background: 'var(--surface-high)', borderRadius: radius, padding: '8px 0', boxShadow: '0 4px 12px rgba(0,0,0,.5)', transformOrigin: `top ${align}` }}>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function MenuItem({ label, onClick, leading, trailing }: { label: string; onClick: () => void; leading?: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="row" onClick={onClick} style={{ height: 48, padding: '0 12px', gap: 12, cursor: 'pointer', fontSize: 14, letterSpacing: 0.1, whiteSpace: 'nowrap', color: 'var(--ink)' }}>
      {leading}
      <span className="grow">{label}</span>
      {trailing}
    </div>
  )
}

function ExpandedLibraryRow({ entry, open, actions }: { entry: LibraryEntry; open: OpenMedia; actions: (m: Media) => void }) {
  const media = entry.media
  const art = useRef<HTMLDivElement | null>(null)
  const status = entry.state === 'progress' && isSeries(media) ? `Prossimo: S${entry.nextSeason} · E${entry.nextEpisode}` : isSeries(media) ? 'Serie TV' : 'Film'
  return (
    <Press className="glass" style={{ borderRadius: 22, flex: 'none' }} onClick={() => open(media, artSource(art.current, posterUrl(media), 15))} onLongPress={() => actions(media)}>
      <div className="row" style={{ padding: 10 }}>
        <div style={{ width: 76, height: 110, position: 'relative', flex: 'none' }}>
          <ArtworkImage media={media} corner={15} style={{ position: 'absolute', inset: 0 }} onEl={(el) => { art.current = el }} />
          {entry.liked != null && <ReactionBadge liked={entry.liked} style={{ position: 'absolute', top: 3, right: 3, transform: 'scale(.78)' }} />}
          {entry.pinned && <div className="center" style={{ position: 'absolute', left: 3, bottom: 3, width: 28, height: 28, borderRadius: '50%', background: 'var(--red)' }}><Icon name="pushPin" size={14} color="#fff" /></div>}
        </div>
        <div className="grow col" style={{ paddingLeft: 14 }}>
          <span className="clamp2" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 17, lineHeight: '24px' }}>{media.title}</span>
          <span style={{ color: 'var(--secondary)', fontSize: 13, marginTop: 5 }}>{media.year}  ·  ★ {rating(media.rating)}</span>
          <span style={{ color: 'var(--muted)', fontSize: 13, marginTop: 5 }}>{status}</span>
        </div>
        <div className="center" style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(26,27,33,.9)', flex: 'none' }}>
          <Icon name={entry.state === 'watched' ? 'check' : 'play'} size={20} color="var(--secondary)" />
        </div>
      </div>
    </Press>
  )
}

function LibrarySectionContent({ section, onOpen, onAction, onDiscover }: { section: string; onOpen: OpenMedia; onAction: (m: Media) => void; onDiscover: () => void }) {
  const { version, data: store } = useStore()
  const home = HOME[section]
  const subscriptionData = useSubscriptionData()
  const active = new Set(store?.prefs.subscriptions ?? [])
  const [filter, setFilter] = useSubscriptionFilter(home.state)
  const filterSubscriptions = section === 'SAVED' || section === 'PROGRESS'
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const sort = (SORTS.find(([k]) => k === prefs().librarySort[home.state])?.[0] ?? 'TITLE') as SortKey
  const grid = prefs().libraryGrid[home.state] === true
  const [menu, setMenu] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const sectionEntries = useMemo(() => byState(home.state), [section, version])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = sectionEntries.filter((e) => e.media.title.toLowerCase().includes(q) && (type === 'all' || e.media.mediaType === type) &&
      (!filterSubscriptions || filterIncludes(filter, e.media, subscriptionData, active)))
    const sorted = sortMedia(filtered, sort, (e) => e.media)
    return section === 'PROGRESS' ? continueWatchingOrder(sorted) : [...sorted].sort((a, b) => Number(b.pinned) - Number(a.pinned))
  }, [sectionEntries, query, type, sort, filter, subscriptionData.availability, store?.prefs.subscriptions])
  const open: OpenMedia = (media, source) => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    window.setTimeout(() => onOpen(media, source), 80)
  }
  if (sectionEntries.length === 0) {
    return (
      <div className="fill scroll" style={{ paddingBottom: 120 }}>
        {section === 'PROGRESS' && <EmptyState icon="play" title="Nessuna serie in corso" body="Quando inizi una serie e segni un episodio come visto, la ritrovi qui pronta a ripartire." action="Trova qualcosa da guardare" onAction={onDiscover} />}
        {section === 'SAVED' && <EmptyState icon="add" title="La tua lista è vuota" body="Salva film e serie che vuoi vedere: li ritrovi qui, filtrabili per abbonamento." action="Esplora il catalogo" onAction={onDiscover} />}
        {section === 'WATCHED' && <EmptyState icon="check" title="Ancora nessun titolo visto" body="Segna film e serie come visti e lascia un voto: i consigli diventeranno più tuoi." />}
      </div>
    )
  }
  return (
    <div className="fill col" style={{ padding: '0 20px' }}>
      <div className="row">
        <div className="glass row grow" style={{ height: 48, borderRadius: 24, padding: '0 6px 0 16px' }}>
          <Icon name="search" size={19} color="var(--muted)" />
          <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Cerca in ${home.title.toLowerCase()}`}
            style={{ flex: 1, margin: '0 10px', fontSize: 15, lineHeight: '20px' }} />
          <AnimatePresence>
            {query !== '' && (
              <motion.button key="clear" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0 }} transition={spring(1, 1500)}
                aria-label="Cancella ricerca" className="center" onClick={() => setQuery('')} style={{ width: 36, height: 36 }}>
                <Icon name="close" size={18} color="var(--muted)" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <div style={{ position: 'relative', marginLeft: 8 }}>
          <GlassIconButton icon="tune" label="Ordina" size={48} onClick={() => setMenu(true)} />
          <DropdownMenu open={menu} onDismiss={() => setMenu(false)} radius={18}>
            <div style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 900, letterSpacing: 1.4, padding: '8px 16px' }}>ORDINA PER</div>
            {SORTS.map(([key, label]) => (
              <MenuItem key={key} label={label} trailing={sort === key ? <Icon name="check" color="var(--accent)" /> : null}
                onClick={() => { void setPrefs({ librarySort: { ...prefs().librarySort, [home.state]: key } }); setMenu(false); list.current?.querySelector('.scroll')?.scrollTo({ top: 0 }) }} />
            ))}
          </DropdownMenu>
        </div>
        <GlassIconButton icon={grid ? 'list' : 'grid'} label={grid ? 'Visualizzazione elenco' : 'Visualizzazione griglia'} size={48} style={{ marginLeft: 8 }}
          onClick={() => void setPrefs({ libraryGrid: { ...prefs().libraryGrid, [home.state]: !grid } })} />
      </div>
      {section === 'WATCHED' && <SegmentedPills options={['Tutto', 'Film', 'Serie']} selected={['all', 'movie', 'tv'].indexOf(type)} height={40} style={{ marginTop: 12 }} onSelect={(i) => setType(['all', 'movie', 'tv'][i])} />}
      {filterSubscriptions && <SubscriptionFilterBar filter={filter} onChange={setFilter} style={{ marginTop: 10 }} />}
      <div ref={list} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={String(grid)} className="fill col" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1, transition: { opacity: tween(220), scale: tween(260) } }} exit={{ opacity: 0, transition: tween(120) }}>
            {visible.length === 0 ? <div className="grow center" style={{ color: 'var(--muted)', fontSize: 16 }}>Nessun titolo corrisponde ai filtri.</div>
              : grid ? <PosterGrid media={visible.map((e) => e.media)} onOpen={open} onLongPress={onAction} padding="14px 0 132px" />
                : (
                  <div className="scroll col" style={{ flex: 1, gap: 10, padding: '14px 0 132px' }}>
                    {visible.map((entry) => (
                      <motion.div key={entry.media.id} layout transition={spring(1, 400)}><ExpandedLibraryRow entry={entry} open={open} actions={onAction} /></motion.div>
                    ))}
                  </div>
                )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function FollowingContent({ onOpen, onAction, onOpenPerson }: { onOpen: OpenMedia; onAction: (m: Media) => void; onOpenPerson: (p: Person, rect: Rect | null) => void }) {
  useStore()
  const today = todayRome()
  const list = sortFollows(follows(), today)
  const persons = dedupePeople(sortPeople(people()).map((f) => f.person))
  if (list.length === 0 && persons.length === 0) {
    return <div className="fill scroll"><EmptyState icon="notificationsNone" title="Non segui ancora nulla" body="Tocca “Segui” nella scheda di un film, di una serie, di un attore o di un regista: ti avviserò quando esce qualcosa di nuovo." /></div>
  }
  return (
    <div className="fill scroll col" style={{ gap: 10, padding: '4px 0 132px' }}>
      {persons.length > 0 && <PeopleRail people={persons} title="Persone" topPadding={0} onPersonClick={onOpenPerson} />}
      {list.length > 0 && <SectionHeader title="Titoli" eyebrow="Uscite e nuovi episodi" style={{ paddingTop: 8, paddingBottom: 4 }} />}
      {list.map((follow) => {
        const media = follow.media
        return (
          <motion.div key={media.id} layout transition={spring(1, 400)} style={{ padding: '0 20px' }}>
            <Press className="glass row" style={{ borderRadius: 22, padding: 10 }} onClick={() => onOpen(media, null)} onLongPress={() => onAction(media)}>
              <RemoteImage url={media.poster || media.backdrop} style={{ width: 62, height: 90, borderRadius: 14, flex: 'none' }} />
              <div className="grow col" style={{ padding: '0 14px' }}>
                <span className="clamp2" style={{ color: 'var(--ink)', fontWeight: 800, fontSize: 16, lineHeight: '22px' }}>{media.title}</span>
                <span style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{isSeries(media) ? 'Serie TV' : 'Film'}</span>
                <div className="row" style={{ marginTop: 8 }}>
                  <Icon name="notifications" size={15} color="var(--amber)" />
                  <span className="ellipsis" style={{ color: 'var(--amber)', fontSize: 12, fontWeight: 700, marginLeft: 5 }}>{shortLabel(follow, today)}</span>
                </div>
              </div>
              {upcomingDate(follow, today) !== ''
                ? <Press pressed={0.9} aria-label="Aggiungi al calendario" className="center" style={{ width: 44, height: 44, flex: 'none' }} onClick={() => addReleaseToCalendar(follow, upcomingDate(follow, today))}><Icon name="calendar" color="var(--amber)" /></Press>
                : <Icon name="chevronRight" color="var(--muted)" />}
            </Press>
          </motion.div>
        )
      })}
    </div>
  )
}

const dedupePeople = (list: Person[]) => [...new Map(list.map((p) => [p.id, p])).values()]

function SagaCollectionCard({ collection, onOpen }: { collection: SagaCollection; onOpen: (c: SagaCollection, el: HTMLElement | null) => void }) {
  const cover = collection.movies[0]
  const ref = useRef<HTMLDivElement>(null)
  return (
    <Press onClick={() => onOpen(collection, ref.current)} style={{ borderRadius: 22, background: 'var(--raised)', position: 'relative', aspectRatio: '0.68', overflow: 'hidden' }}>
      <div ref={ref} className="fill">
        {cover && <RemoteImage url={cover.poster || cover.backdrop} style={{ position: 'absolute', inset: 0 }} />}
        <div className="fill" style={{ background: 'linear-gradient(180deg, transparent, rgba(0,0,0,.82))' }} />
        <span style={{ position: 'absolute', top: 9, right: 9, background: 'var(--red)', borderRadius: 12, padding: '5px 8px', color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: '14px' }}>{collection.movies.length} film</span>
        <span className="clamp3" style={{ position: 'absolute', left: 12, right: 12, bottom: 12, color: '#fff', fontSize: 15, fontWeight: 900, lineHeight: '20px' }}>{collection.name || 'Saga'}</span>
      </div>
    </Press>
  )
}

export function LibraryScreen({ section, onSection, onOpen, onAction, onOpenSaga, onOpenPerson, onDiscover }: {
  section: LibrarySection; onSection: (s: LibrarySection) => void; onOpen: OpenMedia; onAction: (m: Media) => void
  onOpenSaga: (c: SagaCollection, el: HTMLElement | null) => void; onOpenPerson: (p: Person, rect: Rect | null) => void; onDiscover: () => void
}) {
  const { version } = useStore()
  const counts: Record<string, number> = { PROGRESS: byState('progress').length, SAVED: byState('saved').length, WATCHED: byState('watched').length, HIDDEN: byState('hidden').length }
  const followList = follows()
  const persons = dedupePeople(people().map((f) => f.person))
  const saved = useMemo(() => byState('saved').map((e) => e.media), [version])
  const [sagas, setSagas] = useState<SagaCollection[]>([])
  useEffect(() => {
    let alive = true
    const seeds = [...new Map(saved.filter((m) => m.collectionId > 0).map((m) => [m.collectionId, m])).values()]
    Promise.all(seeds.map(async (seed): Promise<SagaCollection | null> => {
      try {
        const movies = [...new Map([...(await tmdb.saga(seed)), ...saved.filter((m) => m.collectionId === seed.collectionId)].map((m) => [m.id, m])).values()]
          .sort((a, b) => (a.releaseDate < b.releaseDate ? -1 : a.releaseDate > b.releaseDate ? 1 : 0))
        return movies.length > 0 ? { id: seed.collectionId, name: seed.collectionName, movies } : null
      } catch { return null }
    })).then((list) => { if (alive) setSagas(list.filter((c): c is SagaCollection => c != null)) })
    return () => { alive = false }
  }, [version])
  const sections = SECTIONS.filter(([key]) => key === 'SAGAS' ? sagas.length > 0 : key === 'HIDDEN' ? counts.HIDDEN > 0 : true)
  const current = sections.some(([k]) => k === section) ? section : 'PROGRESS'
  const total = counts.PROGRESS + counts.SAVED + counts.WATCHED
  const hidden = byState('hidden').map((e) => e.media)
  return (
    <div className="fill col status-pad">
      <Reveal id="library-header" style={{ padding: '14px 20px 0' }}>
        <div style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 900, letterSpacing: 2, lineHeight: '16px' }}>LA TUA COLLEZIONE</div>
        <div className="t-display-small" style={{ color: 'var(--ink)', marginTop: 4 }}>Libreria</div>
        <AnimatedCount value={total} render={(value) => <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>{value} titoli · {followList.length + persons.length} seguiti</div>} />
      </Reveal>
      <ChipTabs style={{ marginTop: 16, flex: 'none' }} selected={sections.findIndex(([k]) => k === current)} onSelect={(i) => onSection(sections[i][0])}
        options={sections.map(([key, label]) => [label, key === 'FOLLOWING' ? followList.length + persons.length : key === 'SAGAS' ? sagas.length : key === 'SERVICES' ? null : counts[key]])} />
      <div style={{ flex: 1, minHeight: 0, position: 'relative', marginTop: 12 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={current} className="fill"
            initial={{ opacity: 0, y: '7%' }} animate={{ opacity: 1, y: 0, transition: { opacity: tween(240), y: tween(360, emphasized) } }} exit={{ opacity: 0, transition: tween(120) }}>
            {current === 'PROGRESS' || current === 'SAVED' || current === 'WATCHED' ? <LibrarySectionContent section={current} onOpen={onOpen} onAction={onAction} onDiscover={onDiscover} />
              : current === 'FOLLOWING' ? <FollowingContent onOpen={onOpen} onAction={onAction} onOpenPerson={onOpenPerson} />
                : current === 'SERVICES' ? <div className="fill scroll" style={{ padding: '4px 0 132px' }}><SubscriptionsPanel onOpen={(m) => onOpen(m, null)} /></div>
                  : current === 'SAGAS' ? (
                    <div className="fill scroll" style={{ padding: '4px 20px 132px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, alignContent: 'start' }}>
                      {sagas.map((c) => <SagaCollectionCard key={c.id} collection={c} onOpen={onOpenSaga} />)}
                    </div>
                  ) : (
                    <div className="fill col">
                      <PosterGrid media={hidden} onOpen={onOpen} onLongPress={onAction}
                        header={<div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>Tieni premuto un titolo per ripristinarlo nel catalogo.</div>} />
                    </div>
                  )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

export function SagaDetailScreen({ collection, backEnabled, onDismiss, onOpen }: { collection: SagaCollection; backEnabled: boolean; onDismiss: () => void; onOpen: OpenMedia }) {
  useStore()
  useBackHandler(backEnabled, onDismiss)
  const hero = collection.movies[0]
  return (
    <div className="fill scroll" style={{ background: 'var(--bg)', paddingBottom: 28 }}>
      <div style={{ position: 'relative', height: 520 }}>
        {hero && <RemoteImage url={hero.poster || hero.backdrop} style={{ position: 'absolute', inset: 0 }} />}
        <div className="fill" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.2), transparent, rgba(10,11,16,.98))' }} />
        <button aria-label="Indietro" className="center" onClick={onDismiss} style={{ position: 'absolute', left: 16, top: 'calc(16px + var(--safe-top))', width: 40, height: 40, borderRadius: 20, background: 'rgba(20,22,30,.8)' }}>
          <Icon name="back" color="#fff" />
        </button>
        <div className="col" style={{ position: 'absolute', left: 20, right: 20, bottom: 20 }}>
          <span style={{ color: 'var(--secondary)', fontWeight: 900, fontSize: 11, letterSpacing: 1.4, lineHeight: '16px' }}>SAGA · {collection.movies.length} FILM</span>
          <span className="t-headline-medium" style={{ color: '#fff', fontWeight: 900, marginTop: 5 }}>{collection.name || 'Saga'}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 12, rowGap: 18, marginTop: 18 }}>
        {collection.movies.map((m) => <div key={m.id} style={{ padding: '0 10px' }}><SearchPosterCard media={m} onOpen={onOpen} /></div>)}
      </div>
    </div>
  )
}


// --- CatalogExpandedScreen -------------------------------------------------------------------

function CatalogExpandedRow({ media, open, actions, releaseDates }: { media: Media; open: OpenMedia; actions: (m: Media) => void; releaseDates: boolean }) {
  const entry = entryOf(media)
  const art = useRef<HTMLDivElement | null>(null)
  const listed = entry?.state === 'saved' || entry?.state === 'progress' || entry?.state === 'watched'
  return (
    <Press style={{ background: 'var(--surface)', borderRadius: 22, flex: 'none' }} onClick={() => open(media, artSource(art.current, posterUrl(media), 15))} onLongPress={() => actions(media)}>
      <div className="row" style={{ padding: 10 }}>
        <div style={{ width: 76, height: 110, position: 'relative', flex: 'none' }}>
          <ArtworkImage media={media} corner={15} style={{ position: 'absolute', inset: 0 }} onEl={(el) => { art.current = el }} />
          {entry?.liked != null && <ReactionBadge liked={entry.liked} style={{ position: 'absolute', top: 3, right: 3, transform: 'scale(.78)' }} />}
        </div>
        <div className="grow col" style={{ paddingLeft: 14 }}>
          <span className="clamp2" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 17, lineHeight: '24px' }}>{media.title}</span>
          <span style={{ color: 'var(--secondary)', fontSize: 13, marginTop: 5 }}>{releaseDates ? releaseLabel(media) : `${media.year}  ·  ★ ${rating(media.rating)}`}</span>
          <span style={{ color: 'var(--muted)', fontSize: 13, marginTop: 5 }}>{isSeries(media) ? 'Serie TV' : 'Film'}</span>
        </div>
        {listed && (
          <div className="center" style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(26,27,33,.9)', flex: 'none' }}>
            <Icon name={entry!.state === 'watched' ? 'check' : 'play'} size={20} color="var(--secondary)" />
          </div>
        )}
      </div>
    </Press>
  )
}

function LoadMoreButton({ onLoadMore, loading, error }: { onLoadMore: () => void; loading: boolean; error: boolean }) {
  return (
    <Press pressed={loading ? 1 : 0.97} disabled={loading} onClick={onLoadMore} className="center"
      style={{ marginTop: 6, height: 52, borderRadius: 18, boxShadow: 'inset 0 0 0 1px var(--outline-strong)', color: 'var(--primary)', fontSize: 14, fontWeight: 700, flex: 'none' }}>
      {loading ? <Spinner size={20} color="var(--primary)" /> : error ? 'Caricamento non riuscito · Riprova' : 'Carica altri'}
    </Press>
  )
}

export function CatalogExpandedScreen({ title, media, loadingMore, refreshing, onDismiss, onOpen, onAction, onLoadMore, onRefresh, releaseDates = false, paginationError = false }: {
  title: string; media: Media[]; loadingMore: boolean; refreshing: boolean; onDismiss: () => void; onOpen: OpenMedia; onAction: (m: Media) => void
  onLoadMore: (() => void) | null; onRefresh: (() => void) | null; releaseDates?: boolean; paginationError?: boolean
}) {
  useStore()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('ORIGINAL')
  const [grid, setGrid] = useState(false)
  const [menu, setMenu] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const visible = useMemo(() => sortMedia(media.filter((m) => m.title.toLowerCase().includes(query.trim().toLowerCase())), sort, (m) => m), [media, query, sort])
  useBackHandler(true, onDismiss)
  // Release lists load the next page by themselves near the end.
  useEffect(() => {
    if (!releaseDates || !sentinel.current) return
    const observer = new IntersectionObserver((items) => {
      if (items.some((i) => i.isIntersecting) && !loadingMore && !refreshing && !paginationError && query.trim() === '') onLoadMore?.()
    }, { rootMargin: '400px' })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [releaseDates, media.length, loadingMore, refreshing, paginationError, query, grid])
  const pull = usePullToRefresh(onRefresh ? () => onRefresh() : null, refreshing)
  return (
    <div className="fill col status-pad nav-pad" style={{ background: 'var(--bg)', padding: '0 20px' }}>
      {pull.indicator(92)}
      <div className="row" style={{ padding: '8px 0' }}>
        <Press pressed={0.9} aria-label="Indietro" onClick={onDismiss} className="center" style={{ width: 40, height: 40, borderRadius: 20, background: '#3B161B', flex: 'none' }}>
          <Icon name="back" color="#FFDAD2" />
        </Press>
        <div className="grow col" style={{ paddingLeft: 14 }}>
          <span className="t-headline-medium ellipsis" style={{ color: 'var(--ink)' }}>{title}</span>
          <span style={{ color: 'var(--secondary)', fontWeight: 700 }}>{visible.length} {visible.length === 1 ? 'titolo' : 'titoli'}</span>
        </div>
        <div style={{ position: 'relative' }}>
          <button aria-label="Opzioni di visualizzazione" className="center" onClick={() => setMenu(true)} style={{ width: 48, height: 48 }}><Icon name="moreVert" /></button>
          <DropdownMenu open={menu} onDismiss={() => setMenu(false)}>
            <MenuItem label="Visualizzazione elenco" leading={<Icon name="list" />} trailing={!grid ? <Icon name="check" /> : null} onClick={() => { setGrid(false); setMenu(false) }} />
            <MenuItem label="Visualizzazione griglia" leading={<Icon name="grid" />} trailing={grid ? <Icon name="check" /> : null} onClick={() => { setGrid(true); setMenu(false) }} />
          </DropdownMenu>
        </div>
      </div>
      <div className="row" style={{ marginTop: 8, height: 56, borderRadius: 22, boxShadow: 'inset 0 0 0 1px var(--outline-strong)', padding: '0 4px 0 12px', flex: 'none' }}>
        <Icon name="search" color="var(--muted)" />
        <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca nella sezione" style={{ flex: 1, margin: '0 12px' }} />
        {query !== '' && <button aria-label="Cancella ricerca" className="center" onClick={() => setQuery('')} style={{ width: 48, height: 48 }}><Icon name="close" color="var(--muted)" /></button>}
      </div>
      <div className="hscroll row" style={{ marginTop: 10, gap: 7, flex: 'none' }}>
        {SORTS.map(([key, label]) => <FilterChip key={key} selected={sort === key} onClick={() => setSort(key)}>{label}</FilterChip>)}
      </div>
      {visible.length === 0 ? <div className="grow center" style={{ color: 'var(--muted)', fontSize: 16 }}>Nessun titolo corrisponde alla ricerca.</div>
        : (
          <div ref={pull.ref} className="scroll" style={{ flex: 1, minHeight: 0, marginTop: 12, paddingBottom: 12 }} {...pull.handlers}>
            {grid ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 12, rowGap: 18 }}>
                {visible.map((m) => <SearchPosterCard key={m.id} media={m} onOpen={onOpen} releaseDates={releaseDates} />)}
              </div>
            ) : (
              <div className="col" style={{ gap: 10 }}>
                {visible.map((m) => <CatalogExpandedRow key={m.id} media={m} open={onOpen} actions={onAction} releaseDates={releaseDates} />)}
              </div>
            )}
            {onLoadMore && <div className="col" style={{ marginTop: 10 }}><LoadMoreButton onLoadMore={onLoadMore} loading={loadingMore} error={paginationError} /></div>}
            <div ref={sentinel} style={{ height: 1 }} />
          </div>
        )}
    </div>
  )
}

/** PullToRefreshBox: drag down at the top of [ref] to refresh; the M3 indicator follows. */
export function usePullToRefresh(onRefresh: (() => void) | null, refreshing: boolean) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [distance, setDistance] = useState(0)
  const start = useRef<number | null>(null)
  const threshold = 80
  const handlers = onRefresh ? {
    onTouchStart: (e: React.TouchEvent) => { start.current = (ref.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null },
    onTouchMove: (e: React.TouchEvent) => {
      if (start.current == null) return
      const d = e.touches[0].clientY - start.current
      setDistance(d > 0 ? Math.min(140, d * 0.5) : 0)
    },
    onTouchEnd: () => {
      if (start.current != null && distance >= threshold * 0.75) onRefresh()
      start.current = null
      setDistance(0)
    },
  } : {}
  const shown = refreshing ? 1 : Math.min(1, distance / threshold)
  const indicator = (offset: number) => onRefresh && (refreshing || distance > 0) ? (
    <div className="center" style={{ position: 'absolute', left: 0, right: 0, top: `calc(var(--safe-top) + ${offset - 40 + (refreshing ? 40 : distance * 0.5)}px)`, zIndex: 15, pointerEvents: 'none', opacity: shown }}>
      <div className="center" style={{ width: 40, height: 40, borderRadius: '50%', background: '#3B161B', boxShadow: '0 2px 6px rgba(0,0,0,.4)' }}>
        {refreshing ? <Spinner size={22} stroke={2.5} color="#FFDAD2" /> : <div style={{ transform: `rotate(${distance * 3}deg)` }}><Icon name="refresh" size={22} color="#FFDAD2" /></div>}
      </div>
    </div>
  ) : null
  return { ref, handlers, indicator }
}
