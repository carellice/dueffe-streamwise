// SearchScreen of MainActivity.kt: titles (with an optional year), actors and directors.
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { Media, Person } from '../../../shared/model.ts'
import { useBackHandler } from '../lib/back.ts'
import { useStore } from '../lib/store.ts'
import { tmdb } from '../lib/tmdb.ts'
import { spring, tween } from '../components/motion.ts'
import { GlassIconButton, Icon, Press, RemoteImage, SegmentedPills, Spinner, boundsOf, type Rect } from '../components/ui.tsx'
import { EmptyState, type OpenMedia } from '../components/cards.tsx'
import { PosterGrid } from '../components/grid.tsx'
import { PersonCredits, type PersonSelection } from './Person.tsx'

function PersonResult({ person, onClick }: { person: Person; onClick: (p: Person, rect: Rect | null) => void }) {
  const photo = useRef<HTMLDivElement>(null)
  return (
    <Press className="glass row" style={{ height: 88, borderRadius: 24, padding: '0 12px', flex: 'none' }} onClick={() => onClick(person, boundsOf(photo.current))}>
      <div ref={photo} style={{ width: 64, height: 64, borderRadius: '50%', padding: 2, background: 'linear-gradient(135deg, #D7142B, #FF4B45)', flex: 'none' }}>
        <RemoteImage url={person.profile} fallbackIcon="person" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
      </div>
      <div className="grow col" style={{ padding: '0 15px' }}>
        <span className="ellipsis" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 17 }}>{person.name}</span>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{person.director ? 'Regia · filmografia' : 'Filmografia completa'}</span>
      </div>
      <div className="brand-glow center" style={{ width: 38, height: 38, borderRadius: '50%', flex: 'none', ['--glow' as string]: '6px' }}>
        <Icon name="chevronRight" size={20} color="#fff" />
      </div>
    </Press>
  )
}

const MODES = ['titles', 'actors', 'directors']

function splitYear(query: string): [string, number | null] {
  const match = /(?:^|\s)(\d{4})$/.exec(query)
  if (!match) return [query, null]
  return [(query.slice(0, match.index) + query.slice(match.index + match[0].length)).trim(), Number(match[1])]
}

export function SearchScreen({ onDismiss, onOpen }: { onDismiss: () => void; onOpen: OpenMedia }) {
  useStore()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('titles')
  const [mediaType, setMediaType] = useState('all')
  const [results, setResults] = useState<Media[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [person, setPerson] = useState<PersonSelection | null>(null)
  const [loading, setLoading] = useState(false)
  const [closing, setClosing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const job = useRef(0)
  const closeSearch = () => {
    if (closing) return
    setClosing(true)
    input.current?.blur()
    window.setTimeout(onDismiss, 120)
  }
  useBackHandler(true, closeSearch)
  useEffect(() => {
    const id = window.setTimeout(() => { if (!closing) input.current?.focus() }, 380)
    return () => window.clearTimeout(id)
  }, [])
  const run = async (searchQuery: string, searchMode: string) => {
    const id = ++job.current
    setLoading(true)
    if (searchMode !== 'titles') {
      const found = await tmdb.searchPeople(searchQuery, searchMode === 'directors').catch(() => [] as Person[])
      if (id === job.current) setPeople(found)
    } else {
      const [title, year] = splitYear(searchQuery)
      const found = await tmdb.searchTitles(title, year).catch(() => [] as Media[])
      if (id === job.current) setResults(found)
    }
    if (id === job.current) setLoading(false)
  }
  const submit = () => {
    input.current?.blur()
    if (query.trim() !== '' && !loading) void run(query.trim(), mode)
  }
  useEffect(() => {
    if (query.trim().length < 3) return
    const id = window.setTimeout(() => void run(query.trim(), mode), 550)
    return () => window.clearTimeout(id)
  }, [query, mode])
  const trailing = loading ? 'busy' : query !== '' ? 'filled' : 'empty'
  return (
    <div className="fill col status-pad nav-pad" style={{ background: 'var(--page)', padding: '0 20px' }}>
      <div className="row" style={{ paddingTop: 8 }}>
        <GlassIconButton icon="back" label="Indietro" onClick={closeSearch} />
        <span className="t-headline-large" style={{ color: 'var(--ink)', marginLeft: 14 }}>Cerca</span>
      </div>
      <div className="glass row" style={{ ['--glass-alpha' as string]: 0.9, marginTop: 18, height: 58, borderRadius: 29, padding: '0 8px 0 18px', flex: 'none' }}>
        <Icon name="search" size={22} color="var(--accent)" />
        <input ref={input} className="field" value={query} enterKeyHint="search" autoComplete="off" spellCheck={false}
          placeholder={mode === 'actors' ? 'Nome dell’attore o attrice' : mode === 'directors' ? 'Nome del regista' : 'Titolo · anno facoltativo'}
          onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          style={{ flex: 1, margin: '0 12px', fontSize: 17, fontWeight: 500, lineHeight: '24px', caretColor: 'var(--accent)' }} />
        <div style={{ width: 40, height: 40, flex: 'none' }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={trailing} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={tween(220)} className="center" style={{ width: 40, height: 40 }}>
              {trailing === 'busy' ? <Spinner size={20} stroke={2} color="var(--accent)" />
                : trailing === 'filled' ? <button aria-label="Cancella" className="center" style={{ width: 40, height: 40 }} onClick={() => { setQuery(''); setResults([]); setPeople([]) }}><Icon name="close" color="var(--muted)" /></button>
                  : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <SegmentedPills options={['Titoli', 'Attori', 'Registi']} selected={MODES.indexOf(mode)} style={{ marginTop: 14, flex: 'none' }}
        onSelect={(i) => { job.current++; setLoading(false); setPeople([]); setResults([]); setMode(MODES[i]) }} />
      <AnimatePresence initial={false}>
        {mode === 'titles' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring(1, 1500)} style={{ overflow: 'hidden', flex: 'none' }}>
            <div className="row" style={{ paddingTop: 10, gap: 8 }}>
              {([['all', 'Tutti'], ['movie', 'Film'], ['tv', 'Serie TV']] as const).map(([id, label]) => {
                const active = mediaType === id
                return (
                  <Press key={id} pressed={0.95} onClick={() => setMediaType(id)}
                    style={{ borderRadius: 999, background: active ? 'rgba(255,89,100,.18)' : 'var(--raised)', boxShadow: active ? 'inset 0 0 0 1px var(--accent)' : undefined, padding: '7px 14px', color: active ? 'var(--accent)' : 'var(--muted)', fontWeight: 700, fontSize: 13, lineHeight: '18px' }}>
                    {label}
                  </Press>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {query.trim() === '' && results.length === 0 && people.length === 0 && (
        <EmptyState icon="search" style={{ paddingTop: 48 }}
          title={mode === 'actors' ? 'Cerca un attore' : mode === 'directors' ? 'Cerca un regista' : 'Cosa ti va di vedere?'}
          body={mode === 'titles' ? 'Scrivi un titolo: i risultati arrivano mentre digiti. Aggiungi l’anno per essere più preciso, ad esempio “Dune 2021”.' : 'Apri la filmografia completa e segui la persona per sapere quando esce un suo nuovo titolo.'} />
      )}
      {mode !== 'titles' ? (
        <div className="scroll col" style={{ flex: 1, minHeight: 0, marginTop: 14, gap: 9, paddingBottom: 24 }}>
          {people.map((p) => <PersonResult key={p.id} person={p} onClick={(sel, rect) => setPerson({ person: sel, source: rect })} />)}
        </div>
      ) : (
        <PosterGrid media={results.filter((m) => mediaType === 'all' || m.mediaType === mediaType)} onOpen={onOpen} padding="16px 0 28px" rowGap={18} />
      )}
      {person && <PersonCredits person={person.person} source={person.source} dismiss={() => setPerson(null)} onOpen={onOpen} />}
    </div>
  )
}
