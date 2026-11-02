// StreamWiseApp of MainActivity.kt: the four tabs under the floating bar and, above them, the pages
// that grow out of what was tapped (search, AI, settings, filters, sagas, people, the detail stack),
// plus the account gate the web version needs.
import { AnimatePresence, animate, motion, useMotionValue } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { Media, Person } from '../../shared/model.ts'
import { emptyMedia } from '../../shared/model.ts'
import { todayRome, isIsoDate } from '../../shared/dates.ts'
import { api, authEvents } from './lib/api.ts'
import { checkReleases, entryOf, followOf, getStore, prefs, refresh, setPrefs, setUser, useStore } from './lib/store.ts'
import { syncPush } from './lib/push.ts'
import { tmdb } from './lib/tmdb.ts'
import { SubscriptionProvider } from './lib/subscriptions.tsx'
import { emphasized, fastOutSlowIn, tween } from './components/motion.ts'
import { ContainerTransform, ExpandingPage } from './components/Transform.tsx'
import { AuroraBackground, FloatingNavBar, RemoteImage, Spinner, type Rect } from './components/ui.tsx'
import { AiCardArt, FIND_TITLE, FIND_TITLE_SUBTITLE, type ArtSource, type OpenMedia } from './components/cards.tsx'
import { ToastHost } from './components/overlay.tsx'
import { HomeScreen, homeReselect } from './screens/Home.tsx'
import { DiscoverScreen } from './screens/Discover.tsx'
import { TvGuideScreen } from './screens/Guide.tsx'
import { LibraryScreen, SagaDetailScreen, type LibrarySection, type SagaCollection } from './screens/Library.tsx'
import { DetailScreen } from './screens/Detail.tsx'
import { SearchScreen } from './screens/Search.tsx'
import { AiScreen, FindTitleScreen } from './screens/Ai.tsx'
import { SettingsScreen, pickBackup } from './screens/Settings.tsx'
import { FilterScreen } from './screens/Filters.tsx'
import { ActionSheet, AdvisorSheet, chooseAdvisorTitle, type AdvisorRequest } from './screens/Sheets.tsx'
import { PersonCredits, type PersonSelection } from './screens/Person.tsx'
import { OnboardingScreen } from './screens/Onboarding.tsx'
import { LoginScreen } from './screens/Login.tsx'

type Tab = 'HOME' | 'DISCOVER' | 'GUIDE' | 'LIBRARY'
const TABS: { tab: Tab; label: string; icon: 'home' | 'compass' | 'tvGuide' | 'library' }[] = [
  { tab: 'HOME', label: 'Home', icon: 'home' }, { tab: 'DISCOVER', label: 'Scopri', icon: 'compass' },
  { tab: 'GUIDE', label: 'Guida TV', icon: 'tvGuide' }, { tab: 'LIBRARY', label: 'Libreria', icon: 'library' },
]

type DetailPage = { media: Media; source: ArtSource | null; routeId: number }
type Expanding = { origin: Rect | null }

let routeIds = 1

/** A notification's media id ("tmdb-tv-123") back to a title the detail page can load. */
function mediaFromId(id: string): Media | null {
  const known = entryOf({ id })?.media ?? followOf(id)?.media
  if (known) return known
  const match = /^tmdb-(movie|tv)-(\d+)$/.exec(id)
  if (!match) return null
  return { ...emptyMedia(), id, mediaType: match[1], tmdbId: Number(match[2]) }
}

function DetailLayer({ page, top, closing, onClosed, onClose, onOpen, onAction, onReroll, rerolling }: {
  page: DetailPage; top: boolean; closing: boolean; onClosed: () => void; onClose: () => void; onOpen: OpenMedia; onAction: (m: Media) => void
  onReroll: (() => void) | null; rerolling: boolean
}) {
  const progress = useMotionValue(0)
  const done = useRef(onClosed)
  done.current = onClosed
  useEffect(() => {
    const el = page.source?.el
    // The page covers the artwork while it grows out of it: hide it, instantly, until the page is back.
    if (el) el.style.visibility = 'hidden'
    let c: { stop: () => void } | null = null
    const id = requestAnimationFrame(() => requestAnimationFrame(() => { c = animate(progress, 1, { duration: 0.56, ease: emphasized }) }))
    return () => { cancelAnimationFrame(id); c?.stop() }
  }, [])
  useEffect(() => {
    if (!closing) return
    const c = animate(progress, 0, {
      duration: 0.48, ease: fastOutSlowIn,
      onComplete: () => { const el = page.source?.el; if (el) el.style.visibility = ''; done.current() },
    })
    return () => c.stop()
  }, [closing])
  useEffect(() => () => { const el = page.source?.el; if (el) el.style.visibility = '' }, [])
  const source = page.source
  // The source might have scrolled: measure it again right before the page shrinks back into it.
  const rect = closing && source?.el?.isConnected ? (() => {
    const app = document.querySelector('.app')!.getBoundingClientRect()
    const r = source.el.getBoundingClientRect()
    return { left: r.left - app.left, top: r.top - app.top, width: r.width, height: r.height }
  })() : source?.rect ?? null
  const previewUrl = source?.url || page.media.poster || page.media.backdrop
  return (
    <div className="fill" style={{ zIndex: 30, pointerEvents: closing ? 'none' : 'auto' }}>
      <ContainerTransform progress={progress} source={rect} sourceCorner={source?.corner ?? null}
        preview={<RemoteImage url={previewUrl} style={{ width: '100%', height: '100%' }} />} sourceArt={source?.overlay}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={page.media.id} className="fill" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: tween(120) }} exit={{ opacity: 0, transition: tween(100) }}>
            <DetailScreen initial={page.media} backEnabled={top && !closing} onClose={onClose} onOpen={onOpen} onAction={onAction} onReroll={onReroll} rerolling={rerolling} />
          </motion.div>
        </AnimatePresence>
      </ContainerTransform>
    </div>
  )
}

function StreamWiseApp({ version }: { version: string }) {
  const { data } = useStore()
  const [tab, setTab] = useState<Tab>('HOME')
  const previousTab = useRef<Tab>('HOME')
  const [discoverKind, setDiscoverKind] = useState('movie')
  const [librarySection, setLibrarySection] = useState<LibrarySection>('PROGRESS')
  const [guideDate, setGuideDate] = useState(todayRome())
  const [guideKey, setGuideKey] = useState(0)
  const [action, setAction] = useState<Media | null>(null)
  const [search, setSearch] = useState<Expanding | null>(null)
  const [settings, setSettings] = useState<Expanding | null>(null)
  const [aiOpen, setAiOpen] = useState<Expanding | null>(null)
  const [findTitle, setFindTitle] = useState<Expanding | null>(null)
  const [filters, setFilters] = useState<Expanding | null>(null)
  const [saga, setSaga] = useState<{ collection: SagaCollection; el: HTMLElement | null } | null>(null)
  const [person, setPerson] = useState<PersonSelection | null>(null)
  const [catalogExpanded, setCatalogExpanded] = useState(false)
  const [advisor, setAdvisor] = useState<boolean | null>(null)
  const [advisorRequest, setAdvisorRequest] = useState<AdvisorRequest | null>(null)
  const [rerolling, setRerolling] = useState(false)
  const [pages, setPages] = useState<DetailPage[]>([])
  const [closingId, setClosingId] = useState<number | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  useEffect(() => { if (data && !data.prefs.onboardingDone) setShowOnboarding(true) }, [data != null])

  const openFromCatalog: OpenMedia = (media, source) => {
    setAdvisorRequest(null)
    setPages([{ media, source: source ?? null, routeId: routeIds++ }])
    setClosingId(null)
  }
  const resetOverlays = () => {
    setAction(null); setSearch(null); setSettings(null); setFilters(null); setSaga(null); setPerson(null); setAdvisor(null)
    setAdvisorRequest(null); setCatalogExpanded(false); setAiOpen(null); setFindTitle(null)
  }

  // Notifications and manifest shortcuts: /?open=media&id=..., /?open=guide&date=..., /?route=search
  useEffect(() => {
    const handle = (url: string) => {
      const params = new URL(url, location.origin).searchParams
      const open = params.get('open')
      if (open === 'guide') {
        const date = params.get('date') ?? ''
        resetOverlays(); setPages([]); setClosingId(null)
        if (isIsoDate(date)) setGuideDate(date)
        setGuideKey((k) => k + 1)
        setTab('GUIDE')
      } else if (open === 'media') {
        const media = mediaFromId(params.get('id') ?? '')
        if (media) {
          setAction(null); setSearch(null); setSettings(null); setFilters(null); setSaga(null); setAdvisor(null); setAdvisorRequest(null); setCatalogExpanded(false)
          setPages([{ media, source: null, routeId: routeIds++ }]); setClosingId(null)
        }
      } else if (params.get('route') === 'search') {
        setSearch({ origin: null })
      }
      if (open || params.get('route')) history.replaceState(history.state, '', '/')
    }
    handle(location.href)
    const onMessage = (event: MessageEvent) => { if (event.data?.type === 'open') handle(event.data.url) }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [])

  const switchTab = (next: Tab) => {
    if (next === tab && next === 'HOME') homeReselect.dispatchEvent(new Event('reselect'))
    previousTab.current = tab
    setTab(next)
    setCatalogExpanded(false)
  }
  const order = TABS.map((t) => t.tab)
  const forward = order.indexOf(tab) >= order.indexOf(previousTab.current)

  const reroll = (page: DetailPage) => {
    if (rerolling || !advisorRequest) return
    setRerolling(true)
    void chooseAdvisorTitle(advisorRequest, page.media.id).then((next) => {
      if (next) setPages((list) => list.map((p) => (p.routeId === page.routeId ? { ...p, media: next, source: null } : p)))
      setRerolling(false)
    })
  }
  const topPage = pages[pages.length - 1]

  const screens: Record<Tab, () => JSX.Element> = {
    HOME: () => (
      <HomeScreen onOpen={openFromCatalog} onAction={setAction} onSearch={(r) => setSearch({ origin: r })} onSettings={(r) => setSettings({ origin: r })}
        onAdvisor={(fromLibrary) => setAdvisor(fromLibrary)} onAskAi={(r) => setAiOpen({ origin: r })} onFindTitle={(r) => setFindTitle({ origin: r })}
        onOpenLibrary={(s) => { setLibrarySection(s); switchTab('LIBRARY') }} onDiscover={() => switchTab('DISCOVER')} onOpenGuide={() => switchTab('GUIDE')}
        onOpenPerson={(p: Person, r) => setPerson({ person: p, source: r })} />
    ),
    DISCOVER: () => (
      <DiscoverScreen kind={discoverKind} onKind={setDiscoverKind} chromeVisible={!catalogExpanded} onOpen={openFromCatalog} onAction={setAction}
        onSearch={(r) => setSearch({ origin: r })} onFilters={(r) => setFilters({ origin: r })} onExpandedChange={setCatalogExpanded} />
    ),
    GUIDE: () => <TvGuideScreen key={guideKey} date={guideDate} onDate={setGuideDate} backEnabled={pages.length === 0} onOpen={openFromCatalog} onExpandedChange={setCatalogExpanded} />,
    LIBRARY: () => (
      <LibraryScreen section={librarySection} onSection={setLibrarySection} onOpen={openFromCatalog} onAction={setAction}
        onOpenSaga={(collection, el) => setSaga({ collection, el })} onOpenPerson={(p, r) => setPerson({ person: p, source: r })} onDiscover={() => switchTab('DISCOVER')} />
    ),
  }

  return (
    <SubscriptionProvider>
      <div className="fill">
        <AuroraBackground />
        <AnimatePresence initial={false} custom={forward}>
          <motion.div key={tab} className="fill"
            initial={{ opacity: 0, x: `${(forward ? 1 : -1) * 16.67}%`, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1, transition: { opacity: tween(280, undefined, 40), x: tween(420, emphasized), scale: tween(420, emphasized) } }}
            exit={{ opacity: 0, x: `${(forward ? -1 : 1) * 10}%`, transition: { opacity: tween(160), x: tween(320, emphasized) } }}>
            {screens[tab]()}
          </motion.div>
        </AnimatePresence>
        {/* Keeps scrolled content from colliding with the status bar icons. */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 'calc(var(--safe-top) + 14px)', background: 'linear-gradient(180deg, rgba(10,11,16,.94), rgba(10,11,16,.6), transparent)', pointerEvents: 'none', zIndex: 4 }} />
        <AnimatePresence>
          {!catalogExpanded && (
            <motion.div key="nav" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5 }}
              initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0, transition: { opacity: tween(220), y: tween(380, emphasized) } }}
              exit={{ opacity: 0, y: '100%', transition: { opacity: tween(160), y: tween(260) } }}>
              <FloatingNavBar items={TABS} selected={order.indexOf(tab)} onSelect={(i) => switchTab(order[i])} />
            </motion.div>
          )}
        </AnimatePresence>

        {search && <ExpandingPage source={search.origin} onClosed={() => setSearch(null)}>{(close) => <SearchScreen onDismiss={close} onOpen={openFromCatalog} />}</ExpandingPage>}
        {aiOpen && (
          <ExpandingPage source={aiOpen.origin} onClosed={() => setAiOpen(null)} sourceCorner={26} sourceArt={<AiCardArt style={{ width: '100%', height: '100%' }} />}>
            {(close) => <AiScreen onDismiss={close} onOpen={openFromCatalog} />}
          </ExpandingPage>
        )}
        {findTitle && (
          <ExpandingPage source={findTitle.origin} onClosed={() => setFindTitle(null)} sourceCorner={26} sourceArt={<AiCardArt title={FIND_TITLE} subtitle={FIND_TITLE_SUBTITLE} icon="search" style={{ width: '100%', height: '100%' }} />}>
            {(close) => <FindTitleScreen onDismiss={close} onOpen={openFromCatalog} />}
          </ExpandingPage>
        )}
        {settings && (
          <ExpandingPage source={settings.origin} onClosed={() => setSettings(null)}>
            {(close) => <SettingsScreen version={version} onDismiss={close} onRestored={() => setShowOnboarding(false)} onReplayOnboarding={() => { void setPrefs({ onboardingDone: false }); setShowOnboarding(true) }} />}
          </ExpandingPage>
        )}
        {filters && <ExpandingPage source={filters.origin} onClosed={() => setFilters(null)}>{(close) => <FilterScreen type={discoverKind} onDismiss={close} onOpen={openFromCatalog} onAction={setAction} />}</ExpandingPage>}
        {advisor != null && (
          <AdvisorSheet libraryOnly={advisor} onDismiss={() => setAdvisor(null)}
            onOpen={(media, request) => { setAdvisor(null); setAdvisorRequest(request); setPages([{ media, source: null, routeId: routeIds++ }]); setClosingId(null) }} />
        )}
        {saga && (
          <ExpandingPage source={saga.el ? (() => { const app = document.querySelector('.app')!.getBoundingClientRect(); const r = saga.el!.getBoundingClientRect(); return { left: r.left - app.left, top: r.top - app.top, width: r.width, height: r.height } })() : null}
            sourceCorner={22} onClosed={() => setSaga(null)} openMs={320} closeMs={320}
            preview={<RemoteImage url={saga.collection.movies[0]?.poster ?? ''} style={{ width: '100%', height: '100%' }} />}>
            {(close) => <SagaDetailScreen collection={saga.collection} backEnabled={pages.length === 0} onDismiss={close} onOpen={openFromCatalog} />}
          </ExpandingPage>
        )}
        {person && <PersonCredits person={person.person} source={person.source} dismiss={() => setPerson(null)} onOpen={openFromCatalog} />}
        {pages.map((page) => (
          <DetailLayer key={page.routeId} page={page} top={page.routeId === topPage?.routeId} closing={closingId === page.routeId}
            onClosed={() => { setPages((list) => list.filter((p) => p.routeId !== page.routeId)); setClosingId(null) }}
            onClose={() => {
              if (closingId == null && page.routeId === topPage?.routeId) {
                setClosingId(page.routeId)
                if (pages.length === 1) setAdvisorRequest(null)
              }
            }}
            onOpen={(next, source) => {
              if (closingId == null && page.routeId === topPage?.routeId) {
                setAdvisorRequest(null)
                setPages((list) => [...list, { media: next, source: source ?? null, routeId: routeIds++ }])
              }
            }}
            onAction={(m) => { if (page.routeId === topPage?.routeId) setAction(m) }}
            onReroll={page.routeId === topPage?.routeId && advisorRequest ? () => reroll(page) : null} rerolling={rerolling} />
        ))}
        {action && <ActionSheet key={action.id} media={action} onDismiss={() => setAction(null)} />}
        <AnimatePresence>
          {showOnboarding && (
            <OnboardingScreen key="onboarding"
              onImportBackup={() => pickBackup(() => setShowOnboarding(false))}
              onComplete={() => { void setPrefs({ onboardingDone: true }); setShowOnboarding(false) }} />
          )}
        </AnimatePresence>
      </div>
    </SubscriptionProvider>
  )
}

/** The account gate: login first, then the app with the account's data (cached for offline). */
export function App() {
  const [session, setSession] = useState<{ username: string | null; version: string } | null>(null)
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    api<{ loggedIn: boolean; username: string | null; version: string }>('/api/session').then((s) => {
      setSession({ username: s.loggedIn ? s.username : null, version: s.version })
      if (s.loggedIn && s.username) start(s.username)
    }).catch(() => {
      // Offline: open with the last account's cached data.
      const last = localStorage.getItem('streamwise.lastUser')
      if (last) { setUser(last); setSession({ username: last, version: '' }); setOffline(true) }
      else setSession({ username: null, version: '' })
    })
    const logout = () => setSession((s) => (s ? { ...s, username: null } : s))
    authEvents.addEventListener('logout', logout)
    return () => authEvents.removeEventListener('logout', logout)
  }, [])
  const start = (username: string) => {
    try { localStorage.setItem('streamwise.lastUser', username) } catch { /* ignore */ }
    setUser(username)
    void refresh(true).then(() => { if (getStore().data) void checkReleases() })
    void syncPush()
  }
  useEffect(() => {
    if (!session?.username) return
    // Changes from other devices and from the server's checks: every 30 s and when the app comes back.
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 30000)
    const visible = () => { if (document.visibilityState === 'visible') { void refresh(); void checkReleases() } }
    document.addEventListener('visibilitychange', visible)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', visible) }
  }, [session?.username])
  const { data, loadError } = useStore()
  void offline; void prefs; void tmdb
  return (
    <div className="app">
      {session == null ? <div className="fill center" style={{ background: 'var(--bg)' }}><Spinner size={54} stroke={5} /></div>
        : session.username == null ? <LoginScreen onLoggedIn={(username) => { setSession({ ...session, username }); start(username) }} />
          : data == null ? (
            <div className="fill col center" style={{ background: 'var(--bg)', gap: 16, padding: 32, textAlign: 'center' }}>
              {loadError ? <><span style={{ color: 'var(--muted)', fontSize: 17 }}>{loadError}</span><button onClick={() => void refresh(true)} style={{ color: 'var(--primary)', fontWeight: 700, height: 40 }}>Riprova</button></> : <Spinner size={54} stroke={5} />}
            </div>
          ) : <StreamWiseApp version={session.version} />}
      <div id="overlay-root" className="fill" style={{ pointerEvents: 'none', zIndex: 50 }} />
      <ToastHost />
    </div>
  )
}
