import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { today } from '../../../shared/dates.ts'
import { shortFollowLabel, sortFollows } from '../../../shared/follows.ts'
import { isSeries, type LibraryEntry, type Media, type Provider } from '../../../shared/model.ts'
import { PLATFORMS } from '../../../shared/tmdb.ts'
import { openFrom, posterUrl, ReactionBadge, SagaCollectionCard } from '../components/cards.tsx'
import { emphasized, tween } from '../components/motion.ts'
import { Dialog } from '../components/Overlay.tsx'
import { PeopleRail } from '../components/people.tsx'
import {
  alpha, AnimatedCount, C, ChipTabs, DropdownMenu, EmptyState, FilledButton, FilterChip, GlassIconButton, Icon, IconButton, LinearProgress, Pressable,
  RemoteImage, Reveal, SectionHeader, SegmentedPills, TextButton, TonalIconButton,
} from '../components/ui.tsx'
import { close, setLibrarySection, setTab, useNav, type LibrarySection } from '../lib/nav.ts'
import { savePrefs, updateSettings, useData, useStore, type LibrarySort } from '../lib/store.ts'
import {
  filterIncludes, included, NO_FILTER, rank, rankTotal, reloadSubscriptions, serviceId, useSubscriptionData, type Rank, type SubscriptionFilter,
} from '../lib/subscriptions.ts'
import { attempt, tmdb } from '../lib/tmdb.ts'
import { openActions, openMedia, openPerson, rating } from '../lib/ui.ts'
import { platformLogo } from './Advisor.tsx'
import { PosterGrid } from './Detail.tsx'
import { SearchPosterCard, SORTS } from './Discover.tsx'
import { continueWatchingOrder } from './Home.tsx'

const SECTIONS: { id: LibrarySection; label: string }[] = [
  { id: 'progress', label: 'In corso' }, { id: 'saved', label: 'Da vedere' }, { id: 'watched', label: 'Visti' }, { id: 'following', label: 'Seguiti' },
  { id: 'services', label: 'Abbonamenti' }, { id: 'sagas', label: 'Saghe' }, { id: 'hidden', label: 'Nascosti' },
]
const HOME_TITLES: Record<string, string> = { progress: 'Continua a guardare', saved: 'La mia lista', watched: 'Già visti' }

type Saga = { id: number; name: string; movies: Media[] }
let sagaCache: { signature: string; sagas: Saga[] } | null = null

export function LibraryScreen() {
  const section = useNav((s) => s.librarySection)
  const data = useData()
  const entries = [...data.library.values()]
  const count = (state: string) => entries.filter((e) => e.state === state).length
  const people = useMemo(() => { const seen = new Set<number>(); return data.people.map((f) => f.person).filter((p) => !seen.has(p.id) && !!seen.add(p.id)) }, [data.people])
  const saved = entries.filter((e) => e.state === 'saved').map((e) => e.media)
  const [sagas, setSagas] = useState<Saga[]>(sagaCache?.sagas ?? [])
  const seedSignature = saved.filter((m) => m.collectionId > 0).map((m) => m.id).join('|')
  useEffect(() => {
    if (sagaCache?.signature === seedSignature) return
    const seeds = saved.filter((m) => m.collectionId > 0).filter((m, i, all) => all.findIndex((x) => x.collectionId === m.collectionId) === i)
    void (async () => {
      const list = (await Promise.all(seeds.map(async (seed) => {
        const parts = await attempt(() => tmdb.saga(seed), null)
        if (!parts) return null
        const all = [...parts, ...saved.filter((m) => m.collectionId === seed.collectionId)]
        const movies = all.filter((m, i) => all.findIndex((x) => x.id === m.id) === i).sort((a, b) => (a.releaseDate < b.releaseDate ? -1 : a.releaseDate > b.releaseDate ? 1 : 0))
        return movies.length ? { id: seed.collectionId, name: seed.collectionName, movies } : null
      }))).filter((s): s is Saga => !!s)
      sagaCache = { signature: seedSignature, sagas: list }
      setSagas(list)
    })()
  }, [seedSignature])
  const sections = SECTIONS.filter((s) => (s.id === 'sagas' ? sagas.length > 0 : s.id === 'hidden' ? count('hidden') > 0 : true))
  const current = sections.some((s) => s.id === section) ? section : 'progress'
  const total = count('progress') + count('saved') + count('watched')
  const counts: Record<string, number | null> = {
    progress: count('progress'), saved: count('saved'), watched: count('watched'), hidden: count('hidden'),
    following: data.follows.length + people.length, sagas: sagas.length, services: null,
  }
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 'var(--status-top)' }}>
      <Reveal style={{ padding: '14px 20px 0' }}>
        <div style={{ color: C.accent, fontSize: 12, fontWeight: 900, letterSpacing: 2 }}>LA TUA COLLEZIONE</div>
        <div className="t-display-small" style={{ color: C.ink, marginTop: 4 }}>Libreria</div>
        <AnimatedCount value={total}>{(v) => <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>{v} titoli · {data.follows.length + people.length} seguiti</div>}</AnimatedCount>
      </Reveal>
      <ChipTabs options={sections.map((s) => [s.label, counts[s.id]])} selected={sections.findIndex((s) => s.id === current)} onSelect={(i) => setLibrarySection(sections[i].id)} style={{ marginTop: 16, flex: 'none' }} />
      <div style={{ flex: 1, position: 'relative', marginTop: 12 }}>
        <AnimatePresence initial={false}>
          <motion.div key={current} style={{ position: 'absolute', inset: 0 }}
            initial={{ opacity: 0, y: '7%' }} animate={{ opacity: 1, y: 0, transition: { opacity: tween(240), y: tween(360, emphasized) } }} exit={{ opacity: 0, transition: tween(120) }}>
            {current === 'progress' || current === 'saved' || current === 'watched' ? <LibrarySectionContent section={current} />
              : current === 'following' ? <FollowingContent />
                : current === 'services' ? <div className="scroll" style={{ position: 'absolute', inset: 0, padding: '4px 0 132px' }}><SubscriptionsPanel /></div>
                  : current === 'sagas' ? (
                    <div className="scroll" style={{ position: 'absolute', inset: 0, padding: '4px 20px 132px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        {sagas.map((s) => <SagaCollectionCard key={s.id} id={s.id} name={s.name} movies={s.movies} style={{ width: '100%' }} />)}
                      </div>
                    </div>
                  ) : (
                    <div className="scroll" style={{ position: 'absolute', inset: 0, padding: '4px 20px 132px' }}>
                      <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Tieni premuto un titolo per ripristinarlo nel catalogo.</div>
                      <PosterGrid>
                        {entries.filter((e) => e.state === 'hidden').map((e) => <SearchPosterCard key={e.media.id} media={e.media} entry={e} onLongPress={() => openActions(e.media)} />)}
                      </PosterGrid>
                    </div>
                  )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function FollowingContent() {
  const data = useData()
  const td = today()
  const follows = sortFollows(data.follows, td)
  const seen = new Set<number>()
  const people = data.people.map((f) => f.person).filter((p) => !seen.has(p.id) && !!seen.add(p.id))
  if (!follows.length && !people.length) {
    return <div className="scroll" style={{ position: 'absolute', inset: 0 }}><EmptyState icon="notifications_none" title="Non segui ancora nulla" body="Tocca “Segui” nella scheda di un film, di una serie, di un attore o di un regista: ti avviserò quando esce qualcosa di nuovo." /></div>
  }
  return (
    <div className="scroll" style={{ position: 'absolute', inset: 0, padding: '4px 0 132px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {people.length > 0 && <PeopleRail people={people} title="Persone" topPadding={0} onPerson={openPerson} />}
        {follows.length > 0 && <SectionHeader title="Titoli" eyebrow="Uscite e nuovi episodi" style={{ paddingTop: 8, paddingBottom: 4 }} />}
        {follows.map((f) => (
          <motion.div key={f.media.id} layout style={{ padding: '0 20px' }}>
            <Pressable className="glass" onClick={(rect) => openMedia(f.media, { rect, corner: 22 })} onLongPress={() => openActions(f.media)}
              style={{ borderRadius: 22, padding: 10, display: 'flex', alignItems: 'center' }}>
              <RemoteImage url={f.media.poster || f.media.backdrop} style={{ width: 62, height: 90, borderRadius: 14, flex: 'none' }} />
              <div style={{ flex: 1, padding: '0 14px', minWidth: 0 }}>
                <div className="clamp2" style={{ color: C.ink, fontWeight: 800, fontSize: 16, lineHeight: '22px' }}>{f.media.title}</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{isSeries(f.media) ? 'Serie TV' : 'Film'}</div>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
                  <Icon name="notifications" size={15} color={C.amber} />
                  <span className="ellipsis" style={{ marginLeft: 5, color: C.amber, fontSize: 12, fontWeight: 700 }}>{shortFollowLabel(f, td)}</span>
                </div>
              </div>
              <Icon name="chevron_right" color={C.muted} />
            </Pressable>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function sortEntries(list: LibraryEntry[], sort: LibrarySort): LibraryEntry[] {
  const title = (a: LibraryEntry, b: LibraryEntry) => a.media.title.toLowerCase().localeCompare(b.media.title.toLowerCase(), 'it')
  const out = [...list]
  switch (sort) {
    case 'ORIGINAL': return out
    case 'TITLE': return out.sort(title)
    case 'NEWEST': return out.sort((a, b) => (a.media.releaseDate === b.media.releaseDate ? title(a, b) : a.media.releaseDate < b.media.releaseDate ? 1 : -1))
    case 'OLDEST': return out.sort((a, b) => { const x = a.media.releaseDate || '9999-99-99', y = b.media.releaseDate || '9999-99-99'; return x === y ? title(a, b) : x < y ? -1 : 1 })
    case 'RATING': return out.sort((a, b) => ((b.media.rating || 0) - (a.media.rating || 0)) || title(a, b))
  }
}

function LibrarySectionContent({ section }: { section: 'progress' | 'saved' | 'watched' }) {
  const data = useData()
  const settings = useStore((s) => s.settings)
  const subs = useSubscriptionData()
  const active = new Set(data.prefs.subscriptions)
  const filter = settings.subscriptionFilter[section] ?? NO_FILTER
  const setFilter = (f: SubscriptionFilter) => updateSettings({ subscriptionFilter: { ...settings.subscriptionFilter, [section]: f } })
  const filterSubscriptions = section === 'saved' || section === 'progress'
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const sort = settings.librarySort[section] ?? 'TITLE'
  const grid = settings.libraryGrid[section] ?? false
  const [menu, setMenu] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const entries = [...data.library.values()].filter((e) => e.state === section)
  const filtered = entries.filter((e) => e.media.title.toLowerCase().includes(query.trim().toLowerCase()) && (type === 'all' || e.media.mediaType === type) &&
    (!filterSubscriptions || filterIncludes(filter, e.media, subs, active)))
  const sorted = sortEntries(filtered, sort)
  const visible = section === 'progress' ? continueWatchingOrder(sorted) : sorted.map((e, i) => ({ e, i })).sort((a, b) => Number(b.e.pinned) - Number(a.e.pinned) || a.i - b.i).map((x) => x.e)
  if (!entries.length) {
    return (
      <div className="scroll" style={{ position: 'absolute', inset: 0, paddingBottom: 120 }}>
        {section === 'progress' ? <EmptyState icon="play" title="Nessuna serie in corso" body="Quando inizi una serie e segni un episodio come visto, la ritrovi qui pronta a ripartire." action="Trova qualcosa da guardare" onAction={() => setTab('discover')} />
          : section === 'saved' ? <EmptyState icon="add" title="La tua lista è vuota" body="Salva film e serie che vuoi vedere: li ritrovi qui, filtrabili per abbonamento." action="Esplora il catalogo" onAction={() => setTab('discover')} />
            : <EmptyState icon="check" title="Ancora nessun titolo visto" body="Segna film e serie come visti e lascia un voto: i consigli diventeranno più tuoi." />}
      </div>
    )
  }
  const open = (m: Media, el: HTMLElement | null) => { (document.activeElement as HTMLElement | null)?.blur(); window.setTimeout(() => openFrom(m, el, posterUrl(m), 15), 80) }
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '0 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
        <div className="glass" style={{ flex: 1, height: 48, borderRadius: 48, display: 'flex', alignItems: 'center', padding: '0 6px 0 16px' }}>
          <Icon name="search" size={19} color={C.muted} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Cerca in ${HOME_TITLES[section].toLowerCase()}`} className="field" style={{ flex: 1, margin: '0 10px', fontSize: 15, position: 'relative' }} />
          <AnimatePresence>{query && <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0 }}><IconButton icon="close" label="Cancella ricerca" size={36} iconSize={18} onClick={() => setQuery('')} /></motion.div>}</AnimatePresence>
        </div>
        <div style={{ width: 8 }} />
        <div style={{ position: 'relative' }}>
          <GlassIconButton icon="tune" label="Ordina" size={48} onClick={() => setMenu(true)} />
          <DropdownMenu open={menu} onDismiss={() => setMenu(false)} radius={18}
            header={<div style={{ color: C.accent, fontSize: 11, fontWeight: 900, letterSpacing: 1.4, padding: '8px 16px' }}>ORDINA PER</div>}
            items={SORTS.map((o) => ({ label: o.label, trailing: sort === o.id ? <Icon name="check" color={C.accent} /> : undefined, onClick: () => { updateSettings({ librarySort: { ...settings.librarySort, [section]: o.id } }); setMenu(false); scroller.current?.scrollTo({ top: 0 }) } }))} />
        </div>
        <div style={{ width: 8 }} />
        <GlassIconButton icon={grid ? 'list' : 'grid'} label={grid ? 'Visualizzazione elenco' : 'Visualizzazione griglia'} size={48} onClick={() => updateSettings({ libraryGrid: { ...settings.libraryGrid, [section]: !grid } })} />
      </div>
      {section === 'watched' && <SegmentedPills options={['Tutto', 'Film', 'Serie']} selected={['all', 'movie', 'tv'].indexOf(type)} onSelect={(i) => setType(['all', 'movie', 'tv'][i])} height={40} style={{ marginTop: 12, flex: 'none' }} />}
      {filterSubscriptions && <SubscriptionFilterBar filter={filter} onChange={setFilter} />}
      <div style={{ flex: 1, position: 'relative' }}>
        <AnimatePresence initial={false}>
          <motion.div key={grid ? 'grid' : 'list'} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1, transition: { opacity: tween(220), scale: tween(260) } }} exit={{ opacity: 0, transition: tween(120) }} style={{ position: 'absolute', inset: 0 }}>
            {visible.length === 0 ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>Nessun titolo corrisponde ai filtri.</div> : (
              <div ref={scroller} className="scroll" style={{ position: 'absolute', inset: 0, padding: '14px 0 132px' }}>
                {grid ? (
                  <PosterGrid>{visible.map((e) => <SearchPosterCard key={e.media.id} media={e.media} entry={e} onLongPress={() => openActions(e.media)} />)}</PosterGrid>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {visible.map((e) => <ExpandedLibraryRow key={e.media.id} entry={e} onOpen={open} />)}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function ExpandedLibraryRow({ entry, onOpen }: { entry: LibraryEntry; onOpen: (m: Media, el: HTMLElement | null) => void }) {
  const media = entry.media
  const art = useRef<HTMLDivElement>(null)
  const status = entry.state === 'progress' && isSeries(media) ? `Prossimo: S${entry.nextSeason} · E${entry.nextEpisode}` : isSeries(media) ? 'Serie TV' : 'Film'
  return (
    <motion.div layout transition={tween(300)}>
      <Pressable className="glass" onClick={() => onOpen(media, art.current)} onLongPress={() => openActions(media)} style={{ borderRadius: 22, padding: 10, display: 'flex', alignItems: 'center' }}>
        <div style={{ width: 76, height: 110, position: 'relative', flex: 'none' }}>
          <div ref={art} style={{ position: 'absolute', inset: 0, borderRadius: 15, overflow: 'hidden' }}><RemoteImage url={posterUrl(media)} style={{ width: '100%', height: '100%' }} /></div>
          {entry.liked != null && <ReactionBadge liked={entry.liked} style={{ position: 'absolute', top: 3, right: 3, transform: 'scale(.78)', transformOrigin: 'top right' }} />}
          {entry.pinned && <div style={{ position: 'absolute', left: 3, bottom: 3, width: 28, height: 28, borderRadius: '50%', background: C.red, padding: 7 }}><Icon name="push_pin" size={14} color="#fff" /></div>}
        </div>
        <div style={{ marginLeft: 14, flex: 1, minWidth: 0 }}>
          <div className="clamp2" style={{ color: C.ink, fontWeight: 700, fontSize: 17 }}>{media.title}</div>
          <div style={{ color: C.accent, fontSize: 13, marginTop: 5 }}>{media.year}  ·  ★ {rating(media.rating)}</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 5 }}>{status}</div>
        </div>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(26,27,33,.902)', padding: 9, flex: 'none' }}>
          <Icon name={entry.state === 'watched' ? 'check' : 'play'} size={20} color={C.accent} />
        </div>
      </Pressable>
    </motion.div>
  )
}

// --- subscriptions --------------------------------------------------------------------------------

export function SubscriptionLogo({ provider, size = 38 }: { provider: Provider; size?: number }) {
  const platform = PLATFORMS.find((p) => p.providerId === serviceId(provider.id))
  if (provider.logo) return <RemoteImage url={provider.logo} fit="contain" style={{ width: size, height: size, borderRadius: 10, flex: 'none' }} />
  if (platform) return <img src={platformLogo(platform.id)} alt="" style={{ width: size, height: size, objectFit: 'contain', flex: 'none' }} />
  return <div style={{ width: size, height: size, borderRadius: 10, background: C.raised, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent, fontWeight: 700, flex: 'none' }}>{provider.name.slice(0, 2).toUpperCase()}</div>
}

function ProviderSelectionDialog({ open, title, selected, onDismiss, fullScreen = false, onConfirm }: { open: boolean; title: string; selected: number[]; onDismiss: () => void; fullScreen?: boolean; onConfirm: (ids: number[]) => void }) {
  const subs = useSubscriptionData()
  const [chosen, setChosen] = useState<number[]>(selected)
  const [query, setQuery] = useState('')
  useEffect(() => { if (open) { setChosen(selected); setQuery('') } }, [open])
  const body = (
    <div style={{ background: C.panel, borderRadius: fullScreen ? 0 : 28, padding: fullScreen ? 'calc(var(--status-top) + 20px) 20px calc(var(--nav-bottom) + 20px)' : 20, display: 'flex', flexDirection: 'column', gap: 12, height: fullScreen ? '100%' : undefined }}>
      <div style={{ color: C.ink, fontSize: 23, fontWeight: 700, lineHeight: '30px' }}>{title}</div>
      <div style={{ color: C.muted }}>Puoi scegliere più servizi</div>
      <div style={{ height: 56, borderRadius: 18, border: '1px solid #4B505E', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca servizio" className="field" />
      </div>
      <div className="scroll" style={{ flex: fullScreen ? 1 : undefined, maxHeight: fullScreen ? undefined : 350, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {subs.services.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).map((p) => {
          const id = serviceId(p.id)
          const on = chosen.includes(id)
          return (
            <div key={p.id} onClick={() => setChosen(on ? chosen.filter((x) => x !== id) : [...chosen, id])}
              style={{ borderRadius: 16, background: on ? alpha(C.primary, 0.18) : C.raised, padding: 10, display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 'none' }}>
              <SubscriptionLogo provider={p} />
              <span style={{ flex: 1, marginLeft: 12, color: C.ink, fontWeight: 600 }}>{p.name}</span>
              <Checkbox checked={on} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {chosen.length > 0 && <TextButton onClick={() => setChosen([])}>Nessuno</TextButton>}
        <div style={{ flex: 1 }} />
        <TextButton onClick={onDismiss}>Annulla</TextButton>
        <FilledButton onClick={() => onConfirm(chosen)}>Salva</FilledButton>
      </div>
    </div>
  )
  return (
    <Dialog open={open} onDismiss={onDismiss} width={fullScreen ? '100%' : undefined} style={fullScreen ? { height: '100%', maxHeight: '100%' } : undefined}>
      {fullScreen ? <div style={{ position: 'fixed', inset: 0 }}>{body}</div> : body}
    </Dialog>
  )
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div style={{ width: 18, height: 18, borderRadius: 2, margin: 11, border: `2px solid ${checked ? C.primary : C.muted}`, background: checked ? C.primary : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      {checked && <Icon name="check" size={14} color="#fff" />}
    </div>
  )
}

function SubscriptionFilterBar({ filter, onChange }: { filter: SubscriptionFilter; onChange: (f: SubscriptionFilter) => void }) {
  const data = useData()
  const subs = useSubscriptionData()
  const [dialog, setDialog] = useState(false)
  return (
    <div style={{ paddingTop: 10, flex: 'none' }}>
      <div className="hscroll" style={{ gap: 7 }}>
        <FilterChip selected={!filter.activeOnly && !filter.services.length} label="Tutti" onClick={() => onChange(NO_FILTER)} />
        <FilterChip selected={filter.activeOnly} label="I miei abbonamenti" onClick={() => onChange({ activeOnly: true, services: [] })} />
        <FilterChip selected={filter.services.length > 0} label={filter.services.length ? `${filter.services.length} servizi` : 'Scegli servizi'} onClick={() => setDialog(true)} />
      </div>
      {filter.activeOnly && !data.prefs.subscriptions.length && <div style={{ color: C.muted, fontSize: 12 }}>Nessun abbonamento attivo. Impostali nella Home.</div>}
      {(filter.activeOnly || filter.services.length > 0) && (subs.updating || subs.uncertain > 0) && (
        <div style={{ color: C.muted, fontSize: 12 }}>{subs.updating ? `Verifica disponibilità ${subs.completed}/${subs.total}…` : 'Disponibilità incompleta: alcuni titoli non sono stati verificati.'}</div>
      )}
      <ProviderSelectionDialog open={dialog} title="Filtra per servizi" selected={filter.services} onDismiss={() => setDialog(false)} onConfirm={(ids) => { onChange({ activeOnly: false, services: ids }); setDialog(false) }} />
    </div>
  )
}

function SubscriptionsPanel() {
  const data = useData()
  const subs = useSubscriptionData()
  const active = new Set(data.prefs.subscriptions)
  const entries = [...data.library.values()].filter((e) => e.state === 'saved' || e.state === 'progress')
  const ranks = rank(entries, subs.availability, subs.services, active)
  const [editing, setEditing] = useState(false)
  const [ranking, setRanking] = useState(false)
  const [selected, setSelected] = useState<Rank | null>(null)
  const place = (r: Rank) => ranks.filter((x) => rankTotal(x) > rankTotal(r)).length + 1
  const titles = selected ? entries.filter((e) => included(subs.availability.get(e.media.id), new Set([serviceId(selected.provider.id)]))) : []
  return (
    <div style={{ padding: '0 20px' }}>
      <motion.div layout transition={tween(300)} style={{ background: C.panel, borderRadius: 28, border: `1px solid ${alpha(C.accent, 0.25)}`, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, color: C.ink, fontSize: 21, lineHeight: '26px', fontWeight: 700 }}>I tuoi abbonamenti</div>
          <TextButton onClick={() => setEditing(true)}>{active.size ? 'Modifica' : 'Imposta'}</TextButton>
        </div>
        {!active.size ? <div style={{ color: C.muted }}>Scegli i servizi a cui sei abbonato. Puoi modificarli quando vuoi.</div> : (
          <div className="hscroll" style={{ gap: 8 }}>
            {subs.services.filter((p) => active.has(serviceId(p.id))).map((p) => (
              <div key={p.id} style={{ background: C.raised, borderRadius: 14, padding: 8, display: 'flex', alignItems: 'center', flex: 'none' }}>
                <SubscriptionLogo provider={p} size={24} /><span style={{ color: C.ink, fontSize: 12, marginLeft: 6 }}>{p.name}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 1, background: alpha(C.muted, 0.15) }} />
        <div style={{ color: C.ink, fontWeight: 700, fontSize: 18 }}>Quale servizio ti conviene?</div>
        <div style={{ color: C.muted, fontSize: 13, lineHeight: '18px' }}>Più titoli inclusi dalla tua lista e da Continua a guardare. Ogni film o serie conta una volta.</div>
        {!entries.length ? <div style={{ color: C.muted, fontSize: 13, lineHeight: '18px' }}>Aggiungi titoli alla tua lista per ottenere una classifica personale.</div>
          : ranks.every((r) => rankTotal(r) === 0) && !subs.updating && subs.uncertain === 0 ? <div style={{ color: C.muted }}>Nessun servizio include i tuoi titoli al momento.</div>
            : (
              <>
                {ranks.filter((r) => rankTotal(r) > 0).slice(0, 2).map((r) => <RankRow key={r.provider.id} rank={r} place={place(r)} active={active.has(r.provider.id)} compare={active.size > 0} onClick={() => setSelected(r)} />)}
                {subs.updating && <LinearProgress value={subs.total ? subs.completed / subs.total : 0} color={C.primary} track={alpha(C.primary, 0.24)} height={4} />}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ flex: 1, color: C.muted, fontSize: 12 }}>{subs.updating ? `Verifica titoli ${subs.completed}/${subs.total}` : subs.uncertain > 0 ? `${subs.uncertain} titoli da verificare` : `${entries.length} titoli confrontati`}</div>
                  <TextButton onClick={() => setRanking(true)}>Classifica</TextButton>
                  <IconButton icon="refresh" label="Aggiorna disponibilità" tint={C.accent} size={40} onClick={() => { if (!subs.updating) reloadSubscriptions() }} />
                </div>
                <div style={{ color: C.muted, fontSize: 10, lineHeight: '14px' }}>Ordine per numero di titoli, senza confrontare i prezzi. {subs.updating || subs.uncertain > 0 ? 'Classifica provvisoria. ' : ''}Disponibilità in Italia · JustWatch</div>
              </>
            )}
      </motion.div>
      <ProviderSelectionDialog open={editing} title="I tuoi abbonamenti" selected={[...active]} fullScreen onDismiss={() => setEditing(false)} onConfirm={(ids) => { void savePrefs({ subscriptions: ids }); setEditing(false) }} />
      <Dialog open={ranking} onDismiss={() => setRanking(false)}>
        <div style={{ background: C.panel, borderRadius: 28, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: C.ink, fontSize: 23, fontWeight: 700, lineHeight: '30px' }}>La tua classifica</div>
          <div style={{ color: C.muted, fontSize: 13, lineHeight: '18px' }}>Dal maggior numero di titoli inclusi al minore. Solo abbonamenti, senza noleggi o acquisti.</div>
          {(subs.updating || subs.uncertain > 0) && <div style={{ color: C.accent, fontSize: 12 }}>Dati in aggiornamento o incompleti: la classifica può cambiare.</div>}
          <div className="scroll" style={{ maxHeight: 430, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ranks.map((r) => <RankRow key={r.provider.id} rank={r} place={place(r)} active={active.has(r.provider.id)} compare={active.size > 0} onClick={() => setSelected(r)} />)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><TextButton onClick={() => setRanking(false)}>Chiudi</TextButton></div>
        </div>
      </Dialog>
      <Dialog open={selected != null} onDismiss={() => setSelected(null)}>
        <div style={{ background: C.panel, borderRadius: 28, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: C.ink, fontSize: 23, fontWeight: 700, lineHeight: '30px' }}>Su {selected?.provider.name}</div>
          <div className="scroll" style={{ maxHeight: 430, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {titles.map((e) => (
              <Pressable key={e.media.id} pressed={0.98} onClick={() => { setSelected(null); setRanking(false); window.setTimeout(() => openMedia(e.media), 200) }} style={{ background: C.raised, borderRadius: 18, padding: 12, display: 'flex', alignItems: 'center', flex: 'none' }}>
                <RemoteImage url={e.media.poster} style={{ width: 42, height: 60, borderRadius: 8, flex: 'none' }} />
                <div style={{ flex: 1, marginLeft: 12 }}>
                  <div style={{ color: C.ink, fontWeight: 700 }}>{e.media.title}</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>{e.state === 'saved' ? 'La mia lista' : 'Continua a guardare'}</div>
                </div>
              </Pressable>
            ))}
            {!titles.length && <div style={{ color: C.muted }}>Nessun titolo incluso nelle tue liste.</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><TextButton onClick={() => setSelected(null)}>Chiudi</TextButton></div>
        </div>
      </Dialog>
    </div>
  )
}

function RankRow({ rank: r, place, active, compare, onClick }: { rank: Rank; place: number; active: boolean; compare: boolean; onClick: () => void }) {
  return (
    <Pressable pressed={0.98} onClick={() => onClick()} style={{ background: C.raised, borderRadius: 18, padding: 12, display: 'flex', alignItems: 'center', flex: 'none' }}>
      <div style={{ width: 24, color: C.accent, fontWeight: 900 }}>{place}</div>
      <SubscriptionLogo provider={r.provider} size={32} />
      <div style={{ flex: 1, marginLeft: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ color: C.ink, fontSize: 14, lineHeight: '18px', fontWeight: 700 }}>{r.provider.name}</div>
        <div style={{ color: C.muted, fontSize: 11, lineHeight: '15px' }}>{r.saved} in lista · {r.progress} in corso</div>
        {active ? <div style={{ color: C.like, fontSize: 10, lineHeight: '14px' }}>Attivo</div> : compare ? <div style={{ color: C.accent, fontSize: 10, lineHeight: '14px' }}>{r.additional} {r.additional === 1 ? 'titolo' : 'titoli'} in più per te</div> : null}
      </div>
      <div style={{ color: C.ink, fontWeight: 900, fontSize: 22 }}>{rankTotal(r)}</div>
    </Pressable>
  )
}

// --- saga page ------------------------------------------------------------------------------------

export function SagaPage({ pageKey, name, movies }: { pageKey: number; name: string; movies: Media[] }) {
  const data = useData()
  const hero = movies[0]
  return (
    <div className="scroll" style={{ position: 'absolute', inset: 0, background: C.bg, paddingBottom: 28 }}>
      <div style={{ position: 'relative', height: 520 }}>
        {hero && <RemoteImage url={posterUrl(hero)} style={{ position: 'absolute', inset: 0 }} />}
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(0,0,0,.2), transparent, ${alpha(C.bg, 0.98)})` }} />
        <TonalIconButton icon="back" label="Indietro" onClick={() => close(pageKey)} background="rgba(20,22,30,.8)" tint="#fff" style={{ position: 'absolute', top: 'calc(var(--status-top) + 16px)', left: 16 }} />
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 20 }}>
          <div style={{ color: C.accent, fontWeight: 900, fontSize: 11, letterSpacing: 1.4 }}>SAGA · {movies.length} FILM</div>
          <div className="t-headline-medium" style={{ color: '#fff', fontWeight: 900, marginTop: 5 }}>{name || 'Saga'}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 18, marginTop: 18 }}>
        {movies.map((m) => <div key={m.id} style={{ padding: '0 10px' }}><SearchPosterCard media={m} entry={data.library.get(m.id)} /></div>)}
      </div>
    </div>
  )
}
