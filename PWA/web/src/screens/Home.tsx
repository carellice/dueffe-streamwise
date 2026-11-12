// HomeScreen of MainActivity.kt.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Media, Person } from '../../../shared/model.ts'
import { shortLabel, sortFollows, sortPeople } from '../../../shared/follows.ts'
import { hourRome, todayRome } from '../../../shared/dates.ts'
import { byState, follows, people, useStore } from '../lib/store.ts'
import { tmdb } from '../lib/tmdb.ts'
import { GlassIconButton, Reveal, SectionHeader, type Rect } from '../components/ui.tsx'
import {
  AdvisorCards, AiCard, ContinueCard, EmptyLibrary, GuideTeaser, HolidayRail, MediaRail, RailSkeleton, SearchPill, currentHoliday, type OpenMedia,
} from '../components/cards.tsx'
import { continueWatchingOrder, type LibrarySection } from './Library.tsx'
import { PeopleRail } from './Detail.tsx'

function greeting(): string {
  const hour = hourRome()
  if (hour >= 5 && hour <= 12) return 'Buongiorno'
  if (hour >= 13 && hour <= 17) return 'Buon pomeriggio'
  return 'Buonasera'
}

/** Movies and series interleaved, like the native merge of the two lists. */
export function interleave(a: Media[], b: Media[]): Media[] {
  const out: Media[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i])
    if (b[i]) out.push(b[i])
  }
  return out
}

export const homeReselect = new EventTarget()

export function HomeScreen({ onOpen, onAction, onSearch, onSettings, onAdvisor, onAskAi, onOpenLibrary, onDiscover, onOpenGuide, onOpenPerson }: {
  onOpen: OpenMedia; onAction: (m: Media) => void; onSearch: (r: Rect | null) => void; onSettings: (r: Rect | null) => void; onAdvisor: (fromLibrary: boolean) => void
  onAskAi: (r: Rect | null) => void; onOpenLibrary: (s: LibrarySection) => void; onDiscover: () => void; onOpenGuide: () => void
  onOpenPerson: (p: Person, r: Rect | null) => void
}) {
  const { version } = useStore()
  const progress = useMemo(() => continueWatchingOrder(byState('progress')), [version])
  const saved = useMemo(() => [...byState('saved')].sort((a, b) => Number(b.pinned) - Number(a.pinned)).map((e) => e.media), [version])
  const watchedCount = byState('watched').length
  const hidden = new Set(byState('hidden').map((e) => e.media.id))
  const today = todayRome()
  const followList = sortFollows(follows(), today)
  const followedPeople = [...new Map(sortPeople(people()).map((f) => [f.person.id, f.person])).values()]
  const [trending, setTrending] = useState<Media[] | null>(null)
  const holiday = currentHoliday(today)
  const [holidayMedia, setHolidayMedia] = useState<Media[]>([])
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    Promise.all([tmdb.trending('movie').catch(() => []), tmdb.trending('tv').catch(() => [])]).then(([m, s]) => { if (alive) setTrending(interleave(m, s)) })
    if (holiday) Promise.all([tmdb.holiday(holiday.id, 'movie', 1).catch(() => []), tmdb.holiday(holiday.id, 'tv', 1).catch(() => [])]).then(([m, s]) => { if (alive) setHolidayMedia(interleave(m, s)) })
    const top = () => scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })
    homeReselect.addEventListener('reselect', top)
    return () => { alive = false; homeReselect.removeEventListener('reselect', top) }
  }, [])
  const labels = new Map(followList.map((f) => [f.media.id, shortLabel(f, today)]))
  return (
    <div ref={scroller} className="fill scroll">
      <div className="col" style={{ paddingTop: 'calc(var(--safe-top) + 14px)', paddingBottom: 132, gap: 28 }}>
        <Reveal id="home-header" style={{ padding: '0 20px' }}>
          <div className="row">
            <div className="grow col">
              <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 900, letterSpacing: 2, lineHeight: '16px' }}>{greeting().toUpperCase()}</span>
              <span className="t-display-small" style={{ color: 'var(--ink)', marginTop: 4 }}>Cosa guardiamo?</span>
            </div>
            <GlassIconButton icon="settings" label="Impostazioni" onClick={onSettings} />
          </div>
          <SearchPill onSearch={onSearch} style={{ marginTop: 18 }} />
        </Reveal>
        <Reveal id="home-advisor" delay={90}><AdvisorCards hasLibrary={progress.length > 0 || saved.length > 0} onAdvisor={onAdvisor} /></Reveal>
        <AiCard delay={120} onOpen={onAskAi} />
        {holiday && holidayMedia.some((m) => !hidden.has(m.id)) && (
          <HolidayRail holiday={holiday} media={holidayMedia.filter((m) => !hidden.has(m.id))} onOpen={onOpen} onAction={onAction} onSeeAll={() => onDiscover()} onLoadMore={null} loadingMore={false} />
        )}
        {progress.length > 0 && (
          <Reveal id="home-progress" delay={160}>
            <SectionHeader title="Continua a guardare" eyebrow="Riprendi da dove eri" onAction={() => onOpenLibrary('PROGRESS')} />
            <div className="hscroll row" style={{ marginTop: 12, padding: '0 20px', gap: 14 }}>
              {progress.map((entry) => <ContinueCard key={entry.media.id} entry={entry} open={onOpen} actions={onAction} />)}
            </div>
          </Reveal>
        )}
        {progress.length === 0 && saved.length === 0 && watchedCount === 0 && <EmptyLibrary openMovies={onDiscover} />}
        {followList.length > 0 && (
          <MediaRail title="Uscite che segui" media={followList.map((f) => f.media)} onOpen={onOpen} onAction={onAction} footerFor={(m) => labels.get(m.id)} eyebrow="Ti avviso io" onSeeAll={() => onOpenLibrary('FOLLOWING')} />
        )}
        {trending == null ? <RailSkeleton title="In tendenza" /> : (
          <MediaRail title="In tendenza" media={trending.filter((m) => !hidden.has(m.id)).slice(0, 10)} onOpen={onOpen} onAction={onAction} ranked eyebrow="Film e serie · Top 10 della settimana" />
        )}
        {saved.length > 0 && <MediaRail title="La mia lista" media={saved} onOpen={onOpen} onAction={onAction} eyebrow={`${saved.length} da vedere`} onSeeAll={() => onOpenLibrary('SAVED')} />}
        <GuideTeaser onOpen={onOpenGuide} />
        {followedPeople.length > 0 && <PeopleRail people={followedPeople} title="Persone che segui" topPadding={0} onPersonClick={onOpenPerson} />}
      </div>
    </div>
  )
}
