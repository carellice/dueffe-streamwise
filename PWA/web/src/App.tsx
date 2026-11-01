import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isDate } from '../../shared/dates.ts'
import { emptyMedia, type Media } from '../../shared/model.ts'
import { AiCardArt, FIND_TITLE, FIND_TITLE_SUBTITLE } from './components/cards.tsx'
import { emphasized, tween } from './components/motion.ts'
import { ToastHost } from './components/Overlay.tsx'
import { ContainerTransform, type TransformSource } from './components/Transform.tsx'
import { AuroraBackground, C, FloatingNavBar, SeeAllChipArt, Spinner, type NavItem } from './components/ui.tsx'
import { api, authEvents } from './lib/api.ts'
import { finished, navState, open, openGuide, setTab, TABS, useNav, type Entry, type Tab } from './lib/nav.ts'
import { getData, refresh, setUser, useStore } from './lib/store.ts'
import { useSheets } from './lib/ui.ts'
import { ActionSheetView, AdvisorSheetView } from './screens/Advisor.tsx'
import { AiPage, FindTitlePage } from './screens/Ai.tsx'
import { DetailPage, GenrePage } from './screens/Detail.tsx'
import { CatalogExpandedPage, DiscoverScreen } from './screens/Discover.tsx'
import { EpisodesPage } from './screens/Episodes.tsx'
import { FilterPage } from './screens/Filters.tsx'
import { GuideScreen, ProgrammePage } from './screens/Guide.tsx'
import { HomeScreen } from './screens/Home.tsx'
import { LibraryScreen, SagaPage } from './screens/Library.tsx'
import { LoginScreen } from './screens/Login.tsx'
import { Onboarding, TourOverlay } from './screens/Onboarding.tsx'
import { PersonPage } from './screens/Person.tsx'
import { SearchPage } from './screens/Search.tsx'
import { SettingsPage } from './screens/Settings.tsx'

const NAV: NavItem[] = [
  { label: 'Home', icon: 'home' }, { label: 'Scopri', icon: 'compass' }, { label: 'Guida TV', icon: 'tv_guide' }, { label: 'Libreria', icon: 'library' },
]

type Session = { loggedIn: boolean; username: string | null; version: string; inviteRequired: boolean }

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [offline, setOffline] = useState(false)
  const user = useStore((s) => s.data != null)

  const check = async () => {
    try {
      const s = await api<Session>('/api/session')
      setSession(s)
      if (s.loggedIn && s.username) {
        setUser(s.username)
        await refresh(true)
        void api('/api/follows/check', { method: 'POST' }).catch(() => {})
      }
    } catch {
      // Offline with a cached account: open with the last data seen.
      setOffline(true)
    }
  }
  useEffect(() => {
    void check()
    const onLogout = () => setSession((s) => (s ? { ...s, loggedIn: false } : s))
    authEvents.addEventListener('logout', onLogout)
    return () => authEvents.removeEventListener('logout', onLogout)
  }, [])

  if (!session && !(offline && user)) {
    return <div className="app"><AuroraBackground /><div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div></div>
  }
  if (session && !session.loggedIn) {
    return <div className="app"><LoginScreen inviteRequired={session.inviteRequired} onDone={(username) => { setUser(username); void check() }} /></div>
  }
  return <MainApp />
}

function MainApp() {
  const tab = useNav((s) => s.tab)
  const stack = useNav((s) => s.stack)
  const chrome = useNav((s) => s.tabChrome)
  const sheets = useSheets()
  const onboarded = useStore((s) => s.settings.onboarded)
  const [tour, setTour] = useState(false)
  const index = TABS.indexOf(tab)
  const previous = useRef(index)
  const forward = index > previous.current
  useEffect(() => { previous.current = index }, [index])

  // Notifications and manifest shortcuts open deep links: "/?media=<id>", "/?route=guide&date=...".
  useEffect(() => {
    const handle = (url: string) => {
      const params = new URL(url, location.origin).searchParams
      const route = params.get('route')
      const mediaId = params.get('media')
      if (route === 'guide') openGuide(isDate(params.get('date') ?? '') ? params.get('date')! : '')
      else if (route === 'search') open({ kind: 'search' })
      else if (mediaId) open({ kind: 'detail', media: mediaFromId(mediaId) })
    }
    if (location.search) {
      handle(location.href)
      history.replaceState(history.state, '', '/')
    }
    const onMessage = (e: MessageEvent) => { if (e.data?.type === 'open' && typeof e.data.url === 'string') handle(e.data.url) }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [])

  return (
    <div className="app">
      <AuroraBackground />
      <AnimatePresence initial={false} custom={forward}>
        <motion.div key={tab} custom={forward} className="layer"
          variants={{
            enter: (f: boolean) => ({ opacity: 0, x: `${(f ? 1 : -1) * 100 / 6}%`, scale: 0.97 }),
            center: { opacity: 1, x: 0, scale: 1, transition: { opacity: tween(280, undefined, 40), x: tween(420, emphasized), scale: tween(420, emphasized) } },
            exit: (f: boolean) => ({ opacity: 0, x: `${(f ? -1 : 1) * 10}%`, transition: { opacity: tween(160), x: tween(320, emphasized) } }),
          }}
          initial="enter" animate="center" exit="exit">
          <TabScreen tab={tab} />
        </motion.div>
      </AnimatePresence>
      {/* Keeps scrolled content from colliding with the status bar icons. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'calc(var(--status-top) + 14px)', background: `linear-gradient(180deg, rgba(10,11,16,.94), rgba(10,11,16,.6), transparent)`, pointerEvents: 'none' }} />
      <AnimatePresence>
        {chrome && (
          <motion.div key="nav" initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0, transition: { opacity: tween(220), y: tween(380, emphasized) } }}
            exit={{ opacity: 0, y: '100%', transition: { opacity: tween(160), y: tween(260) } }}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3 }}>
            <FloatingNavBar items={NAV} selected={index} onSelect={(i) => setTab(TABS[i])} />
          </motion.div>
        )}
      </AnimatePresence>
      {stack.map((entry) => <PageLayer key={entry.key} entry={entry} />)}
      <AdvisorSheetView open={sheets.advisor != null} libraryOnly={sheets.advisor?.libraryOnly ?? false} />
      <ActionSheetView media={sheets.action} />
      {!onboarded && <Onboarding onComplete={() => setTour(false)} />}
      {tour && onboarded && <TourOverlay onComplete={() => setTour(false)} />}
      <ToastHost />
    </div>
  )
}

function TabScreen({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'home': return <HomeScreen />
    case 'discover': return <DiscoverScreen />
    case 'guide': return <GuideScreen />
    case 'library': return <LibraryScreen />
  }
}

/** A followed title opened from a notification: its id says type and TMDB id; the page loads the rest. */
function mediaFromId(id: string): Media {
  const known = getData().library.get(id)?.media ?? getData().follows.find((f) => f.media.id === id)?.media
  if (known) return known
  const m = /^tmdb-(movie|tv)-(\d+)$/.exec(id)
  return { ...emptyMedia(), id, mediaType: m?.[1] ?? 'movie', tmdbId: Number(m?.[2] ?? 0), title: '' }
}

function sourceFor(entry: Entry): TransformSource {
  const o = entry.origin
  if (!o) return { rect: null }
  let art: ReactNode = undefined
  if (o.art === 'ai') art = <AiCardArt style={{ width: '100%', height: '100%' }} />
  else if (o.art === 'find') art = <AiCardArt title={FIND_TITLE} subtitle={FIND_TITLE_SUBTITLE} icon="search" style={{ width: '100%', height: '100%' }} />
  else if (o.art === 'seeAll') art = <div style={{ width: '100%', height: '100%', background: C.bg, borderRadius: 17 }}><SeeAllChipArt label={o.label ?? 'Vedi tutto'} style={{ width: '100%', height: '100%' }} /></div>
  return { rect: o.rect, corner: o.corner, previewUrl: o.url, art, artFadeEnd: art ? 0.3 : undefined }
}

function PageLayer({ entry }: { entry: Entry }) {
  const detail = entry.page.kind === 'detail'
  return (
    <div className="layer" style={{ zIndex: 10 }}>
      <ContainerTransform source={sourceFor(entry)} closing={entry.closing} openMs={detail ? 560 : 540} closeMs={detail ? 480 : 460} onClosed={() => finished(entry.key)}>
        <PageContent entry={entry} />
      </ContainerTransform>
    </div>
  )
}

function PageContent({ entry }: { entry: Entry }) {
  const p = entry.page
  const key = entry.key
  switch (p.kind) {
    case 'search': return <SearchPage pageKey={key} />
    case 'ai': return <AiPage pageKey={key} />
    case 'findTitle': return <FindTitlePage pageKey={key} />
    case 'settings': return <SettingsPage pageKey={key} />
    case 'filters': return <FilterPage pageKey={key} type={p.type} />
    case 'detail': return <DetailPage key={p.media.id} pageKey={key} initial={p.media} advisor={p.advisor ?? null} />
    case 'person': return <PersonPage pageKey={key} person={p.person} />
    case 'saga': return <SagaPage pageKey={key} name={p.name} movies={p.movies} />
    case 'genre': return <GenrePage pageKey={key} type={p.type} genreId={p.genreId} genreName={p.genreName} />
    case 'episodes': return <EpisodesPage pageKey={key} media={p.media} />
    case 'catalog': return <CatalogExpandedPage pageKey={key} type={p.type} rail={p.rail} />
    case 'programme': return <ProgrammePage pageKey={key} programme={p.programme} />
  }
}

export { navState }
