// PersonCredits of MainActivity.kt: a person's films and series, growing out of their round photo.
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import type { Media, Person } from '../../../shared/model.ts'
import { useBackHandler, BackScope } from '../lib/back.ts'
import { followPerson, isPersonFollowed, prefs, showToast, unfollowPerson, useStore } from '../lib/store.ts'
import { enablePush, notificationsAllowed } from '../lib/push.ts'
import { tmdb } from '../lib/tmdb.ts'
import { emphasized, fastOutSlowIn } from '../components/motion.ts'
import { ContainerTransform } from '../components/Transform.tsx'
import { Icon, Press, RemoteImage, Spinner, type Rect } from '../components/ui.tsx'
import { PosterGrid } from '../components/grid.tsx'
import type { OpenMedia } from '../components/cards.tsx'

export type PersonSelection = { person: Person; source: Rect | null }

/** Material 3 SingleChoiceSegmentedButtonRow. */
export function SegmentedButtons({ options, selected, onSelect, style }: { options: [string, string][]; selected: string; onSelect: (v: string) => void; style?: React.CSSProperties }) {
  return (
    <div className="row" style={{ height: 40, ...style }}>
      {options.map(([value, label], index) => {
        const active = value === selected
        const first = index === 0
        const last = index === options.length - 1
        return (
          <button key={value} onClick={() => onSelect(value)} className="grow row center"
            style={{
              height: '100%', gap: 8, marginLeft: first ? 0 : -1, border: '1px solid var(--outline-strong)',
              borderRadius: first ? '20px 0 0 20px' : last ? '0 20px 20px 0' : 0,
              background: active ? '#331D20' : 'transparent', color: active ? '#FFDAD2' : 'var(--ink)', fontSize: 14, fontWeight: 700, letterSpacing: 0.1,
            }}>
            {active && <Icon name="check" size={18} />}
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function PersonCredits({ person, source, dismiss, onOpen }: { person: Person; source: Rect | null; dismiss: () => void; onOpen: OpenMedia }) {
  useStore()
  const [credits, setCredits] = useState<Media[] | null>(null)
  const [creditType, setCreditType] = useState('all')
  const [closing, setClosing] = useState(false)
  const progress = useMotionValue(0)
  const followed = isPersonFollowed(person)
  const close = () => { if (!closing) setClosing(true) }
  useEffect(() => {
    let alive = true
    tmdb.personCredits(person.id, person.director, prefs().hideShowCredits).catch(() => [] as Media[]).then((c) => { if (alive) setCredits(c) })
    return () => { alive = false }
  }, [person.id, person.director])
  useEffect(() => {
    if (closing) {
      const c = animate(progress, 0, { duration: 0.46, ease: fastOutSlowIn, onComplete: dismiss })
      return () => c.stop()
    }
    let c: { stop: () => void } | null = null
    const id = requestAnimationFrame(() => requestAnimationFrame(() => { c = animate(progress, 1, { duration: 0.54, ease: emphasized }) }))
    return () => { cancelAnimationFrame(id); c?.stop() }
  }, [closing])
  useBackHandler(!closing, close)
  const ring = useTransform(progress, (p) => Math.min(1, Math.max(0, 1 - p * 6)))
  const toggleFollow = async () => {
    if (followed) { await unfollowPerson(person); return }
    await followPerson({ person, followedAt: Date.now(), initialized: false, known: [] })
    showToast(`Ti avviserò dei nuovi titoli di ${person.name}`)
    if (!(await notificationsAllowed()) && !(await enablePush())) showToast('Senza notifiche non potrò avvisarti dei nuovi titoli')
  }
  const visible = credits?.filter((m) => creditType === 'all' || m.mediaType === creditType) ?? []
  const accent = followed ? 'var(--amber)' : 'var(--secondary)'
  const preview: ReactNode = (
    <div className="fill">
      <RemoteImage url={person.profile} fallbackIcon="person" style={{ position: 'absolute', inset: 0 }} />
      {/* The photo's gradient ring, visible only while the page is still (almost) the circle. */}
      <motion.div className="fill" style={{ opacity: ring, borderRadius: '50%', padding: 2, background: 'linear-gradient(135deg, #D7142B, #FF4B45)', WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' }} />
    </div>
  )
  return (
    <BackScope.Provider value={!closing}>
      <div className="fill" style={{ zIndex: 20, pointerEvents: closing ? 'none' : 'auto' }}>
        {/* Sources are the circular photos, so the page starts as that circle. */}
        <ContainerTransform progress={progress} source={source} sourceCorner={source ? Math.min(source.width, source.height) / 2 : null} preview={preview}>
          <div className="fill col status-pad nav-pad" style={{ background: 'var(--bg)', padding: '0 20px' }}>
            <div className="row" style={{ padding: '10px 0', paddingTop: 'calc(10px + var(--safe-top))', marginTop: 'calc(-1 * var(--safe-top))' }}>
              <Press pressed={0.9} aria-label="Indietro" onClick={close} className="center" style={{ width: 40, height: 40, borderRadius: 20, background: '#3B161B', flex: 'none' }}>
                <Icon name="back" color="#FFDAD2" />
              </Press>
              <div className="grow col" style={{ paddingLeft: 14 }}>
                <span className="t-headline-medium ellipsis" style={{ color: 'var(--ink)' }}>{person.name}</span>
                <span style={{ color: 'var(--secondary)', fontWeight: 700 }}>{person.director ? 'Film e serie diretti' : 'Film e serie'}</span>
              </div>
              <Press pressed={0.96} onClick={() => void toggleFollow()} className="row"
                style={{ height: 40, borderRadius: 20, padding: '0 12px', gap: 6, flex: 'none', transition: 'background .3s, color .3s', background: followed ? 'rgba(255,194,77,.16)' : 'rgba(255,89,100,.16)', color: accent, fontWeight: 700, fontSize: 14 }}>
                <Icon name={followed ? 'notifications' : 'notificationsNone'} size={18} />
                {followed ? 'Seguito' : 'Segui'}
              </Press>
            </div>
            {credits == null ? <div className="grow center"><Spinner size={54} stroke={5} /></div> : (
              <>
                <SegmentedButtons options={[['all', 'Tutto'], ['movie', 'Film'], ['tv', 'Serie TV']]} selected={creditType} onSelect={setCreditType} style={{ marginTop: 10 }} />
                <PosterGrid media={visible} onOpen={onOpen} columns={2} padding="12px 0 28px" rowGap={18} />
              </>
            )}
          </div>
        </ContainerTransform>
      </div>
    </BackScope.Provider>
  )
}
