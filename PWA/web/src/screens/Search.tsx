import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { Media, Person } from '../../../shared/model.ts'
import { tween } from '../components/motion.ts'
import { alpha, brand, C, EmptyState, GlassIconButton, Icon, IconButton, Pressable, RemoteImage, SegmentedPills, Spinner } from '../components/ui.tsx'
import { close } from '../lib/nav.ts'
import { useData } from '../lib/store.ts'
import { attempt, tmdb } from '../lib/tmdb.ts'
import { openPerson } from '../lib/ui.ts'
import { PosterGrid } from './Detail.tsx'
import { SearchPosterCard } from './Discover.tsx'

const MODES = ['titles', 'actors', 'directors']

/** "Dune 2021": the year at the end is optional and narrows the titles. */
function splitYear(query: string): [string, number | null] {
  const m = /(?:^|\s)(\d{4})$/.exec(query)
  if (!m) return [query, null]
  return [(query.slice(0, m.index) + query.slice(m.index + m[0].length)).trim(), Number(m[1])]
}

export function SearchPage({ pageKey }: { pageKey: number }) {
  const data = useData()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('titles')
  const [mediaType, setMediaType] = useState('all')
  const [results, setResults] = useState<Media[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const generation = useRef(0)

  useEffect(() => {
    const id = window.setTimeout(() => input.current?.focus(), 380)
    return () => window.clearTimeout(id)
  }, [])

  const run = (q: string, m: string) => {
    const g = ++generation.current
    setLoading(true)
    void (async () => {
      if (m !== 'titles') {
        const found = await attempt(() => tmdb.searchPeople(q, m === 'directors'), [])
        if (g === generation.current) setPeople(found)
      } else {
        const [title, year] = splitYear(q)
        const found = await attempt(() => tmdb.searchTitles(title, year), [])
        if (g === generation.current) setResults(found)
      }
      if (g === generation.current) setLoading(false)
    })()
  }
  // Results arrive while typing (550 ms after the last key, from 3 characters).
  useEffect(() => {
    if (query.trim().length < 3) return
    const id = window.setTimeout(() => run(query.trim(), mode), 550)
    return () => window.clearTimeout(id)
  }, [query, mode])

  const submit = () => {
    input.current?.blur()
    if (query.trim() && !loading) run(query.trim(), mode)
  }
  const placeholder = mode === 'actors' ? 'Nome dell’attore o attrice' : mode === 'directors' ? 'Nome del regista' : 'Titolo · anno facoltativo'
  const trailing = loading ? 'busy' : query ? 'filled' : 'empty'
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', padding: 'var(--status-top) 20px var(--nav-bottom)' }}>
      <div style={{ display: 'flex', alignItems: 'center', paddingTop: 8 }}>
        <GlassIconButton icon="back" label="Indietro" onClick={() => { input.current?.blur(); window.setTimeout(() => close(pageKey), 120) }} />
        <div className="t-headline-large" style={{ color: C.ink, marginLeft: 14 }}>Cerca</div>
      </div>
      <div className="glass" style={{ ['--glass-alpha' as string]: 0.9, marginTop: 18, height: 58, borderRadius: 29, display: 'flex', alignItems: 'center', padding: '0 8px 0 18px', flex: 'none' }}>
        <Icon name="search" size={22} color={C.accent} />
        <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} enterKeyHint="search"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          className="field" style={{ flex: 1, margin: '0 12px', fontSize: 17, fontWeight: 500, caretColor: C.accent, position: 'relative' }} />
        <div style={{ width: 40, height: 40, position: 'relative' }}>
          <AnimatePresence initial={false}>
            <motion.div key={trailing} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={tween(220)}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {trailing === 'busy' ? <Spinner size={20} color={C.accent} stroke={2} /> : trailing === 'filled' ? (
                <IconButton icon="close" label="Cancella" size={40} onClick={() => { setQuery(''); setResults([]); setPeople([]) }} />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <SegmentedPills options={['Titoli', 'Attori', 'Registi']} selected={MODES.indexOf(mode)} style={{ marginTop: 14, flex: 'none' }}
        onSelect={(i) => { generation.current++; setLoading(false); setPeople([]); setResults([]); setMode(MODES[i]) }} />
      <AnimatePresence initial={false}>
        {mode === 'titles' && (
          <motion.div key="types" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={tween(250)} style={{ overflow: 'hidden', flex: 'none' }}>
            <div style={{ display: 'flex', gap: 8, paddingTop: 10 }}>
              {[['all', 'Tutti'], ['movie', 'Film'], ['tv', 'Serie TV']].map(([id, label]) => {
                const active = mediaType === id
                return (
                  <Pressable key={id} onClick={() => setMediaType(id)}
                    style={{ borderRadius: 40, background: active ? alpha(C.accent, 0.18) : C.raised, border: `1px solid ${active ? C.accent : 'transparent'}`, padding: '7px 14px' }}>
                    <span style={{ color: active ? C.accent : C.muted, fontWeight: 700, fontSize: 13 }}>{label}</span>
                  </Pressable>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="scroll" style={{ flex: 1, marginTop: 14 }}>
        {!query.trim() && results.length === 0 && people.length === 0 && (
          <EmptyState icon="search" title={mode === 'actors' ? 'Cerca un attore' : mode === 'directors' ? 'Cerca un regista' : 'Cosa ti va di vedere?'}
            body={mode === 'titles' ? 'Scrivi un titolo: i risultati arrivano mentre digiti. Aggiungi l’anno per essere più preciso, ad esempio “Dune 2021”.' : 'Apri la filmografia completa e segui la persona per sapere quando esce un suo nuovo titolo.'} />
        )}
        {mode !== 'titles' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingBottom: 24 }}>
            {people.map((p) => <PersonResult key={p.id} person={p} />)}
          </div>
        ) : (
          <PosterGrid style={{ rowGap: 18, padding: '2px 0 28px' }}>
            {results.filter((m) => mediaType === 'all' || m.mediaType === mediaType).map((m) => <SearchPosterCard key={m.id} media={m} entry={data.library.get(m.id)} />)}
          </PosterGrid>
        )}
      </div>
    </div>
  )
}

export function PersonResult({ person }: { person: Person }) {
  const photo = useRef<HTMLDivElement>(null)
  return (
    <Pressable className="glass" onClick={() => openPerson(person, photo.current?.getBoundingClientRect() ?? null)}
      style={{ height: 88, borderRadius: 24, display: 'flex', alignItems: 'center', padding: '0 12px', flex: 'none' }}>
      <div ref={photo} style={{ width: 64, height: 64, borderRadius: '50%', padding: 2, background: brand, flex: 'none' }}>
        <RemoteImage url={person.profile} fallbackIcon="person" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
      </div>
      <div style={{ flex: 1, padding: '0 15px', minWidth: 0 }}>
        <div className="ellipsis" style={{ color: C.ink, fontWeight: 700, fontSize: 17 }}>{person.name}</div>
        <div style={{ color: C.muted, fontSize: 12 }}>{person.director ? 'Regia · filmografia' : 'Filmografia completa'}</div>
      </div>
      <div className="brand-glow" style={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', ['--glow-blur' as string]: '6px' }}>
        <Icon name="chevron_right" size={20} color="#fff" style={{ position: 'relative' }} />
      </div>
    </Pressable>
  )
}
