// EpisodesScreen and EpisodeOverviewDialog of MainActivity.kt.
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { Episode, Media, Season } from '../../../shared/model.ts'
import * as lib from '../../../shared/library.ts'
import { useBackHandler } from '../lib/back.ts'
import { entryOf, saveEntry, useStore } from '../lib/store.ts'
import { tmdb } from '../lib/tmdb.ts'
import { fastOutSlowIn, tween } from '../components/motion.ts'
import { AlertDialog, Dialog, DialogButton } from '../components/overlay.tsx'
import { Icon, LinearProgress, Press, RemoteImage, Spinner } from '../components/ui.tsx'
import { ReactionDialog } from './Detail.tsx'

export function EpisodesScreen({ media, onDismiss }: { media: Media; onDismiss: () => void }) {
  useStore()
  const [seasons, setSeasons] = useState<Season[] | null>(null)
  const [selectedNumber, setSelectedNumber] = useState(0)
  const [menu, setMenu] = useState(false)
  const [pendingSeason, setPendingSeason] = useState<Season | null>(null)
  const [pendingCompletion, setPendingCompletion] = useState<((liked: boolean) => void) | null>(null)
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    tmdb.seasons(media, true).catch(() => [] as Season[]).then((loaded) => {
      if (!alive) return
      setSeasons(loaded)
      setSelectedNumber((current) => {
        if (current !== 0) return current
        const next = entryOf(media)?.nextSeason
        return next != null && loaded.some((s) => s.number === next) ? next : loaded[0]?.number ?? 0
      })
    })
    return () => { alive = false }
  }, [media.id])
  useBackHandler(true, onDismiss)
  useBackHandler(menu, () => setMenu(false))

  const save = (work: () => ReturnType<typeof lib.markEpisode>) => { void saveEntry(work()) }

  if (seasons == null) {
    return <div className="fill center" style={{ background: 'var(--page)' }}><Spinner size={54} stroke={5} /></div>
  }
  if (seasons.length === 0) {
    return (
      <div className="fill col status-pad" style={{ background: 'var(--page)' }}>
        <div className="row" style={{ padding: '8px 16px' }}>
          <button className="center" onClick={onDismiss} style={{ width: 48, height: 48 }}><Icon name="back" /></button>
          <span className="t-title-large" style={{ fontWeight: 700 }}>{media.title}</span>
        </div>
        <div className="grow center" style={{ color: 'var(--muted)' }}>Nessun episodio disponibile</div>
      </div>
    )
  }
  const selected = seasons.find((s) => s.number === selectedNumber) ?? seasons[0]
  const entry = entryOf(media)
  const watchedCount = selected.episodes.filter((e) => lib.episodeWatched(entry, e, seasons)).length
  const seasonComplete = selected.episodes.length > 0 && watchedCount === selected.episodes.length
  const all = lib.flatten(seasons)
  const nextEpisode = all.find((e) => !lib.episodeWatched(entry, e, seasons)) ?? null
  const last = all[all.length - 1]
  const pick = (number: number) => {
    setSelectedNumber(number)
    list.current?.scrollTo({ top: 0 })
  }

  return (
    <div className="fill col status-pad nav-pad" style={{ background: 'var(--page)' }}>
      <div className="row" style={{ padding: '8px 16px 12px 10px' }}>
        <button className="center" aria-label="Indietro" onClick={onDismiss} style={{ width: 48, height: 48, flex: 'none' }}><Icon name="back" /></button>
        <div className="grow col" style={{ paddingLeft: 4 }}>
          <span className="t-title-large ellipsis" style={{ fontWeight: 900 }}>{media.title}</span>
          <span style={{ color: 'var(--muted)', fontSize: 14 }}>Stagioni e puntate</span>
        </div>
        <div style={{ position: 'relative' }}>
          <Press pressed={0.96} onClick={() => setMenu(true)} className="row" style={{ background: 'var(--surface)', borderRadius: 24, boxShadow: 'inset 0 0 0 1px var(--outline)', padding: '11px 17px' }}>
            <span style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>Stagione {selected.number}</span>
            <Icon name="chevronRight" size={16} color="var(--muted)" style={{ marginLeft: 8, transform: 'rotate(90deg)' }} />
          </Press>
          <AnimatePresence>
            {menu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setMenu(false)} />
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={tween(150, fastOutSlowIn)}
                  className="scroll" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 10, minWidth: 180, maxHeight: 360, background: 'var(--surface-high)', borderRadius: 4, padding: '8px 0', boxShadow: '0 4px 12px rgba(0,0,0,.5)', transformOrigin: 'top right' }}>
                  {seasons.map((season) => (
                    <div key={season.number} className="row" onClick={() => { pick(season.number); setMenu(false) }}
                      style={{ height: 48, padding: '0 12px', gap: 12, cursor: 'pointer', fontSize: 14, letterSpacing: 0.1, whiteSpace: 'nowrap' }}>
                      <span className="grow">{season.name}</span>
                      {season.number === selected.number && <Icon name="check" size={18} color="var(--secondary)" />}
                    </div>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="hscroll row" style={{ gap: 9, padding: '0 20px', flex: 'none' }}>
        {seasons.map((season) => {
          const active = season.number === selected.number
          return (
            <Press key={season.number} pressed={0.96} onClick={() => pick(season.number)} className={active ? 'brand-glow' : ''}
              style={{ flex: 'none', borderRadius: 24, background: active ? undefined : 'var(--surface)', boxShadow: active ? undefined : 'inset 0 0 0 1px var(--outline)', padding: '12px 22px', ['--glow' as string]: '6px' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: active ? '#fff' : 'var(--muted)', whiteSpace: 'nowrap' }}>{season.name}</span>
            </Press>
          )
        })}
      </div>

      <div className="row" style={{ padding: '15px 20px' }}>
        <LinearProgress value={selected.episodes.length === 0 ? 0 : watchedCount / selected.episodes.length} color="var(--secondary)" height={7} style={{ flex: 1 }} />
        <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 14, whiteSpace: 'nowrap' }}>{watchedCount} di {selected.episodes.length} visti</span>
        <Press pressed={0.9} aria-label="Segna stagione come vista" className={'center ' + (seasonComplete ? 'brand-glow' : '')}
          onClick={() => { if (seasonComplete) save(() => lib.unwatchSeason(entryOf(media), media, selected, seasons)); else setPendingSeason(selected) }}
          style={{ marginLeft: 8, width: 40, height: 40, borderRadius: '50%', flex: 'none', background: seasonComplete ? undefined : 'var(--raised)', ['--glow' as string]: '6px' }}>
          <Icon name="check" size={18} color={seasonComplete ? '#fff' : 'var(--muted)'} />
        </Press>
      </div>

      <div ref={list} className="scroll col" style={{ flex: 1, minHeight: 0, gap: 8, padding: '0 20px 14px' }}>
        {selected.episodes.map((episode) => {
          const watched = lib.episodeWatched(entryOf(media), episode, seasons)
          return (
            <div key={`${episode.season}-${episode.number}`} style={{
              flex: 'none', borderRadius: 15, transition: 'background-color 340ms cubic-bezier(.4,0,.2,1), box-shadow 340ms cubic-bezier(.4,0,.2,1)',
              background: watched ? 'rgba(215,20,43,.31)' : 'var(--surface)', boxShadow: `inset 0 0 0 1px ${watched ? 'rgba(229,36,58,.55)' : 'var(--outline)'}`,
            }}>
              <div className="row" style={{ padding: 6, cursor: 'pointer' }} onClick={() => setSelectedEpisode(episode)}>
                <div style={{ width: 132, height: 72, borderRadius: 11, overflow: 'hidden', position: 'relative', flex: 'none' }}>
                  <RemoteImage url={episode.still || media.backdrop} style={{ position: 'absolute', inset: 0 }} />
                  <div className="center" style={{ position: 'absolute', left: 6, bottom: 6, width: 30, height: 30, borderRadius: 9, background: 'rgba(0,0,0,.72)', color: '#fff', fontWeight: 900, fontSize: 12 }}>{episode.number}</div>
                </div>
                <div className="grow col" style={{ padding: '0 12px' }}>
                  <span className="clamp2" style={{ color: 'var(--ink)', fontWeight: 700 }}>{episode.name}</span>
                  {episode.runtime > 0 && <span style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>{episode.runtime} min</span>}
                </div>
                <Press pressed={0.9} aria-label={watched ? 'Episodio visto' : 'Segna episodio come visto'} className="center"
                  onClick={() => {
                    if (watched) save(() => lib.unwatchEpisode(entryOf(media), media, episode, seasons))
                    else if (episode === last) setPendingCompletion(() => (liked: boolean) => save(() => lib.markEpisode(entryOf(media), media, episode, seasons, liked)))
                    else save(() => lib.markEpisode(entryOf(media), media, episode, seasons, null))
                  }}
                  style={{ marginRight: 4, width: 40, height: 40, borderRadius: '50%', flex: 'none', background: watched ? 'transparent' : 'var(--raised)' }}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div key={String(watched)} initial={{ opacity: 0, scale: 0.45 }}
                      animate={{ opacity: 1, scale: 1, transition: { opacity: tween(190), scale: tween(280, fastOutSlowIn) } }}
                      exit={{ opacity: 0, scale: 0.7, transition: { opacity: tween(110), scale: tween(150) } }}>
                      <Icon name={watched ? 'check' : 'visibility'} size={watched ? 25 : 18} color={watched ? '#fff' : 'var(--muted)'} />
                    </motion.div>
                  </AnimatePresence>
                </Press>
              </div>
            </div>
          )
        })}
      </div>

      {nextEpisode && (
        <Press pressed={0.97} className="row center brand-glow" style={{ margin: '10px 20px', height: 58, borderRadius: 29, gap: 11, color: '#fff', ['--glow' as string]: '10px', flex: 'none' }}
          onClick={() => {
            pick(nextEpisode.season)
            window.setTimeout(() => {
              const season = seasons.find((s) => s.number === nextEpisode.season)
              const index = Math.max(0, season?.episodes.findIndex((e) => e.number === nextEpisode.number) ?? 0)
              const row = list.current?.children[index] as HTMLElement | undefined
              if (row && list.current) list.current.scrollTo({ top: row.offsetTop - 0, behavior: 'smooth' })
            }, 80)
          }}>
          <Icon name="play" size={20} />
          <span style={{ fontWeight: 900, fontSize: 14 }}>Riprendi S{nextEpisode.season} · E{nextEpisode.number}</span>
        </Press>
      )}

      <Dialog open={selectedEpisode != null} onDismiss={() => setSelectedEpisode(null)}>
        {selectedEpisode && (
          <div style={{ background: 'var(--page)', borderRadius: 24, overflow: 'hidden' }} className="scroll">
            <RemoteImage url={selectedEpisode.still || media.backdrop} style={{ width: '100%', aspectRatio: '16 / 9' }} />
            <div className="col" style={{ padding: 20 }}>
              <span style={{ color: 'var(--secondary)', fontWeight: 900, fontSize: 11, letterSpacing: 1.2, lineHeight: '16px' }}>STAGIONE {selectedEpisode.season} · EPISODIO {selectedEpisode.number}</span>
              <span className="t-headline-small" style={{ color: 'var(--ink)', fontWeight: 700, marginTop: 5 }}>{selectedEpisode.name}</span>
              {selectedEpisode.runtime > 0 && <span style={{ color: 'var(--muted)', fontSize: 13, marginTop: 5 }}>{selectedEpisode.runtime} min</span>}
              <span style={{ color: 'var(--muted)', fontSize: 15, lineHeight: '22px', marginTop: 14 }}>{selectedEpisode.overview.trim() || 'La trama di questo episodio non è disponibile.'}</span>
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <DialogButton onClick={() => setSelectedEpisode(null)}>Chiudi</DialogButton>
              </div>
            </div>
          </div>
        )}
      </Dialog>
      <AlertDialog open={pendingSeason != null} onDismiss={() => setPendingSeason(null)} title="Segnare la stagione come vista?"
        text={`Tutti gli episodi di ${pendingSeason?.name ?? ''} verranno segnati come visti.`}
        confirm={{ label: 'Segna come vista', onClick: () => {
          const season = pendingSeason!
          setPendingSeason(null)
          if (season.episodes[season.episodes.length - 1] === last) setPendingCompletion(() => (liked: boolean) => save(() => lib.completeSeason(entryOf(media), media, season, seasons, liked)))
          else save(() => lib.completeSeason(entryOf(media), media, season, seasons, null))
        } }}
        dismiss={{ label: 'Annulla', onClick: () => setPendingSeason(null) }} />
      <ReactionDialog open={pendingCompletion != null} title={media.title} onDismiss={() => setPendingCompletion(null)}
        onChoice={(liked) => { pendingCompletion?.(liked); setPendingCompletion(null) }} />
    </div>
  )
}
