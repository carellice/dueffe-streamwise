import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import type { Media } from '../../../shared/model.ts'
import { GENRES, genreValue, PLATFORMS, unique, type Platform } from '../../../shared/tmdb.ts'
import { emphasized, haptic, spring, tween } from '../components/motion.ts'
import { alpha, AnimatedCount, brand, C, EmptyState, GlassIconButton, Icon, MetaPill, Pressable, Reveal, SegmentedPills, Spinner } from '../components/ui.tsx'
import { close, useBackHandler } from '../lib/nav.ts'
import { useData } from '../lib/store.ts'
import { attempt, tmdb } from '../lib/tmdb.ts'
import { openActions } from '../lib/ui.ts'
import { platformLogo } from './Advisor.tsx'
import { PosterGrid } from './Detail.tsx'
import { SearchPosterCard } from './Discover.tsx'

export const genreEmoji = (id: string) => ({ action: '💥', comedy: '😂', drama: '🎭', thriller: '🔪', 'sci-fi': '🪐', horror: '👻', documentary: '🎥' } as Record<string, string>)[id] ?? '💋'

/** FilterScreen ("Esplora"): platforms and genres first, then the results. */
export function FilterPage({ pageKey, type }: { pageKey: number; type: string }) {
  const data = useData()
  const [kind, setKind] = useState(type)
  const [platforms, setPlatforms] = useState<string[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [results, setResults] = useState<Media[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showing, setShowing] = useState(false)
  const fetch = (nextPage: number) => attempt(async () => {
    const providerIds = PLATFORMS.filter((p) => platforms.includes(p.id)).map((p) => p.providerId)
    const genreIds = GENRES.filter((g) => genres.includes(g.id) && g.id !== 'erotic' && genreValue(g, kind) > 0).map((g) => genreValue(g, kind))
    const erotic = genres.includes('erotic')
    const horrorSeries = kind === 'tv' && genres.includes('horror')
    const [regular, eroticTitles, horrorTitles] = await Promise.all([
      (!erotic && !horrorSeries) || genreIds.length ? tmdb.discoverFiltered(kind, nextPage, genreIds, providerIds, false) : Promise.resolve([]),
      erotic ? tmdb.discoverFiltered(kind, nextPage, [], providerIds, true) : Promise.resolve([]),
      horrorSeries ? tmdb.horrorSeries(nextPage, providerIds) : Promise.resolve([]),
    ])
    return unique([...regular, ...eroticTitles, ...horrorTitles])
  }, [] as Media[])
  const search = async () => {
    if (loading) return
    setLoading(true)
    setPage(1)
    setResults(await fetch(1))
    setShowing(true)
    setLoading(false)
  }
  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    const nextPage = page + 1
    const more = await fetch(nextPage)
    if (more.length) { setResults((r) => unique([...r, ...more])); setPage(nextPage) }
    setLoadingMore(false)
  }
  const labels = [...PLATFORMS.filter((p) => platforms.includes(p.id)).map((p) => p.label), ...GENRES.filter((g) => genres.includes(g.id)).map((g) => `${genreEmoji(g.id)} ${g.label}`)]
  useBackHandler(showing, () => setShowing(false))
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -80, right: -90, width: 320, height: 320, borderRadius: '50%', background: `radial-gradient(circle, ${alpha(C.red, 0.22)}, transparent 70%)` }} />
      <div style={{ position: 'absolute', top: '50%', left: -120, marginTop: -140, width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${alpha(C.coral, 0.1)}, transparent 70%)` }} />
      <AnimatePresence initial={false} custom={showing}>
        <motion.div key={showing ? 'results' : 'filters'} custom={showing} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}
          variants={{
            enter: (r: boolean) => ({ opacity: 0, x: r ? '25%' : '-25%' }),
            center: { opacity: 1, x: 0, transition: { opacity: tween(280, undefined, 60), x: tween(420, emphasized) } },
            exit: (r: boolean) => ({ opacity: 0, x: r ? '-16.7%' : '16.7%', transition: { opacity: tween(160), x: tween(360, emphasized) } }),
          }}
          initial="enter" animate="center" exit="exit">
          {!showing ? (
            <>
              <div className="scroll" style={{ flex: 1, padding: 'calc(var(--status-top) + 8px) 20px 24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <GlassIconButton icon="back" label="Indietro" onClick={() => close(pageKey)} />
                    <div style={{ flex: 1 }} />
                    <AnimatePresence>
                      {(platforms.length > 0 || genres.length > 0) && (
                        <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0 }} onClick={() => { setPlatforms([]); setGenres([]) }}
                          style={{ color: C.accent, fontWeight: 700, padding: '10px 14px', cursor: 'pointer' }}>Azzera</motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <Reveal>
                    <div style={{ color: C.accent, fontSize: 12, fontWeight: 900, letterSpacing: 2 }}>ESPLORA</div>
                    <div className="t-display-small" style={{ color: C.ink, marginTop: 4 }}>Cosa ti va<br />di vedere?</div>
                    <div style={{ color: C.muted, fontSize: 15, lineHeight: '21px', marginTop: 8 }}>Scegli piattaforme e generi: ti mostro solo i titoli che fanno per te.</div>
                  </Reveal>
                  <Reveal delay={60}><SegmentedPills options={['Film', 'Serie TV']} selected={kind === 'tv' ? 1 : 0} onSelect={(i) => setKind(i === 1 ? 'tv' : 'movie')} /></Reveal>
                  <Reveal delay={100}><SectionLabel title="Piattaforme" detail={platforms.length ? `${platforms.length} scelte` : 'Tutte'} /></Reveal>
                  <Reveal delay={140}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {PLATFORMS.map((p) => <PlatformTile key={p.id} platform={p} selected={platforms.includes(p.id)} onClick={() => toggle(platforms, setPlatforms, p.id)} />)}
                    </div>
                  </Reveal>
                  <Reveal delay={180} style={{ paddingTop: 6 }}><SectionLabel title="Generi" detail={genres.length ? `${genres.length} scelti` : 'Tutti'} /></Reveal>
                  <Reveal delay={220}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 8, rowGap: 10 }}>
                      {GENRES.map((g) => <GenreChip key={g.id} emoji={genreEmoji(g.id)} label={g.label} selected={genres.includes(g.id)} onClick={() => toggle(genres, setGenres, g.id)} />)}
                    </div>
                  </Reveal>
                </div>
              </div>
              <div style={{ background: `linear-gradient(180deg, transparent, ${alpha(C.bg, 0.96)}, ${C.bg})`, padding: '8px 20px calc(var(--nav-bottom) + 14px)' }}>
                <div className="ellipsis" style={{ color: C.muted, fontSize: 13, textAlign: 'center', paddingBottom: 10 }}>{labels.length ? labels.join(' · ') : 'Nessun filtro: ti mostro i titoli più popolari'}</div>
                <Pressable pressed={0.97} className="brand-glow" onClick={() => void search()} style={{ height: 60, borderRadius: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', ['--glow-blur' as string]: '14px' }}>
                  {loading ? <Spinner size={24} color="#fff" stroke={2.5} /> : (
                    <><Icon name="sparkles" size={22} style={{ position: 'relative' }} /><span style={{ marginLeft: 10, fontSize: 17, fontWeight: 700, position: 'relative' }}>{kind === 'tv' ? 'Mostra le serie' : 'Mostra i film'}</span></>
                  )}
                </Pressable>
              </div>
            </>
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 'var(--status-top)' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px 0' }}>
                <GlassIconButton icon="back" label="Modifica filtri" onClick={() => setShowing(false)} />
                <div style={{ flex: 1, padding: '0 14px' }}>
                  <div className="t-headline-medium" style={{ color: C.ink }}>Risultati</div>
                  <AnimatedCount value={results.length}>{(v) => <div style={{ color: C.muted, fontSize: 13 }}>{v} {kind === 'tv' ? 'serie' : 'film'} trovati</div>}</AnimatedCount>
                </div>
                <GlassIconButton icon="tune" label="Modifica filtri" onClick={() => setShowing(false)} />
              </div>
              {labels.length > 0 && <div className="hscroll" style={{ gap: 8, padding: '0 20px', marginTop: 14 }}>{labels.map((l) => <MetaPill key={l} text={l} background={C.raised} style={{ flex: 'none' }} />)}</div>}
              {results.length === 0 ? <EmptyState icon="search" title="Nessun titolo trovato" body="Prova a togliere qualche piattaforma o genere." action="Modifica filtri" onAction={() => setShowing(false)} /> : (
                <div className="scroll" style={{ flex: 1 }}>
                  <PosterGrid style={{ padding: '16px 20px 32px' }}>
                    {results.map((m, i) => <Reveal key={m.id} delay={(i % 12) * 40} distance={24}><SearchPosterCard media={m} entry={data.library.get(m.id)} onLongPress={() => openActions(m)} /></Reveal>)}
                    <div style={{ gridColumn: '1 / -1', paddingTop: 6 }}>
                      <Pressable pressed={0.97} className="glass" onClick={() => void loadMore()} style={{ height: 54, borderRadius: 54, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {loadingMore ? <Spinner size={22} color={C.accent} stroke={2} /> : <><Icon name="add" size={20} color={C.accent} /><span style={{ color: C.ink, fontWeight: 700, marginLeft: 8 }}>Mostra altri titoli</span></>}
                      </Pressable>
                    </div>
                  </PosterGrid>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function SectionLabel({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', paddingTop: 8 }}>
      <div style={{ flex: 1, color: C.ink, fontSize: 21, fontWeight: 800 }}>{title}</div>
      <div style={{ position: 'relative', height: 20, overflow: 'hidden' }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={detail} initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '-100%', opacity: 0 }} transition={spring(1, 400)}
            style={{ color: C.accent, fontWeight: 700, fontSize: 13, lineHeight: '20px', whiteSpace: 'nowrap' }}>{detail}</motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function PlatformTile({ platform, selected, onClick }: { platform: Platform; selected: boolean; onClick: () => void }) {
  return (
    <Pressable pressed={0.92} onClick={() => { haptic(); onClick() }}
      style={{ aspectRatio: '0.9', borderRadius: 24, background: C.surface, position: 'relative', overflow: 'hidden' }}>
      <motion.div initial={false} animate={{ opacity: selected ? 1 : 0 }} transition={tween(260)} style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${alpha(C.red, 0.28)}, ${alpha(C.coral, 0.12)})` }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: 24, padding: 1.5, background: selected ? brand : 'rgba(255,255,255,.08)', WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <motion.img src={platformLogo(platform.id)} alt={platform.label} initial={false} animate={{ scale: selected ? 1.08 : 1, opacity: selected ? 1 : 0.75 }} transition={spring(0.4, 500)}
          style={{ width: 54, height: 54, borderRadius: 14, objectFit: 'contain' }} />
        <div className="ellipsis" style={{ color: selected ? '#fff' : C.muted, fontWeight: 700, fontSize: 12, marginTop: 10, maxWidth: '100%' }}>{platform.label}</div>
      </div>
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1, transition: spring(0.45, 600) }} exit={{ scale: 0, opacity: 0, transition: tween(140) }}
            className="brand-glow" style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', ['--glow-blur' as string]: '6px' }}>
            <Icon name="check" size={15} color="#fff" style={{ position: 'relative' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </Pressable>
  )
}

function GenreChip({ emoji, label, selected, onClick }: { emoji: string; label: string; selected: boolean; onClick: () => void }) {
  return (
    <Pressable pressed={0.92} onClick={() => { haptic(); onClick() }}
      style={{ height: 50, borderRadius: 50, background: C.surface, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', padding: '0 18px 0 7px' }}>
      <motion.div initial={false} animate={{ opacity: selected ? 1 : 0 }} transition={tween(260)} style={{ position: 'absolute', inset: 0, background: brand }} />
      <motion.div initial={false} animate={{ opacity: selected ? 0 : 1 }} transition={tween(260)} style={{ position: 'absolute', inset: 0, borderRadius: 50, border: '1px solid rgba(255,255,255,.08)' }} />
      <div style={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', background: `rgba(255,255,255,${selected ? 0.22 : 0.1})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{emoji}</div>
      <span style={{ position: 'relative', color: selected ? '#fff' : C.ink, fontWeight: 700, fontSize: 14, marginLeft: 9 }}>{label}</span>
    </Pressable>
  )
}
