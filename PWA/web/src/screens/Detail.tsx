// DetailScreen of MainActivity.kt with its parts: genre pills and GenreScreen, image carousel,
// people rails, "Dove guardarlo", FollowReleaseCard, ReactionDialog and the poster viewer.
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Media, Person, Provider, ReleaseFollow } from '../../../shared/model.ts'
import { isSeries, newReleaseFollow } from '../../../shared/model.ts'
import * as lib from '../../../shared/library.ts'
import { describe, initialize, upcomingDate, worthFollowing } from '../../../shared/follows.ts'
import { addReleaseToCalendar } from '../lib/calendar.ts'
import { todayRome } from '../../../shared/dates.ts'
import type { ReleaseInfo } from '../../../shared/tmdb.ts'
import { useBackHandler } from '../lib/back.ts'
import { entryOf, followOf, mergeDetails, removeEntry, saveEntry, saveFollow, showToast, stateOf, unfollow, useStore } from '../lib/store.ts'
import { enablePush, notificationsAllowed } from '../lib/push.ts'
import { tmdb } from '../lib/tmdb.ts'
import { emphasized, spring, tween } from '../components/motion.ts'
import { Dialog, DialogButton, AlertDialog } from '../components/overlay.tsx'
import { ExpandingPage } from '../components/Transform.tsx'
import { GlassIconButton, Icon, MetaPill, Press, RemoteImage, Reveal, Spinner, boundsOf, rating, type Rect } from '../components/ui.tsx'
import { MediaRail, ReactionBadge, ReactionIcon, RailSkeleton, EmptyState, type OpenMedia } from '../components/cards.tsx'
import { PosterGrid } from '../components/grid.tsx'
import { AiSimilarSection } from './Ai.tsx'
import { EpisodesScreen } from './Episodes.tsx'
import { PersonCredits, type PersonSelection } from './Person.tsx'

export function durationLabel(media: Media): string | null {
  const minutes = isSeries(media) ? media.episodeRuntime : media.runtime
  if (minutes <= 0) return null
  const duration = minutes >= 60 ? (minutes % 60 === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`) : `${minutes} min`
  return isSeries(media) ? `${duration} a episodio` : duration
}

/** Genre tag in the detail header; tappable ones show a chevron and open that genre's titles. */
export function GenrePill({ genre, clickable, style }: { genre: string; clickable: boolean; style?: CSSProperties }) {
  return (
    <div className="row" style={{ borderRadius: 999, background: 'var(--raised)', boxShadow: clickable ? 'inset 0 0 0 1px rgba(255,89,100,.3)' : undefined, padding: `4px ${clickable ? 5 : 9}px 4px 9px`, justifyContent: 'center', flex: 'none', ...style }}>
      <span style={{ color: 'var(--ink)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: '16px' }}>{genre}</span>
      {clickable && <Icon name="chevronRight" size={13} color="var(--accent)" style={{ marginLeft: 1 }} />}
    </div>
  )
}

export function GenreScreen({ type, genreId, genreName, onDismiss, onOpen, onAction }: { type: string; genreId: number; genreName: string; onDismiss: () => void; onOpen: OpenMedia; onAction: (m: Media) => void }) {
  const [results, setResults] = useState<Media[] | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  useStore()
  useEffect(() => {
    let alive = true
    tmdb.discover(type, 1, genreId, null, 'popular').catch(() => []).then((first) => { if (alive) { setResults(first); setHasMore(first.length > 0) } })
    return () => { alive = false }
  }, [type, genreId])
  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const next = page + 1
    const more = await tmdb.discover(type, next, genreId, null, 'popular').catch(() => [] as Media[])
    setPage(next)
    if (more.length === 0) setHasMore(false)
    else setResults((r) => dedupe([...(r ?? []), ...more]))
    setLoadingMore(false)
  }
  useBackHandler(true, onDismiss)
  return (
    <div className="fill col status-pad" style={{ background: 'var(--bg)' }}>
      <div className="row" style={{ padding: '8px 20px 0' }}>
        <GlassIconButton icon="back" label="Indietro" onClick={onDismiss} />
        <div className="grow col" style={{ padding: '0 14px' }}>
          <span style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 900, letterSpacing: 1.4, lineHeight: '16px' }}>{type === 'tv' ? 'SERIE TV · PIÙ POPOLARI' : 'FILM · PIÙ POPOLARI'}</span>
          <span className="t-headline-medium ellipsis" style={{ color: 'var(--ink)' }}>{genreName}</span>
        </div>
      </div>
      {results == null ? <div style={{ paddingTop: 24 }}><RailSkeleton title={null} /></div>
        : results.length === 0 ? <EmptyState icon="search" title="Nessun titolo trovato" body="Non ci sono titoli disponibili per questo genere al momento." />
          : <PosterGrid media={results} onOpen={onOpen} onLongPress={onAction} onEnd={loadMore} loadingMore={loadingMore} padding="16px 20px 32px" />}
    </div>
  )
}

const dedupe = (list: Media[]) => [...new Map(list.map((m) => [m.id, m])).values()]

function MediaImageCarousel({ images }: { images: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  if (images.length === 0) return null
  return (
    <div style={{ paddingTop: 26 }}>
      <div className="t-title-large" style={{ color: 'var(--ink)', padding: '10px 20px' }}>Immagini</div>
      <div ref={ref} className="hscroll row" style={{ gap: 10, padding: '0 20px', scrollSnapType: 'x mandatory', scrollPadding: '0 20px' }}
        onScroll={(e) => {
          const el = e.currentTarget
          const step = el.clientWidth - 40 + 10
          setPage(Math.max(0, Math.min(images.length - 1, Math.round(el.scrollLeft / step))))
        }}>
        {images.map((url) => (
          <RemoteImage key={url} url={url} style={{ flex: 'none', width: 'calc(100% - 40px)', minWidth: 'calc(100% - 40px)', aspectRatio: '16 / 9', borderRadius: 20, scrollSnapAlign: 'start' }} />
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'center', paddingTop: 10 }}>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{page + 1} / {images.length}</span>
      </div>
    </div>
  )
}

export function PeopleRail({ people, title = 'Cast', topPadding = 26, onPersonClick }: { people: Person[]; title?: string; topPadding?: number; onPersonClick: (p: Person, rect: Rect | null) => void }) {
  const [full, setFull] = useState(false)
  return (
    <div style={{ paddingTop: topPadding }}>
      <div className="row" style={{ padding: '10px 12px 10px 20px' }}>
        <span className="t-title-large grow" style={{ color: 'var(--ink)' }}>{title}</span>
        <button onClick={() => setFull(true)} style={{ height: 40, padding: '0 12px', color: 'var(--primary)', fontSize: 14, fontWeight: 700 }}>Tutti ({people.length})</button>
      </div>
      <div className="hscroll row" style={{ height: 120, padding: '0 20px', gap: 14, alignItems: 'flex-start' }}>
        {people.map((person) => <PersonBubble key={person.id + (person.director ? 'd' : '')} person={person} onClick={onPersonClick} />)}
      </div>
      <Dialog open={full} onDismiss={() => setFull(false)} fullHeight={0.86}>
        <div className="col" style={{ height: '100%', background: 'var(--bg)', borderRadius: 26, padding: 16 }}>
          <div className="row">
            <span className="t-title-large grow">{title === 'Regia' ? 'Registi' : title === 'Cast' ? 'Cast completo' : title}</span>
            <button className="center" aria-label="Chiudi elenco" onClick={() => setFull(false)} style={{ width: 40, height: 40, borderRadius: 20 }}><Icon name="close" /></button>
          </div>
          <div className="scroll" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: 8, rowGap: 12, alignContent: 'start', paddingBottom: 12 }}>
            {people.map((person) => (
              <div key={person.id + person.character} className="col" style={{ alignItems: 'center', cursor: 'pointer' }} onClick={() => { setFull(false); onPersonClick(person, null) }}>
                <RemoteImage url={person.profile} style={{ width: 72, height: 72, borderRadius: '50%' }} />
                <span className="clamp2" style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 700, marginTop: 6, textAlign: 'center', lineHeight: '16px' }}>{person.name}</span>
                {person.character.trim() !== '' && <span className="clamp2" style={{ color: 'var(--muted)', fontSize: 10, textAlign: 'center', lineHeight: '14px' }}>{person.character}</span>}
              </div>
            ))}
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function PersonBubble({ person, onClick }: { person: Person; onClick: (p: Person, rect: Rect | null) => void }) {
  const photo = useRef<HTMLDivElement>(null)
  return (
    <Press className="col" style={{ width: 84, height: 120, alignItems: 'center', flex: 'none' }} onClick={() => onClick(person, boundsOf(photo.current))} onLongPress={() => {}}>
      {/* The person page grows out of this circle, not the whole photo-and-name block. */}
      <div ref={photo} style={{ width: 76, height: 76, borderRadius: '50%', padding: 2, background: 'linear-gradient(135deg, #D7142B, #FF4B45)', flex: 'none' }}>
        <RemoteImage url={person.profile} fallbackIcon="person" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
      </div>
      <span className="clamp2" style={{ color: 'var(--ink)', fontSize: 12, lineHeight: '15px', fontWeight: 700, marginTop: 6, height: 38, textAlign: 'center', width: '100%' }}>{person.name}</span>
    </Press>
  )
}

export function providerServiceUrl(provider: Provider): string | null {
  const name = provider.name.toLowerCase()
  const has = (s: string) => name.includes(s)
  if (provider.id === 8 || has('netflix')) return 'https://www.netflix.com/'
  if (provider.id === 9 || provider.id === 10 || provider.id === 119 || has('prime video') || has('amazon')) return 'https://www.primevideo.com/'
  if (provider.id === 2 || provider.id === 350 || has('apple tv')) return 'https://tv.apple.com/it/'
  if (provider.id === 3 || has('google play')) return 'https://play.google.com/store/movies'
  if (provider.id === 35 || has('rakuten')) return 'https://www.rakuten.tv/it'
  if (provider.id === 40 || has('chili')) return 'https://www.chili.com/it'
  if (provider.id === 337 || has('disney')) return 'https://www.disneyplus.com/it-it'
  if (provider.id === 531 || has('paramount')) return 'https://www.paramountplus.com/it/'
  if (provider.id === 1899 || name === 'max' || has('hbo max')) return 'https://play.max.com/'
  if (has('timvision')) return 'https://www.timvision.it/'
  if (has('sky')) return 'https://www.sky.it/sky-go'
  if (name === 'now' || has('now tv')) return 'https://www.nowtv.it/'
  if (has('raiplay') || has('rai play')) return 'https://www.raiplay.it/'
  if (has('mediaset') || has('infinity')) return 'https://mediasetinfinity.mediaset.it/'
  if (has('discovery')) return 'https://www.discoveryplus.com/it/'
  if (has('crunchyroll')) return 'https://www.crunchyroll.com/it/'
  if (has('mubi')) return 'https://mubi.com/it/'
  if (has('dazn')) return 'https://www.dazn.com/it-IT/home'
  if (has('pluto')) return 'https://pluto.tv/it/'
  if (has('plex')) return 'https://watch.plex.tv/it/'
  if (has('youtube')) return 'https://www.youtube.com/'
  return null
}

function ProviderGridCard({ title, subtitle, providers, included }: { title: string; subtitle: string; providers: [Provider, string][]; included: boolean }) {
  const secondary = '#9C9BAA'
  return (
    <div style={{ borderRadius: 25, boxShadow: `inset 0 0 0 1px ${included ? '#4A2A22' : '#292C34'}`, marginBottom: 16, overflow: 'hidden',
      background: included ? 'linear-gradient(135deg, #261611, #0A0B10, #15100E)' : 'linear-gradient(135deg, #12141B, #090B10)', padding: 12 }}>
      <div className="row" style={{ paddingBottom: 13 }}>
        <div className="center" style={{ width: 38, height: 38, borderRadius: '50%', background: 'radial-gradient(circle, #5A2418, #2A1510)', boxShadow: 'inset 0 0 0 1px #5A2A1E', flex: 'none' }}>
          <Icon name={included ? 'broadcast' : 'cart'} size={23} color="var(--accent)" />
        </div>
        <div className="grow col" style={{ paddingLeft: 10 }}>
          <span style={{ color: '#F4F3F7', fontWeight: 700, fontSize: 17, lineHeight: '21px' }}>{title}</span>
          <span style={{ color: secondary, fontSize: 12, lineHeight: '16px', marginTop: 3 }}>{subtitle}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: 7, rowGap: 9 }}>
        {providers.map(([provider, label]) => {
          const url = providerServiceUrl(provider)
          return (
            <Press key={provider.id} pressed={url ? 0.95 : 1} onClick={() => { if (url) window.open(url, '_blank', 'noopener') }} className="col"
              style={{ background: '#0F1117', borderRadius: 17, boxShadow: 'inset 0 0 0 1px #30313B', padding: '11px 6px', alignItems: 'center', cursor: url ? 'pointer' : 'default' }}>
              <RemoteImage url={provider.logo} fit="contain" style={{ width: 46, height: 46, borderRadius: 13 }} />
              <span style={{ color: '#F4F3F7', fontWeight: 700, fontSize: 12, lineHeight: '15px', textAlign: 'center', width: '100%', marginTop: 8, minHeight: 30 }}>{provider.name}</span>
              <div style={{ flex: 1 }} />
              <div className="row" style={{ marginTop: 8, width: '100%', justifyContent: 'center', borderRadius: 999, padding: '6px 5px', background: included ? '#40201A' : 'transparent', boxShadow: `inset 0 0 0 1px ${included ? '#7A3A2A' : '#494854'}` }}>
                <Icon name={included ? 'check' : 'cart'} size={13} color={included ? 'var(--accent)' : secondary} />
                <span style={{ marginLeft: 4, color: included ? 'var(--accent)' : secondary, fontSize: 9, lineHeight: '12px', fontWeight: included ? 600 : 400, textAlign: 'center' }}>{label}</span>
              </div>
            </Press>
          )
        })}
      </div>
    </div>
  )
}

function ProviderGroups({ media }: { media: Media }) {
  const streaming: [Provider, string][] = dedupeProviders(media.flatrate).map((p) => [p, 'Incluso'])
  const grouped = new Map<number, [Provider, string[]]>()
  for (const [p, label] of [...media.rent.map((p) => [p, 'Noleggio'] as const), ...media.buy.map((p) => [p, 'Acquisto'] as const)]) {
    const current = grouped.get(p.id)
    if (current) { if (!current[1].includes(label)) current[1].push(label) } else grouped.set(p.id, [p, [label]])
  }
  const paid: [Provider, string][] = [...grouped.values()].map(([p, labels]) => [p, labels.join(' / ')])
  return (
    <div style={{ padding: '30px 20px 22px' }}>
      <div className="t-title-large" style={{ fontWeight: 900, paddingBottom: 12, color: 'var(--ink)' }}>Dove guardarlo</div>
      {streaming.length > 0 && <ProviderGridCard title="Streaming incluso" subtitle="Disponibile con l’abbonamento" providers={streaming} included />}
      {paid.length > 0 && <ProviderGridCard title="Noleggio e acquisto" subtitle="Disponibile per il noleggio o l’acquisto" providers={paid} included={false} />}
      {streaming.length === 0 && paid.length === 0 && (
        <div className="row" style={{ background: 'var(--surface)', borderRadius: 17, boxShadow: 'inset 0 0 0 1px #302D34', padding: 16 }}>
          <div className="center" style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,89,100,.14)', flex: 'none' }}>
            <Icon name="visibilityOff" size={22} color="var(--secondary)" />
          </div>
          <div className="col" style={{ paddingLeft: 12 }}>
            <span style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 13, lineHeight: '18px' }}>Nessuna disponibilità rilevata in Italia</span>
            <span style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3, lineHeight: '14px' }}>I risultati possono variare in base alla posizione.</span>
          </div>
        </div>
      )}
    </div>
  )
}

const dedupeProviders = (list: Provider[]) => [...new Map(list.map((p) => [p.id, p])).values()]

/** rememberFollowToggle: follows or stops following, asking for notifications the first time. */
export async function toggleFollow(media: Media, info: ReleaseInfo | null) {
  if (followOf(media.id)) {
    await unfollow(media.id)
    return
  }
  const follow: ReleaseFollow = newReleaseFollow(media, Date.now())
  if (info) initialize(follow, info, todayRome())
  await saveFollow(follow)
  if (!(await notificationsAllowed())) {
    const granted = await enablePush()
    if (!granted) showToast('Senza notifiche non potrò avvisarti delle uscite')
  }
}

function FollowReleaseCard({ media }: { media: Media }) {
  const { version } = useStore()
  const [info, setInfo] = useState<ReleaseInfo | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [notificationsOn, setNotificationsOn] = useState(true)
  const followed = followOf(media.id) != null
  useEffect(() => {
    let alive = true
    tmdb.releaseInfo(media).then((i) => { if (alive) setInfo(i) }, () => {}).finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [media.id])
  useEffect(() => { void notificationsAllowed().then(setNotificationsOn) }, [version])
  const today = todayRome()
  // Fresh data describes the title; the stored follow is the fallback while offline.
  const state = useMemo(() => {
    if (info) { const f = newReleaseFollow(media, 0); initialize(f, info, today); return f }
    const stored = followOf(media.id)
    return stored?.initialized ? stored : null
  }, [info, followed, version])
  const visible = (followed || (info != null && worthFollowing(media, info))) && (loaded || followed)
  const accent = followed ? 'var(--amber)' : 'var(--secondary)'
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div key="follow" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto', transition: { opacity: tween(220), height: spring(1, 1500) } }}
          exit={{ opacity: 0, height: 0, transition: { opacity: tween(160), height: spring(1, 1500) } }} style={{ overflow: 'hidden' }}>
          <div style={{ marginTop: 14, borderRadius: 22, background: followed ? 'rgba(255,194,77,.10)' : 'var(--raised)', boxShadow: `inset 0 0 0 1px ${followed ? 'rgba(255,194,77,.45)' : 'var(--outline)'}`, padding: '14px 15px' }}>
            <div className="row">
              <div className="center" style={{ width: 46, height: 46, borderRadius: '50%', background: followed ? 'rgba(255,194,77,.16)' : 'rgba(255,89,100,.16)', flex: 'none', transition: 'background .3s' }}>
                <Icon name={followed ? 'notifications' : 'notificationsNone'} size={24} color={accent} />
              </div>
              <div className="grow col" style={{ padding: '0 8px 0 12px' }}>
                <span style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 16 }}>{followed ? 'Stai seguendo' : isSeries(media) ? 'Segui la serie' : 'Segui l’uscita'}</span>
                <span style={{ color: followed ? 'var(--amber)' : 'var(--muted)', fontSize: 13, lineHeight: '18px', marginTop: 2 }}>{state ? describe(state, today) : 'Dati di uscita non disponibili'}</span>
              </div>
              {followed ? (
                <Press pressed={0.96} onClick={() => void toggleFollow(media, info)} className="row"
                  style={{ height: 40, borderRadius: 16, padding: '0 12px', boxShadow: 'inset 0 0 0 1px rgba(255,194,77,.6)', color: 'var(--amber)', fontSize: 13, fontWeight: 700, gap: 5, flex: 'none' }}>
                  <Icon name="check" size={17} /> Seguito
                </Press>
              ) : (
                <Press pressed={0.96} onClick={() => void toggleFollow(media, info)} className="row brand-glow"
                  style={{ height: 40, borderRadius: 16, padding: '0 14px', ['--glow' as string]: '5px', color: '#fff', fontSize: 13, fontWeight: 700, gap: 5, flex: 'none' }}>
                  <Icon name="add" size={17} /> Segui
                </Press>
              )}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: '17px', marginTop: 10 }}>
              {isSeries(media)
                ? 'Ti avviso con una notifica il giorno di uscita di ogni nuovo episodio e quando viene annunciata una nuova stagione.'
                : 'Ti avviso con una notifica il giorno dell’uscita in Italia e quando arriva in streaming in abbonamento.'}
            </div>
            {state && upcomingDate(state, today) !== '' && (
              <Press pressed={0.96} onClick={() => addReleaseToCalendar(state, upcomingDate(state, today))} className="row"
                style={{ marginTop: 8, gap: 6, color: accent, fontSize: 13, fontWeight: 600, padding: '6px 0' }}>
                <Icon name="calendar" size={17} /> {isSeries(media) ? 'Aggiungi il prossimo episodio al calendario' : 'Aggiungi l’uscita al calendario'}
              </Press>
            )}
            {followed && !notificationsOn && (
              <div className="row" style={{ marginTop: 6 }}>
                <span className="grow" style={{ color: 'var(--error)', fontSize: 13 }}>Le notifiche sono disattivate.</span>
                <DialogButton onClick={() => void enablePush().then(setNotificationsOn)}>Attiva</DialogButton>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** "Ti è piaciuto?": the choice springs up, then is applied after 340 ms. */
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
      <div className="col" style={{ background: 'var(--surface)', borderRadius: 30, boxShadow: 'inset 0 0 0 1px var(--outline)', padding: 24, alignItems: 'center' }}>
        <div className="brand-glow center" style={{ width: 58, height: 58, borderRadius: '50%', ['--glow' as string]: '10px' }}>
          <Icon name="check" size={29} color="#fff" />
        </div>
        <span className="t-headline-medium" style={{ color: 'var(--ink)', marginTop: 18 }}>Ti è piaciuto?</span>
        <span style={{ color: 'var(--muted)', textAlign: 'center', lineHeight: '21px', marginTop: 8, marginBottom: 20 }}>
          {alreadyWatched ? `Aggiorna il tuo voto per “${title}”.` : `Scegli per completare “${title}” e rendere i consigli più tuoi.`}
        </span>
        <div className="row" style={{ gap: 12, width: '100%' }}>
          {[true, false].map((liked) => {
            const active = selected === liked
            const accent = liked ? '61,220,151' : '255,92,122'
            return (
              <motion.div key={String(liked)} className="grow col center" animate={{ scale: active ? 1.08 : 1 }} transition={spring(0.5, 1500)}
                onClick={() => { if (selected == null) setSelected(liked) }}
                style={{ height: 105, borderRadius: 22, background: `rgba(${accent},${active ? 0.28 : 0.12})`, boxShadow: `inset 0 0 0 1px rgba(${accent},${active ? 1 : 0.55})`, cursor: 'pointer' }}>
                <ReactionIcon liked={liked} size={35} />
                <span style={{ color: `rgb(${accent})`, fontWeight: 700, marginTop: 8 }}>{liked ? 'Mi piace' : 'Non mi piace'}</span>
              </motion.div>
            )
          })}
        </div>
        <button disabled={selected != null} onClick={onDismiss} style={{ marginTop: 8, height: 40, padding: '0 12px', color: 'var(--muted)', fontSize: 14, fontWeight: 700 }}>Non adesso</button>
      </div>
    </Dialog>
  )
}

export type DetailProps = {
  initial: Media
  backEnabled: boolean
  onClose: () => void
  onOpen: OpenMedia
  onAction: (m: Media) => void
  onReroll: (() => void) | null
  rerolling: boolean
}

function Section({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={style}>{children}</div>
}

export function DetailScreen({ initial, backEnabled, onClose, onOpen, onAction, onReroll, rerolling }: DetailProps) {
  useStore()
  const [media, setMedia] = useState(initial)
  const [related, setRelated] = useState<Media[]>([])
  const [relatedPage, setRelatedPage] = useState(1)
  const [relatedHasMore, setRelatedHasMore] = useState(false)
  const [relatedLoadingMore, setRelatedLoadingMore] = useState(false)
  const [saga, setSaga] = useState<Media[]>([])
  const [gallery, setGallery] = useState<string[]>([])
  const [episodes, setEpisodes] = useState<Rect | null | false>(false)
  const [genrePage, setGenrePage] = useState<{ id: number; name: string; origin: Rect | null } | null>(null)
  const [hideConfirm, setHideConfirm] = useState(false)
  const [person, setPerson] = useState<PersonSelection | null>(null)
  const [showReaction, setShowReaction] = useState(false)
  const [quickLoading, setQuickLoading] = useState(false)
  const [pendingEpisodeReaction, setPendingEpisodeReaction] = useState<((liked: boolean) => void) | null>(null)
  const [posterFullscreen, setPosterFullscreen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [reload, setReload] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [overviewExpanded, setOverviewExpanded] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const scrollY = useMotionValue(0)

  const entry = entryOf(media)
  const state = stateOf(media)
  const inList = state === 'saved' || state === 'progress' || state === 'watched'
  const watched = state === 'watched'
  const reaction = entry?.liked ?? null
  const pinned = entry?.pinned === true

  const closeDetail = () => { if (!closing) { setClosing(true); onClose() } }
  useBackHandler(posterFullscreen, () => setPosterFullscreen(false))
  useBackHandler(backEnabled && !posterFullscreen, closeDetail)

  useEffect(() => {
    let alive = true
    const manual = reload > 0
    if (manual) setRefreshing(true)
    ;(async () => {
      const detailed = await tmdb.details(initial).catch(() => null)
      if (!alive) return
      if (detailed) {
        detailed.backdrops = await tmdb.backdrops(detailed).catch(() => [])
        if (!alive) return
        setMedia(detailed)
        setGallery(detailed.backdrops)
        mergeDetails(detailed)
        if (stateOf(detailed) === 'watched') {
          const seasons = await tmdb.seasons(detailed, false).catch(() => null)
          const reopened = seasons ? lib.reopenForNewEpisodes(entryOf(detailed), seasons) : null
          if (reopened) void saveEntry({ ...reopened, media: detailed })
        }
        const sagaList = await tmdb.saga(detailed).catch(() => [] as Media[])
        const first = await tmdb.related(detailed, 1).catch(() => [] as Media[])
        if (!alive) return
        setSaga(sagaList)
        setRelatedPage(1)
        setRelatedHasMore(first.length >= 20)
        setRelated(first.filter((c) => c.id !== detailed.id && !sagaList.some((s) => s.id === c.id)))
      } else if (manual) showToast('Aggiornamento dei dati non riuscito')
      if (manual) setRefreshing(false)
    })()
    return () => { alive = false }
  }, [initial.id, reload])

  const loadMoreRelated = async () => {
    if (relatedLoadingMore || !relatedHasMore) return
    setRelatedLoadingMore(true)
    const next = relatedPage + 1
    const list = await tmdb.related(media, next).catch(() => [] as Media[])
    setRelated((r) => dedupe([...r, ...list.filter((c) => c.id !== media.id && !saga.some((s) => s.id === c.id))]))
    setRelatedPage(next)
    setRelatedHasMore(list.length >= 20)
    setRelatedLoadingMore(false)
  }

  const markNextEpisode = async () => {
    if (quickLoading || !entry) return
    setQuickLoading(true)
    const { nextSeason, nextEpisode } = entry
    const seasons = await tmdb.seasons(media, true).catch(() => [])
    const list = lib.flatten(seasons)
    const next = list.find((e) => e.season === nextSeason && e.number === nextEpisode)
    if (next && next === list[list.length - 1]) setPendingEpisodeReaction(() => (liked: boolean) => void saveEntry(lib.markEpisode(entryOf(media), media, next, seasons, liked)))
    else if (next) void saveEntry(lib.markEpisode(entryOf(media), media, next, seasons, null))
    setQuickLoading(false)
  }

  const backdropUrl = media.backdrop || initial.backdrop || initial.poster
  const parallaxY = useTransform(scrollY, (y) => y * 0.5)
  const parallaxScale = useTransform(scrollY, (y) => 1 + y / 4000)
  const barAlpha = useMotionValue(0)
  const [barSolid, setBarSolid] = useState(false)
  useEffect(() => { /* animate the top bar like animateFloatAsState(tween 240) */
    const target = barSolid ? 1 : 0
    const start = barAlpha.get()
    const t0 = performance.now()
    let frame = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 240)
      barAlpha.set(start + (target - start) * p)
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [barSolid])
  const barBackground = useTransform(barAlpha, (a) => `rgba(10,11,16,${0.96 * a})`)
  const titleY = useTransform(barAlpha, (a) => (1 - a) * 12)

  return (
    <div className="fill" style={{ background: 'var(--bg)' }}>
      <div ref={scroller} className="fill scroll" style={{ overflowY: closing ? 'hidden' : 'auto', paddingBottom: 44 }}
        onScroll={(e) => {
          const y = e.currentTarget.scrollTop
          scrollY.set(Math.min(y, 520))
          setBarSolid(y > 330)
        }}>
        <div style={{ position: 'relative', height: 520 }}>
          {/* Parallax: the backdrop drifts at half speed but stays clipped to its own area. */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 420, overflow: 'hidden' }}>
            <motion.div className="fill" style={{ y: parallaxY, scale: parallaxScale }}>
              <RemoteImage url={backdropUrl} animatedPlaceholder style={{ position: 'absolute', inset: 0 }} />
            </motion.div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 422, background: 'linear-gradient(180deg, rgba(0,0,0,.55) 0%, transparent 30%, rgba(10,11,16,.55) 68%, #0A0B10 100%)' }} />
          <div className="row" style={{ position: 'absolute', left: 20, right: 20, bottom: 0, alignItems: 'flex-end' }}>
            <div style={{ width: 134, aspectRatio: '0.68', flex: 'none', borderRadius: 20, boxShadow: '0 13px 30px rgba(215,20,43,.35)' }}>
              <AnimatePresence initial={false}>
                {!posterFullscreen && (
                  <motion.div key="poster" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: tween(220) }} exit={{ opacity: 0, transition: tween(140) }}
                    onClick={() => setPosterFullscreen(true)} style={{ width: '100%', height: '100%', borderRadius: 20, overflow: 'hidden', position: 'relative', cursor: 'pointer' }}>
                    <RemoteImage url={initial.poster || initial.backdrop} animatedPlaceholder style={{ position: 'absolute', inset: 0 }} />
                    <div className="fill" style={{ borderRadius: 20, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)' }} />
                    {reaction != null && <ReactionBadge liked={reaction} style={{ position: 'absolute', top: 8, right: 8, transform: 'scale(.85)' }} />}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="grow col" style={{ paddingLeft: 16, paddingBottom: 4 }}>
              <span style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 900, letterSpacing: 1.6, lineHeight: '16px' }}>{isSeries(media) ? 'SERIE TV' : 'FILM'}</span>
              <span className="t-headline-medium" style={{ color: 'var(--ink)', marginTop: 4, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{media.title}</span>
              {media.tagline.trim() !== '' && <span className="clamp2" style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '17px', fontStyle: 'italic', marginTop: 6 }}>{media.tagline}</span>}
            </div>
          </div>
        </div>
        <Reveal distance={20} style={{ padding: '0 20px' }}>
          <div className="hscroll row" style={{ paddingTop: 18, gap: 7 }}>
            {media.rating > 0 && <MetaPill text={rating(media.rating)} icon="star" tint="var(--amber)" background="rgba(255,194,77,.14)" />}
            <MetaPill text={media.year} background="var(--raised)" />
            {durationLabel(media) && <MetaPill text={durationLabel(media)!} background="var(--raised)" />}
            {media.genres.slice(0, 3).map((genre, index) => {
              // Names and ids come from the same TMDB list, so the first entries line up.
              const genreId = media.genreIds[index]
              return genreId != null
                ? <Press key={genre} pressed={0.95} onClick={(el) => setGenrePage({ id: genreId, name: genre, origin: boundsOf(el) })}><GenrePill genre={genre} clickable /></Press>
                : <GenrePill key={genre} genre={genre} clickable={false} />
            })}
          </div>
          <div className="row" style={{ paddingTop: 18, height: 56 + 18, gap: 10 }}>
            <Press pressed={0.97} className="grow brand-glow center" onClick={() => { if (inList) void removeEntry(media); else void saveEntry(lib.save(entryOf(media), media)) }}
              style={{ height: 56, borderRadius: 18, padding: '0 10px', color: '#fff' }}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div key={String(inList)} className="row" style={{ gap: 6, justifyContent: 'center' }} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={tween(220)}>
                  <Icon name={inList ? 'check' : 'add'} size={20} />
                  <span className="ellipsis" style={{ fontSize: 13, fontWeight: 700 }}>{inList ? 'Nella mia lista' : 'Aggiungi alla lista'}</span>
                </motion.div>
              </AnimatePresence>
            </Press>
            {isSeries(media) ? (
              <Press pressed={0.97} className="grow brand-glow center" onClick={(el) => setEpisodes(boundsOf(el))}
                style={{ height: 56, borderRadius: 18, padding: '0 10px', color: '#fff', gap: 6 }}>
                <Icon name="tv" size={20} /><span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>Episodi</span>
              </Press>
            ) : (
              <Press pressed={0.97} className={'grow center ' + (watched ? 'brand-glow' : '')}
                onClick={() => { if (watched) void saveEntry(lib.markMovieUnwatched(entryOf(media), media)); else setShowReaction(true) }}
                style={{ height: 56, borderRadius: 18, padding: '0 10px', gap: 6, ['--glow' as string]: '6px', background: watched ? undefined : 'var(--raised)', color: watched ? '#fff' : 'var(--ink)' }}>
                <Icon name="check" size={20} /><span className="ellipsis" style={{ fontSize: 13, fontWeight: 700 }}>{watched ? 'Già visto' : 'Segna come visto'}</span>
              </Press>
            )}
          </div>
          {isSeries(media) && entry?.state === 'progress' && (
            <Press pressed={quickLoading ? 1 : 0.97} disabled={quickLoading} onClick={() => void markNextEpisode()} className="row center"
              style={{ marginTop: 12, height: 54, borderRadius: 18, gap: 8, background: quickLoading ? 'var(--raised)' : 'rgba(61,220,151,.15)', color: quickLoading ? 'var(--muted)' : 'var(--like)', boxShadow: 'inset 0 0 0 1px rgba(61,220,151,.48)', padding: '0 16px' }}>
              {quickLoading ? <Spinner size={20} stroke={2} color="var(--like)" /> : <Icon name="check" size={21} />}
              <span className="ellipsis" style={{ fontWeight: 700, fontSize: 14 }}>{quickLoading ? 'Aggiornamento…' : `Segna S${entry.nextSeason} · E${entry.nextEpisode} come visto`}</span>
            </Press>
          )}
          {onReroll && (
            <Press pressed={rerolling ? 1 : 0.97} disabled={rerolling} onClick={onReroll} className={'row center ' + (rerolling ? '' : 'brand-glow')}
              style={{ marginTop: 12, height: 54, borderRadius: 18, gap: 9, ['--glow' as string]: '8px', background: rerolling ? 'var(--raised)' : undefined, color: rerolling ? 'var(--muted)' : '#fff' }}>
              {rerolling ? <Spinner size={21} stroke={2} /> : <Icon name="sparkles" size={22} />}
              <span style={{ fontWeight: 700, fontSize: 14 }}>{rerolling ? 'Sto scegliendo…' : 'Sorprendimi ancora'}</span>
            </Press>
          )}
          {watched && (() => {
            const color = reaction === true ? '61,220,151' : reaction === false ? '255,92,122' : '255,89,100'
            return (
              <Press pressed={0.97} onClick={() => setShowReaction(true)} className="row"
                style={{ marginTop: 12, alignSelf: 'flex-start', display: 'inline-flex', borderRadius: 16, padding: '9px 13px', background: `rgba(${color},.13)`, boxShadow: `inset 0 0 0 1px rgba(${color},.48)` }}>
                {reaction != null ? <ReactionIcon liked={reaction} size={20} /> : <Icon name="thumbUp" size={20} color="var(--secondary)" />}
                <span style={{ marginLeft: 9, color: `rgb(${color})`, fontWeight: 600 }}>
                  {reaction === true ? 'Ti è piaciuto · Cambia voto' : reaction === false ? 'Non ti è piaciuto · Cambia voto' : 'Valuta questo titolo'}
                </span>
              </Press>
            )
          })()}
          <FollowReleaseCard media={media} />
          <div className="t-title-large" style={{ color: 'var(--ink)', marginTop: 26 }}>Trama</div>
          <motion.div layout transition={tween(320, emphasized)} onClick={() => setOverviewExpanded(!overviewExpanded)}
            style={{ marginTop: 8, color: 'var(--muted)', fontSize: 16, lineHeight: '24px', overflow: 'hidden', cursor: 'pointer', ...(overviewExpanded ? {} : { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }) }}>
            {media.overview}
          </motion.div>
          {media.overview.length > 220 && (
            <span onClick={() => setOverviewExpanded(!overviewExpanded)} style={{ display: 'inline-block', marginTop: 6, color: 'var(--accent)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              {overviewExpanded ? 'Mostra meno' : 'Leggi tutto'}
            </span>
          )}
        </Reveal>
        <MediaImageCarousel images={gallery} />
        {media.directors.length > 0 && <PeopleRail people={media.directors} title="Regia" onPersonClick={(p, rect) => setPerson({ person: p, source: rect })} />}
        {media.cast.length > 0 && <PeopleRail people={media.cast} onPersonClick={(p, rect) => setPerson({ person: p, source: rect })} />}
        <ProviderGroups media={media} />
        {saga.length > 0 && <MediaRail title="Della stessa saga" media={saga} onOpen={onOpen} onAction={onAction} spacious revealId={'saga:' + media.id} />}
        {related.length > 0 && <MediaRail title="Potrebbe piacerti" media={related} onOpen={onOpen} onAction={onAction} spacious revealId={'related:' + media.id}
          loadMore={relatedHasMore ? () => void loadMoreRelated() : null} loadingMore={relatedLoadingMore} />}
        <Section><AiSimilarSection media={media} onOpen={onOpen} /></Section>
        <div style={{ height: 44 }} />
      </div>

      <motion.div className="row status-pad" style={{ position: 'absolute', left: 0, right: 0, top: 0, background: barBackground, padding: '8px 14px', paddingTop: 'calc(8px + var(--safe-top))' }}>
        <GlassIconButton icon="back" label="Indietro" onClick={closeDetail} />
        <motion.span className="grow ellipsis" style={{ color: 'var(--ink)', fontWeight: 800, fontSize: 17, padding: '0 12px', opacity: barAlpha, y: titleY }}>{media.title}</motion.span>
        <div className="row" style={{ gap: 8 }}>
          <Press pressed={0.88} className="glass center" onClick={() => { if (!refreshing) setReload((r) => r + 1) }} style={{ width: 44, height: 44, borderRadius: '50%' }}>
            {refreshing ? <Spinner size={20} stroke={2} color="#fff" /> : <Icon name="refresh" size={21} color="#fff" />}
          </Press>
          {inList && <GlassIconButton icon="pushPin" label={pinned ? 'Rimuovi dai fissati' : 'Fissa in cima alla home'} highlighted={pinned} onClick={() => void saveEntry(lib.togglePinned(entryOf(media)))} />}
          <GlassIconButton icon="visibilityOff" label="Nascondi" onClick={() => setHideConfirm(true)} />
        </div>
      </motion.div>

      <PosterViewer open={posterFullscreen} url={(initial.poster || initial.backdrop).replace('/w342/', '/original/').replace('/w780/', '/original/')} onClose={() => setPosterFullscreen(false)} />

      {person && <PersonCredits person={person.person} source={person.source} dismiss={() => setPerson(null)} onOpen={onOpen} />}
      {genrePage && (
        <ExpandingPage source={genrePage.origin} onClosed={() => setGenrePage(null)} sourceCorner={14}
          sourceArt={<GenrePill genre={genrePage.name} clickable style={{ width: '100%', height: '100%' }} />}>
          {(close) => <GenreScreen type={media.mediaType} genreId={genrePage.id} genreName={genrePage.name} onDismiss={close} onOpen={onOpen} onAction={onAction} />}
        </ExpandingPage>
      )}
      {/* The episodes page grows out of the button itself, drawn as it looks. */}
      {episodes !== false && (
        <ExpandingPage source={episodes} onClosed={() => setEpisodes(false)} sourceCorner={18}
          sourceArt={<div className="row center" style={{ width: '100%', height: '100%', background: 'var(--brand)', borderRadius: 18, gap: 6, color: '#fff' }}><Icon name="tv" size={20} /><span style={{ fontSize: 13, fontWeight: 500 }}>Episodi</span></div>}>
          {(close) => <EpisodesScreen media={media} onDismiss={close} />}
        </ExpandingPage>
      )}
      <ReactionDialog open={showReaction} title={media.title} alreadyWatched={watched} onDismiss={() => setShowReaction(false)}
        onChoice={(liked) => { void saveEntry(watched ? lib.setLiked(entryOf(media), liked) : lib.watched(entryOf(media), media, liked)); setShowReaction(false) }} />
      <ReactionDialog open={pendingEpisodeReaction != null} title={media.title} onDismiss={() => setPendingEpisodeReaction(null)}
        onChoice={(liked) => { pendingEpisodeReaction?.(liked); setPendingEpisodeReaction(null) }} />
      <AlertDialog open={hideConfirm} onDismiss={() => setHideConfirm(false)} title="Nascondere questo titolo?"
        text="Il film o la serie verrà nascosto dal catalogo e dalle proposte."
        confirm={{ label: 'Nascondi', onClick: () => { void saveEntry(lib.hide(entryOf(media), media)); setHideConfirm(false); closeDetail() } }}
        dismiss={{ label: 'Annulla', onClick: () => setHideConfirm(false) }} />
    </div>
  )
}

/** Full screen poster with pinch zoom (1–5×) and pan. */
function PosterViewer({ open, url, onClose }: { open: boolean; url: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ dist: number; zoom: number; mid: { x: number; y: number }; pan: { x: number; y: number } } | null>(null)
  useEffect(() => { if (open) { setZoom(1); setPan({ x: 0, y: 0 }) } }, [open])
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="viewer" className="fill" style={{ background: '#000', zIndex: 5, touchAction: 'none' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(180)}
          onPointerDown={(e) => { pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); gesture.current = null }}
          onPointerMove={(e) => {
            const prev = pointers.current.get(e.pointerId)
            if (!prev) return
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
            const pts = [...pointers.current.values()]
            if (pts.length >= 2) {
              const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
              const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
              if (!gesture.current) gesture.current = { dist, zoom, mid, pan }
              const next = Math.min(5, Math.max(1, gesture.current.zoom * (dist / gesture.current.dist)))
              setZoom(next)
              setPan(next === 1 ? { x: 0, y: 0 } : { x: gesture.current.pan.x + mid.x - gesture.current.mid.x, y: gesture.current.pan.y + mid.y - gesture.current.mid.y })
            } else if (zoom > 1) {
              setPan((p) => ({ x: p.x + e.clientX - prev.x, y: p.y + e.clientY - prev.y }))
            }
          }}
          onPointerUp={(e) => { pointers.current.delete(e.pointerId); gesture.current = null }}
          onPointerCancel={(e) => { pointers.current.delete(e.pointerId); gesture.current = null }}
          onWheel={(e) => { const next = Math.min(5, Math.max(1, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); setZoom(next); if (next === 1) setPan({ x: 0, y: 0 }) }}>
          <div className="fill center">
            <div style={{ width: '100%', maxHeight: 760, aspectRatio: '0.68', transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
              <RemoteImage url={url} fit="contain" background="transparent" style={{ width: '100%', height: '100%' }} />
            </div>
          </div>
          <button className="center" aria-label="Chiudi locandina" onClick={onClose}
            style={{ position: 'absolute', top: 'calc(16px + var(--safe-top))', left: 16, width: 40, height: 40, borderRadius: 20, background: 'rgba(20,22,30,.8)', color: 'var(--ink)' }}>
            <Icon name="close" />
          </button>
          {zoom > 1 && (
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
              style={{ position: 'absolute', bottom: 'calc(18px + var(--safe-bottom))', left: '50%', transform: 'translateX(-50%)', height: 40, padding: '0 24px', borderRadius: 20, background: 'rgba(20,22,30,.8)', color: 'var(--ink)', fontSize: 14, fontWeight: 700 }}>
              Ripristina zoom
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
