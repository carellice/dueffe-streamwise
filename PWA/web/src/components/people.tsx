import { useRef, useState } from 'react'
import type { Person } from '../../../shared/model.ts'
import { Dialog } from './Overlay.tsx'
import { Row } from './cards.tsx'
import { brand, C, Icon, Pressable, RemoteImage, TextButton } from './ui.tsx'

/** PeopleRail: round photos with a brand ring; "Tutti (n)" opens the full list in a dialog. */
export function PeopleRail({ people, title = 'Cast', topPadding = 26, onPerson }: { people: Person[]; title?: string; topPadding?: number; onPerson: (p: Person, rect: DOMRect | null) => void }) {
  const [full, setFull] = useState(false)
  return (
    <div style={{ paddingTop: topPadding }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px 10px 20px' }}>
        <div className="t-title-large" style={{ flex: 1, color: C.ink }}>{title}</div>
        <TextButton onClick={() => setFull(true)} color={C.primary}>Tutti ({people.length})</TextButton>
      </div>
      <Row gap={14} style={{ height: 120 }}>
        {people.map((person) => <PersonChip key={person.id} person={person} onPerson={onPerson} />)}
      </Row>
      <Dialog open={full} onDismiss={() => setFull(false)}>
        <div style={{ background: C.bg, borderRadius: 26, padding: 16, height: '86vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div className="t-title-large" style={{ flex: 1, color: C.ink }}>{title === 'Regia' ? 'Registi' : title === 'Cast' ? 'Cast completo' : title}</div>
            <Pressable onClick={() => setFull(false)} aria-label="Chiudi elenco" style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" color={C.muted} />
            </Pressable>
          </div>
          <div className="scroll" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: 8, rowGap: 12, paddingBottom: 12, alignContent: 'start' }}>
            {people.map((person) => (
              <div key={person.id} onClick={() => { setFull(false); onPerson(person, null) }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', textAlign: 'center' }}>
                <RemoteImage url={person.profile} style={{ width: 72, height: 72, borderRadius: '50%' }} />
                <div className="clamp2" style={{ color: C.ink, fontSize: 12, fontWeight: 700, marginTop: 6, lineHeight: '16px' }}>{person.name}</div>
                {person.character && <div className="clamp2" style={{ color: C.muted, fontSize: 10, lineHeight: '13px' }}>{person.character}</div>}
              </div>
            ))}
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function PersonChip({ person, onPerson }: { person: Person; onPerson: (p: Person, rect: DOMRect | null) => void }) {
  const photo = useRef<HTMLDivElement>(null)
  return (
    // The person page grows out of the circle, not the whole photo-and-name block.
    <Pressable onClick={() => onPerson(person, photo.current?.getBoundingClientRect() ?? null)} onLongPress={() => {}}
      style={{ width: 84, height: 120, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div ref={photo} style={{ width: 76, height: 76, borderRadius: '50%', padding: 2, background: brand, flex: 'none' }}>
        <RemoteImage url={person.profile} fallbackIcon="person" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
      </div>
      <div className="clamp2" style={{ color: C.ink, fontSize: 12, lineHeight: '15px', fontWeight: 700, marginTop: 6, height: 38, textAlign: 'center', width: '100%' }}>{person.name}</div>
    </Pressable>
  )
}
