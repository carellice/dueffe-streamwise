import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { romeClock, today } from '../../../shared/dates.ts'
import { shortFollowLabel, sortFollows } from '../../../shared/follows.ts'
import type { LibraryEntry, Media } from '../../../shared/model.ts'
import { AdvisorCard, AiAskCard, ContinueCard, currentHoliday, HolidayRail, MediaRail, RailSkeleton, Row } from '../components/cards.tsx'
import { PeopleRail } from '../components/people.tsx'
import { alpha, C, GlassIconButton, Icon, Pressable, PulsingDot, Reveal, SectionHeader } from '../components/ui.tsx'
import { open, setLibrarySection, setTab, type LibrarySection } from '../lib/nav.ts'
import { useData, useStore } from '../lib/store.ts'
import { attempt, interleave, tmdb } from '../lib/tmdb.ts'
import { openAdvisor, openPerson } from '../lib/ui.ts'

function greeting(): string {
  const hour = romeClock().hour
  if (hour >= 5 && hour <= 12) return 'Buongiorno'
  if (hour >= 13 && hour <= 17) return 'Buon pomeriggio'
  return 'Buonasera'
}

export function continueWatchingOrder(entries: LibraryEntry[]): LibraryEntry[] {
  return [...entries].sort((a, b) =>
    Number(b.pinned) - Number(a.pinned) || b.nextSeason - a.nextSeason || b.nextEpisode - a.nextEpisode ||
    a.media.title.toLowerCase().localeCompare(b.media.title.toLowerCase(), 'it'))
}

// Loaded once per app session, like the native LaunchedEffect(api).
let trendingCache: Media[] | null = null
let holidayCache: Media[] | null = null

export function HomeScreen() {
  const data = useData()
  const version = useStore((s) => s.version)
  const entries = useMemo(() => [...data.library.values()], [data])
  const progress = useMemo(() => continueWatchingOrder(entries.filter((e) => e.state === 'progress')), [entries])
  const saved = useMemo(() => entries.filter((e) => e.state === 'saved').map((e, i) => ({ e, i })).sort((a, b) => Number(b.e.pinned) - Number(a.e.pinned) || a.i - b.i).map((x) => x.e.media), [entries])
  const watchedCount = entries.filter((e) => e.state === 'watched').length
  const hidden = useMemo(() => new Set(entries.filter((e) => e.state === 'hidden').map((e) => e.media.id)), [entries])
  const follows = useMemo(() => sortFollows(data.follows, today()), [data.follows, version])
  const people = useMemo(() => {
    const seen = new Set<number>()
    return data.people.map((f) => f.person).filter((p) => !seen.has(p.id) && !!seen.add(p.id))
  }, [data.people])
  const [trending, setTrending] = useState<Media[] | null>(trendingCache)
  const holiday = useMemo(() => currentHoliday(today()), [])
  const [holidayMedia, setHolidayMedia] = useState<Media[]>(holidayCache ?? [])

  useEffect(() => {
    if (trendingCache) return
    void (async () => {
      const [m, s] = await Promise.all([attempt(() => tmdb.trending('movie'), []), attempt(() => tmdb.trending('tv'), [])])
      trendingCache = interleave(m, s)
      setTrending(trendingCache)
    })()
  }, [])
  useEffect(() => {
    if (!holiday || holidayCache) return
    void (async () => {
      const [m, s] = await Promise.all([attempt(() => tmdb.holiday(holiday.id, 'movie', 1), []), attempt(() => tmdb.holiday(holiday.id, 'tv', 1), [])])
      holidayCache = interleave(m, s)
      setHolidayMedia(holidayCache)
    })()
  }, [holiday])

  const openLibrary = (section: LibrarySection) => { setLibrarySection(section); setTab('library') }
  const td = today()
  const labels = new Map(follows.map((f) => [f.media.id, shortFollowLabel(f, td)]))

  return (
    <div className="scroll" style={{ position: 'absolute', inset: 0, paddingTop: 'calc(var(--status-top) + 14px)', paddingBottom: 132 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <Reveal style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.accent, fontSize: 12, fontWeight: 900, letterSpacing: 2 }}>{greeting().toUpperCase()}</div>
              <div className="t-display-small" style={{ color: C.ink, marginTop: 4 }}>Cosa guardiamo?</div>
            </div>
            <GlassIconButton icon="settings" label="Impostazioni" onClick={(rect) => open({ kind: 'settings' }, { rect, corner: 22 })} />
          </div>
          <SearchPill style={{ marginTop: 18 }} />
        </Reveal>
        <Reveal delay={90} style={{ padding: '0 20px', display: 'flex', gap: 12 }}>
          <AdvisorCard title="Sorprendimi" subtitle="Un titolo a caso dal catalogo, su misura" icon="sparkles" primary onClick={() => openAdvisor(false)} />
          {(progress.length > 0 || saved.length > 0) && <AdvisorCard title="Dalla mia lista" subtitle="Scelgo io tra i titoli che hai salvato" icon="library" primary={false} onClick={() => openAdvisor(true)} />}
        </Reveal>
        <Reveal delay={120} style={{ padding: '0 20px' }}><AiAskCard /></Reveal>
        <Reveal delay={150} style={{ padding: '0 20px' }}><AiAskCard find /></Reveal>
        {holiday && holidayMedia.some((m) => !hidden.has(m.id)) && (
          <HolidayRail holiday={holiday} media={holidayMedia.filter((m) => !hidden.has(m.id))} onSeeAll={() => setTab('discover')} onLoadMore={null} loadingMore={false} />
        )}
        {progress.length > 0 && (
          <Reveal delay={160}>
            <SectionHeader title="Continua a guardare" eyebrow="Riprendi da dove eri" onAction={() => openLibrary('progress')} />
            <Row gap={14} style={{ marginTop: 12 }}>
              {progress.map((entry) => <ContinueCard key={entry.media.id} entry={entry} />)}
            </Row>
          </Reveal>
        )}
        {progress.length === 0 && saved.length === 0 && watchedCount === 0 && <EmptyLibrary onDiscover={() => setTab('discover')} />}
        {follows.length > 0 && (
          <MediaRail title="Uscite che segui" media={follows.map((f) => f.media)} footerFor={(m) => labels.get(m.id)} eyebrow="Ti avviso io" onSeeAll={() => openLibrary('following')} />
        )}
        {trending == null ? <RailSkeleton title="In tendenza" /> : (
          <MediaRail title="In tendenza" media={trending.filter((m) => !hidden.has(m.id)).slice(0, 10)} ranked eyebrow="Film e serie · Top 10 della settimana" />
        )}
        {saved.length > 0 && <MediaRail title="La mia lista" media={saved} eyebrow={`${saved.length} da vedere`} onSeeAll={() => openLibrary('saved')} />}
        <GuideTeaser onOpen={() => setTab('guide')} />
        {people.length > 0 && <PeopleRail people={people} title="Persone che segui" topPadding={0} onPerson={openPerson} />}
      </div>
    </div>
  )
}

export function SearchPill({ style }: { style?: CSSProperties }) {
  return (
    <Pressable pressed={0.97} className="glass" onClick={(rect) => open({ kind: 'search' }, { rect, corner: 27 })}
      style={{ height: 54, borderRadius: 27, display: 'flex', alignItems: 'center', padding: '0 18px', ...style }}>
      <Icon name="search" size={22} color={C.accent} />
      <span style={{ marginLeft: 12, color: C.muted, fontSize: 15, flex: 1 }}>Film, serie, attori, registi…</span>
    </Pressable>
  )
}

function GuideTeaser({ onOpen }: { onOpen: () => void }) {
  return (
    <Reveal style={{ padding: '0 20px' }}>
      <Pressable pressed={0.97} onClick={() => onOpen()}
        style={{ borderRadius: 26, background: 'linear-gradient(135deg, #1B2542, #141826)', border: `1px solid ${alpha(C.blue, 0.35)}`, padding: 18, display: 'flex', alignItems: 'center' }}>
        <div style={{ width: 52, height: 52, borderRadius: 17, background: alpha(C.blue, 0.18), display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name="tv_guide" size={27} color={C.blue} />
        </div>
        <div style={{ flex: 1, padding: '0 14px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <PulsingDot color={C.like} size={4} />
            <span style={{ color: C.like, fontSize: 11, fontWeight: 900, letterSpacing: 1.4, marginLeft: 4 }}>STASERA IN TV</span>
          </div>
          <div style={{ color: C.ink, fontWeight: 800, fontSize: 17 }}>Film e serie in chiaro</div>
          <div style={{ color: C.muted, fontSize: 13 }}>Palinsesti, canali e promemoria</div>
        </div>
        <Icon name="chevron_right" color={C.muted} />
      </Pressable>
    </Reveal>
  )
}

function EmptyLibrary({ onDiscover }: { onDiscover: () => void }) {
  return (
    <Reveal delay={120} style={{ padding: '0 20px' }}>
      <div className="glass" style={{ borderRadius: 30, padding: 24 }}>
        <div className="brand-glow" style={{ width: 54, height: 54, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', ['--glow-blur' as string]: '10px' }}>
          <Icon name="add" size={28} color="#fff" />
        </div>
        <div className="t-headline-medium" style={{ color: C.ink, marginTop: 20 }}>Costruisci la tua lista</div>
        <div style={{ color: C.muted, fontSize: 15, lineHeight: '21px', marginTop: 7, marginBottom: 20 }}>Salva film e serie: StreamWise terrà il filo per te, episodio dopo episodio.</div>
        <Pressable pressed={0.97} onClick={() => onDiscover()} style={{ height: 50, borderRadius: 50, background: C.ink, color: C.bg, display: 'inline-flex', alignItems: 'center', padding: '0 24px', gap: 8 }}>
          <Icon name="compass" size={24} color={C.bg} />
          <span className="t-label-large" style={{ color: C.bg }}>Esplora il catalogo</span>
        </Pressable>
      </div>
    </Reveal>
  )
}
