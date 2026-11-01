import { useEffect, useState } from 'react'
import type { Media, Person } from '../../../shared/model.ts'
import { toast } from '../components/Overlay.tsx'
import { alpha, C, Icon, LoadingPane, Pressable, TonalIconButton } from '../components/ui.tsx'
import { close } from '../lib/nav.ts'
import { enablePush } from '../lib/push.ts'
import { followPerson, getData, isPersonFollowed, unfollowPerson, useData, useStore } from '../lib/store.ts'
import { attempt, tmdb } from '../lib/tmdb.ts'
import { SearchPosterCard } from './Discover.tsx'

/** M3 SingleChoiceSegmentedButtonRow. */
export function SegmentedButtons({ options, selected, onSelect }: { options: [string, string][]; selected: string; onSelect: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', height: 40 }}>
      {options.map(([id, label], i) => {
        const active = id === selected
        return (
          <div key={id} onClick={() => onSelect(id)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid #4B505E', marginLeft: i ? -1 : 0, background: active ? '#331D20' : 'transparent', color: active ? '#FFDAD2' : C.ink, borderRadius: i === 0 ? '20px 0 0 20px' : i === options.length - 1 ? '0 20px 20px 0' : 0 }}>
            {active && <Icon name="check" size={18} color="#FFDAD2" style={{ marginRight: 8 }} />}
            <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: 0.1 }}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export function PersonPage({ pageKey, person }: { pageKey: number; person: Person }) {
  const data = useData()
  const permission = useStore((s) => s.settings.remindersEnabled)
  const [credits, setCredits] = useState<Media[] | null>(null)
  const [type, setType] = useState('all')
  const followed = isPersonFollowed(person)
  useEffect(() => {
    void attempt(() => tmdb.personCredits(person.id, person.director, getData().prefs.hideShowCredits), []).then(setCredits)
  }, [person.id, person.director])
  const toggle = async () => {
    if (followed) { void unfollowPerson(person); return }
    void followPerson(person)
    toast(`Ti avviserò dei nuovi titoli di ${person.name}`)
    if (!permission && !(await enablePush())) toast('Senza notifiche non potrò avvisarti dei nuovi titoli')
  }
  const accent = followed ? C.amber : C.accent
  void data
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', padding: 'var(--status-top) 20px var(--nav-bottom)' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0' }}>
        <TonalIconButton icon="back" label="Indietro" onClick={() => close(pageKey)} />
        <div style={{ marginLeft: 14, flex: 1, minWidth: 0 }}>
          <div className="t-headline-medium ellipsis" style={{ color: C.ink }}>{person.name}</div>
          <div style={{ color: C.accent, fontWeight: 700 }}>{person.director ? 'Film e serie diretti' : 'Film e serie'}</div>
        </div>
        <Pressable pressed={0.95} onClick={() => void toggle()}
          style={{ height: 40, borderRadius: 40, padding: '0 12px', background: alpha(accent, 0.16), color: accent, display: 'flex', alignItems: 'center', flex: 'none', transition: 'background 300ms, color 300ms' }}>
          <Icon name={followed ? 'notifications' : 'notifications_none'} size={18} />
          <span style={{ marginLeft: 6, fontWeight: 700, fontSize: 14, letterSpacing: 0.1 }}>{followed ? 'Seguito' : 'Segui'}</span>
        </Pressable>
      </div>
      {credits == null ? <div style={{ position: 'relative', flex: 1 }}><LoadingPane /></div> : (
        <>
          <div style={{ paddingTop: 10 }}>
            <SegmentedButtons options={[['all', 'Tutto'], ['movie', 'Film'], ['tv', 'Serie TV']]} selected={type} onSelect={setType} />
          </div>
          <div className="scroll" style={{ flex: 1, marginTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 18, paddingBottom: 28 }}>
              {credits.filter((m) => type === 'all' || m.mediaType === type).map((m) => <SearchPosterCard key={m.id} media={m} entry={data.library.get(m.id)} />)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
