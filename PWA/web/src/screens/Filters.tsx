// FilterScreen ("Esplora") of MainActivity.kt: platforms and genres, then the results grid.
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import type { Media } from '../../../shared/model.ts'
import { GENRES, PLATFORMS, genreValue, uniqueMedia, type Platform } from '../../../shared/tmdb.ts'
import { useBackHandler } from '../lib/back.ts'
import { useStore } from '../lib/store.ts'
import { tmdb } from '../lib/tmdb.ts'
import { advisorPlatformLogo } from '../lib/subscriptions.tsx'
import { emphasized, haptic, spring, tween } from '../components/motion.ts'
import { AnimatedCount, GlassIconButton, Icon, MetaPill, Press, Reveal, SegmentedPills, Spinner } from '../components/ui.tsx'
import { EmptyState, type OpenMedia } from '../components/cards.tsx'
import { PosterGrid } from '../components/grid.tsx'

export function genreEmoji(id: string): string {
  switch (id) {
    case 'action': return '💥'
    case 'comedy': return '😂'
    case 'drama': return '🎭'
    case 'thriller': return '🔪'
    case 'sci-fi': return '🪐'
    case 'horror': return '👻'
    case 'documentary': return '🎥'
    default: return '💋'
  }
}

export function ExploreSectionLabel({ title, detail, style }: { title: string; detail: string; style?: React.CSSProperties }) {
  return (
    <div className="row" style={{ paddingTop: 8, alignItems: 'flex-end', ...style }}>
      <span className="grow" style={{ color: 'var(--ink)', fontSize: 21, fontWeight: 800, lineHeight: '28px' }}>{title}</span>
      <div style={{ position: 'relative', overflow: 'hidden', height: 24 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={detail} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -24, opacity: 0 }} transition={spring(1, 1500)}
            style={{ display: 'block', color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>{detail}</motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
}

export function PlatformTile({ platform, selected, onClick }: { platform: Platform; selected: boolean; onClick: () => void }) {
  return (
    <Press pressed={0.92} onClick={() => { haptic(); onClick() }} className="grow"
      style={{ aspectRatio: '0.9', borderRadius: 24, background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
      <motion.div className="fill" initial={false} animate={{ opacity: selected ? 1 : 0 }} transition={tween(260)} style={{ background: 'linear-gradient(135deg, rgba(215,20,43,.28), rgba(255,75,69,.12))' }} />
      <div className="fill" style={{ borderRadius: 24, padding: 1.5, background: selected ? 'var(--brand)' : 'rgba(255,255,255,.08)', WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' }} />
      <div className="fill col center" style={{ padding: 10 }}>
        <motion.img src={advisorPlatformLogo(platform.id)} alt={platform.label} initial={false} animate={{ scale: selected ? 1.08 : 1, opacity: selected ? 1 : 0.75 }} transition={spring(0.4, 500)}
          style={{ width: 54, height: 54, borderRadius: 14, objectFit: 'contain' }} />
        <span className="ellipsis" style={{ color: selected ? '#fff' : 'var(--muted)', fontWeight: 700, fontSize: 12, marginTop: 10, maxWidth: '100%' }}>{platform.label}</span>
      </div>
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1, transition: spring(0.45, 600) }} exit={{ scale: 0, opacity: 0, transition: tween(140) }}
            className="brand-glow center" style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%', ['--glow' as string]: '6px' }}>
            <Icon name="check" size={15} color="#fff" />
          </motion.div>
        )}
      </AnimatePresence>
    </Press>
  )
}

export function GenreChip({ emoji, label, selected, onClick }: { emoji: string; label: string; selected: boolean; onClick: () => void }) {
  return (
    <Press pressed={0.92} onClick={() => { haptic(); onClick() }} className="row"
      style={{ height: 50, borderRadius: 25, background: 'var(--surface)', padding: '0 18px 0 7px', position: 'relative', overflow: 'hidden' }}>
      <motion.div className="fill" initial={false} animate={{ opacity: selected ? 1 : 0 }} transition={tween(260)} style={{ background: 'var(--brand)' }} />
      <motion.div className="fill" initial={false} animate={{ opacity: selected ? 0 : 1 }} transition={tween(260)} style={{ borderRadius: 25, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08)' }} />
      <div className="center" style={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', background: `rgba(255,255,255,${selected ? 0.22 : 0.1})`, transition: 'background .26s' }}>
        <span style={{ fontSize: 18, lineHeight: '24px' }}>{emoji}</span>
      </div>
      <span style={{ position: 'relative', color: selected ? '#fff' : 'var(--ink)', fontWeight: 700, fontSize: 14, marginLeft: 9 }}>{label}</span>
    </Press>
  )
}

export function FilterScreen({ type, onDismiss, onOpen, onAction }: { type: string; onDismiss: () => void; onOpen: OpenMedia; onAction: (m: Media) => void }) {
  useStore()
  const [kind, setKind] = useState(type)
  const [platforms, setPlatforms] = useState<string[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [results, setResults] = useState<Media[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showingResults, setShowingResults] = useState(false)
  const fetch = async (nextPage: number): Promise<Media[]> => {
    try {
      const providerIds = PLATFORMS.filter((p) => platforms.includes(p.id)).map((p) => p.providerId)
      const genreIds = GENRES.filter((g) => genres.includes(g.id) && g.id !== 'erotic' && genreValue(g, kind) > 0).map((g) => genreValue(g, kind))
      const erotic = genres.includes('erotic')
      const horrorSeries = kind === 'tv' && genres.includes('horror')
      const regular = (!erotic && !horrorSeries) || genreIds.length > 0 ? await tmdb.discoverFiltered(kind, nextPage, genreIds, providerIds, false) : []
      const eroticTitles = erotic ? await tmdb.discoverFiltered(kind, nextPage, [], providerIds, true) : []
      const horrorTitles = horrorSeries ? await tmdb.horrorSeries(nextPage, providerIds) : []
      return uniqueMedia([...regular, ...eroticTitles, ...horrorTitles])
    } catch {
      return []
    }
  }
  const search = async () => {
    if (loading) return
    setLoading(true)
    setPage(1)
    setResults(await fetch(1))
    setShowingResults(true)
    setLoading(false)
  }
  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    const next = page + 1
    const more = await fetch(next)
    if (more.length > 0) { setResults((r) => uniqueMedia([...r, ...more])); setPage(next) }
    setLoadingMore(false)
  }
  const labels = [...PLATFORMS.filter((p) => platforms.includes(p.id)).map((p) => p.label), ...GENRES.filter((g) => genres.includes(g.id)).map((g) => `${genreEmoji(g.id)} ${g.label}`)]
  useBackHandler(true, () => { if (showingResults) setShowingResults(false); else onDismiss() })
  const toggle = (list: string[], set: (l: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  return (
    <div className="fill" style={{ background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -80, right: -90, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(215,20,43,.22), transparent 70%)' }} />
      <div style={{ position: 'absolute', top: '50%', left: -120, width: 280, height: 280, marginTop: -140, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,75,69,.1), transparent 70%)' }} />
      <AnimatePresence initial={false} custom={showingResults}>
        {!showingResults ? (
          <motion.div key="filters" className="fill col"
            initial={{ opacity: 0, x: '-25%' }} animate={{ opacity: 1, x: 0, transition: { opacity: tween(280, undefined, 60), x: tween(420, emphasized) } }}
            exit={{ opacity: 0, x: '-16%', transition: { opacity: tween(160), x: tween(360, emphasized) } }}>
            <div className="scroll grow" style={{ minHeight: 0 }}>
              <div className="col" style={{ padding: '8px 20px 24px', paddingTop: 'calc(8px + var(--safe-top))', gap: 16 }}>
                <div className="row">
                  <GlassIconButton icon="back" label="Indietro" onClick={onDismiss} />
                  <div className="grow" />
                  <AnimatePresence>
                    {(platforms.length > 0 || genres.length > 0) && (
                      <motion.span key="reset" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0 }} transition={spring(1, 1500)}
                        onClick={() => { setPlatforms([]); setGenres([]) }} style={{ color: 'var(--accent)', fontWeight: 700, padding: '10px 14px', cursor: 'pointer' }}>Azzera</motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <Reveal>
                  <div style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 900, letterSpacing: 2, lineHeight: '16px' }}>ESPLORA</div>
                  <div className="t-display-small" style={{ color: 'var(--ink)', marginTop: 4 }}>Cosa ti va<br />di vedere?</div>
                  <div style={{ color: 'var(--muted)', fontSize: 15, lineHeight: '21px', marginTop: 8 }}>Scegli piattaforme e generi: ti mostro solo i titoli che fanno per te.</div>
                </Reveal>
                <Reveal delay={60}><SegmentedPills options={['Film', 'Serie TV']} selected={kind === 'tv' ? 1 : 0} onSelect={(i) => setKind(i === 1 ? 'tv' : 'movie')} /></Reveal>
                <Reveal delay={100}><ExploreSectionLabel title="Piattaforme" detail={platforms.length === 0 ? 'Tutte' : `${platforms.length} scelte`} /></Reveal>
                <Reveal delay={140} className="col" style={{ gap: 10 }}>
                  {[PLATFORMS.slice(0, 3), PLATFORMS.slice(3, 6)].map((row, i) => (
                    <div key={i} className="row" style={{ gap: 10 }}>
                      {row.map((p) => <PlatformTile key={p.id} platform={p} selected={platforms.includes(p.id)} onClick={() => toggle(platforms, setPlatforms, p.id)} />)}
                    </div>
                  ))}
                </Reveal>
                <Reveal delay={180} style={{ paddingTop: 6 }}><ExploreSectionLabel title="Generi" detail={genres.length === 0 ? 'Tutti' : `${genres.length} scelti`} /></Reveal>
                <Reveal delay={220} className="row" style={{ flexWrap: 'wrap', columnGap: 8, rowGap: 10 }}>
                  {GENRES.map((g) => <GenreChip key={g.id} emoji={genreEmoji(g.id)} label={g.label} selected={genres.includes(g.id)} onClick={() => toggle(genres, setGenres, g.id)} />)}
                </Reveal>
              </div>
            </div>
            <div className="nav-pad" style={{ background: 'linear-gradient(180deg, transparent, rgba(10,11,16,.96), #0A0B10)', padding: '8px 20px 14px', paddingBottom: 'calc(14px + var(--safe-bottom))' }}>
              <div className="ellipsis" style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', paddingBottom: 10 }}>
                {labels.length === 0 ? 'Nessun filtro: ti mostro i titoli più popolari' : labels.join(' · ')}
              </div>
              <Press pressed={loading ? 1 : 0.97} disabled={loading} onClick={() => void search()} className="brand-glow row center"
                style={{ height: 60, borderRadius: 30, ['--glow' as string]: '14px', color: '#fff', gap: 10 }}>
                {loading ? <Spinner size={24} stroke={2.5} color="#fff" /> : <><Icon name="sparkles" size={22} /><span style={{ fontSize: 17, fontWeight: 700 }}>{kind === 'tv' ? 'Mostra le serie' : 'Mostra i film'}</span></>}
              </Press>
            </div>
          </motion.div>
        ) : (
          <motion.div key="results" className="fill col status-pad"
            initial={{ opacity: 0, x: '25%' }} animate={{ opacity: 1, x: 0, transition: { opacity: tween(280, undefined, 60), x: tween(420, emphasized) } }}
            exit={{ opacity: 0, x: '16%', transition: { opacity: tween(160), x: tween(360, emphasized) } }}>
            <div className="row" style={{ padding: '8px 20px 0' }}>
              <GlassIconButton icon="back" label="Modifica filtri" onClick={() => setShowingResults(false)} />
              <div className="grow col" style={{ padding: '0 14px' }}>
                <span className="t-headline-medium" style={{ color: 'var(--ink)' }}>Risultati</span>
                <AnimatedCount value={results.length} render={(n) => <span style={{ color: 'var(--muted)', fontSize: 13 }}>{n} {kind === 'tv' ? 'serie' : 'film'} trovati</span>} />
              </div>
              <GlassIconButton icon="tune" label="Modifica filtri" onClick={() => setShowingResults(false)} />
            </div>
            {labels.length > 0 && (
              <div className="hscroll row" style={{ marginTop: 14, padding: '0 20px', gap: 8, flex: 'none' }}>
                {labels.map((l) => <MetaPill key={l} text={l} background="var(--raised)" style={{ flex: 'none' }} />)}
              </div>
            )}
            {results.length === 0 ? <EmptyState icon="search" title="Nessun titolo trovato" body="Prova a togliere qualche piattaforma o genere." action="Modifica filtri" onAction={() => setShowingResults(false)} />
              : (
                <PosterGrid media={results} onOpen={onOpen} onLongPress={onAction} padding="16px 20px 32px" style={{ flex: 1 }}
                  footer={
                    <Press pressed={0.97} disabled={loadingMore} onClick={() => void loadMore()} className="glass row center" style={{ marginTop: 22, height: 54, borderRadius: 27 }}>
                      {loadingMore ? <Spinner size={22} stroke={2} color="var(--accent)" /> : <><Icon name="add" size={20} color="var(--accent)" /><span style={{ color: 'var(--ink)', fontWeight: 700, marginLeft: 8 }}>Mostra altri titoli</span></>}
                    </Press>
                  } />
              )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
