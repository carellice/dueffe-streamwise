import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { episodeWatched, flatten } from '../../../shared/library.ts'
import type { Episode, Media, Season } from '../../../shared/model.ts'
import { fastOutSlowIn, tween } from '../components/motion.ts'
import { AlertDialog, Dialog } from '../components/Overlay.tsx'
import { alpha, C, DropdownMenu, Icon, IconButton, LinearProgress, LoadingPane, Pressable, RemoteImage, TextButton } from '../components/ui.tsx'
import { close } from '../lib/nav.ts'
import { library, useData } from '../lib/store.ts'
import { attempt, tmdb } from '../lib/tmdb.ts'
import { ReactionDialog } from './Detail.tsx'

export function EpisodesPage({ pageKey, media }: { pageKey: number; media: Media }) {
  const data = useData()
  const [seasons, setSeasons] = useState<Season[] | null>(null)
  const [selectedNumber, setSelectedNumber] = useState(0)
  const [menu, setMenu] = useState(false)
  const [confirmSeason, setConfirmSeason] = useState<Season | null>(null)
  const [pending, setPending] = useState<((liked: boolean) => void) | null>(null)
  const [episode, setEpisode] = useState<Episode | null>(null)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void attempt(() => tmdb.seasons(media, true), []).then((loaded) => {
      setSeasons(loaded)
      setSelectedNumber((n) => {
        if (n) return n
        const next = data.library.get(media.id)?.nextSeason
        return next != null && loaded.some((s) => s.number === next) ? next : loaded[0]?.number ?? 0
      })
    })
  }, [media.id])

  const header = (subtitle: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px 12px 10px' }}>
      <IconButton icon="back" label="Indietro" tint={C.muted} onClick={() => close(pageKey)} />
      <div style={{ marginLeft: 4, flex: 1, minWidth: 0 }}>
        <div className="t-title-large ellipsis" style={{ color: C.ink, fontWeight: 900 }}>{media.title}</div>
        {subtitle && <div style={{ color: C.muted, fontSize: 14 }}>Stagioni e puntate</div>}
      </div>
    </div>
  )
  if (seasons == null) return <div style={{ position: 'absolute', inset: 0, background: C.bg }}><LoadingPane /></div>
  if (!seasons.length) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: C.bg, paddingTop: 'var(--status-top)', display: 'flex', flexDirection: 'column' }}>
        {header(false)}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>Nessun episodio disponibile</div>
      </div>
    )
  }
  const season = seasons.find((s) => s.number === selectedNumber) ?? seasons[0]
  const entry = data.library.get(media.id)
  const watchedCount = season.episodes.filter((e) => episodeWatched(entry, e, seasons)).length
  const complete = season.episodes.length > 0 && watchedCount === season.episodes.length
  const all = flatten(seasons)
  const next = all.find((e) => !episodeWatched(entry, e, seasons))
  const last = all[all.length - 1]
  const pick = (n: number) => { setSelectedNumber(n); list.current?.scrollTo({ top: 0 }) }
  const toggleEpisode = (e: Episode, watched: boolean) => {
    if (watched) void library.unwatchEpisode(media, e, seasons)
    else if (e === last) setPending(() => (liked: boolean) => { void library.markEpisode(media, e, seasons, liked) })
    else void library.markEpisode(media, e, seasons, null)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', padding: 'var(--status-top) 0 var(--nav-bottom)' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px 12px 10px' }}>
        <IconButton icon="back" label="Indietro" tint={C.muted} onClick={() => close(pageKey)} />
        <div style={{ marginLeft: 4, flex: 1, minWidth: 0 }}>
          <div className="t-title-large ellipsis" style={{ color: C.ink, fontWeight: 900 }}>{media.title}</div>
          <div style={{ color: C.muted, fontSize: 14 }}>Stagioni e puntate</div>
        </div>
        <div style={{ position: 'relative' }}>
          <Pressable pressed={0.96} onClick={() => setMenu(true)} style={{ background: C.panel, borderRadius: 24, border: `1px solid ${C.outline}`, padding: '11px 17px', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>Stagione {season.number}</span>
            <Icon name="chevron_right" size={16} color={C.muted} style={{ marginLeft: 8, transform: 'rotate(90deg)' }} />
          </Pressable>
          <DropdownMenu open={menu} onDismiss={() => setMenu(false)} style={{ maxHeight: 360, overflowY: 'auto' }}
            items={seasons.map((s) => ({ label: s.name, trailing: s.number === season.number ? <Icon name="check" size={18} color={C.accent} /> : undefined, onClick: () => { pick(s.number); setMenu(false) } }))} />
        </div>
      </div>
      <div className="hscroll" style={{ gap: 9, padding: '0 20px', flex: 'none' }}>
        {seasons.map((s) => {
          const selected = s.number === season.number
          return (
            <Pressable key={s.number} pressed={0.95} onClick={() => pick(s.number)} className={selected ? 'brand-glow' : undefined}
              style={{ flex: 'none', borderRadius: 24, background: selected ? undefined : C.panel, border: `1px solid ${selected ? C.accent : C.outline}`, padding: '12px 22px', ['--glow-blur' as string]: '6px' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: selected ? '#fff' : C.muted, position: 'relative', whiteSpace: 'nowrap' }}>{s.name}</span>
            </Pressable>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', padding: '15px 20px', flex: 'none' }}>
        <LinearProgress value={season.episodes.length ? watchedCount / season.episodes.length : 0} color={C.accent} track={C.raised} height={7} style={{ flex: 1 }} />
        <span style={{ color: C.muted, fontSize: 12, marginLeft: 14 }}>{watchedCount} di {season.episodes.length} visti</span>
        <Pressable pressed={0.9} onClick={() => { if (complete) void library.unwatchSeason(media, season, seasons); else setConfirmSeason(season) }} aria-label="Segna stagione come vista"
          className={complete ? 'brand-glow' : undefined}
          style={{ marginLeft: 8, width: 40, height: 40, borderRadius: '50%', background: complete ? undefined : C.raised, display: 'flex', alignItems: 'center', justifyContent: 'center', ['--glow-blur' as string]: '6px', flex: 'none' }}>
          <Icon name="check" size={18} color={complete ? '#fff' : C.muted} style={{ position: 'relative' }} />
        </Pressable>
      </div>
      <div ref={list} className="scroll" style={{ flex: 1, padding: '0 20px 14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {season.episodes.map((e) => {
            const watched = episodeWatched(entry, e, seasons)
            return (
              <div key={`${e.season}-${e.number}`} id={`ep-${e.season}-${e.number}`}
                style={{ borderRadius: 15, background: watched ? alpha(C.red, 0.31) : C.panel, border: `1px solid ${watched ? alpha(C.primary, 0.55) : C.outline}`, transition: 'background 340ms cubic-bezier(.4,0,.2,1), border-color 340ms cubic-bezier(.4,0,.2,1)' }}>
                <div onClick={() => setEpisode(e)} style={{ padding: 6, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ width: 132, height: 72, borderRadius: 11, overflow: 'hidden', position: 'relative', flex: 'none' }}>
                    <RemoteImage url={e.still || media.backdrop} style={{ position: 'absolute', inset: 0 }} />
                    <div style={{ position: 'absolute', left: 6, bottom: 6, width: 30, height: 30, borderRadius: 9, background: 'rgba(0,0,0,.72)', color: '#fff', fontWeight: 900, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{e.number}</div>
                  </div>
                  <div style={{ padding: '0 12px', flex: 1, minWidth: 0 }}>
                    <div className="clamp2" style={{ color: C.ink, fontWeight: 700 }}>{e.name}</div>
                    {e.runtime > 0 && <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>{e.runtime} min</div>}
                  </div>
                  <Pressable pressed={0.9} onClick={() => toggleEpisode(e, watched)} aria-label={watched ? 'Episodio visto' : 'Segna episodio come visto'}
                    style={{ marginRight: 4, width: 40, height: 40, borderRadius: '50%', background: watched ? 'transparent' : C.raised, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.div key={watched ? 'on' : 'off'} initial={{ opacity: 0, scale: 0.45 }} animate={{ opacity: 1, scale: 1, transition: { opacity: tween(190), scale: tween(280, fastOutSlowIn) } }}
                        exit={{ opacity: 0, scale: 0.7, transition: { opacity: tween(110), scale: tween(150) } }}>
                        <Icon name={watched ? 'check' : 'visibility'} size={watched ? 25 : 18} color={watched ? '#fff' : C.muted} />
                      </motion.div>
                    </AnimatePresence>
                  </Pressable>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {next && (
        <div style={{ padding: '10px 20px', flex: 'none' }}>
          <Pressable pressed={0.97} className="brand-glow" onClick={() => {
            setSelectedNumber(next.season)
            window.setTimeout(() => document.getElementById(`ep-${next.season}-${next.number}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
          }} style={{ height: 58, borderRadius: 29, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', ['--glow-blur' as string]: '10px' }}>
            <Icon name="play" size={20} style={{ position: 'relative' }} />
            <span style={{ marginLeft: 11, fontWeight: 900, fontSize: 14, position: 'relative' }}>Riprendi S{next.season} · E{next.number}</span>
          </Pressable>
        </div>
      )}
      <Dialog open={episode != null} onDismiss={() => setEpisode(null)}>
        {episode && (
          <div style={{ background: C.bg, borderRadius: 24, overflow: 'hidden' }}>
            <RemoteImage url={episode.still || media.backdrop} style={{ width: '100%', aspectRatio: '16 / 9' }} />
            <div style={{ padding: 20 }}>
              <div style={{ color: C.accent, fontWeight: 900, fontSize: 11, letterSpacing: 1.2 }}>STAGIONE {episode.season} · EPISODIO {episode.number}</div>
              <div className="t-headline-small" style={{ color: C.ink, fontWeight: 700, marginTop: 5 }}>{episode.name}</div>
              {episode.runtime > 0 && <div style={{ color: C.muted, fontSize: 13, marginTop: 5 }}>{episode.runtime} min</div>}
              <div style={{ color: C.muted, fontSize: 15, lineHeight: '22px', marginTop: 14 }}>{episode.overview.trim() || 'La trama di questo episodio non è disponibile.'}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}><TextButton onClick={() => setEpisode(null)}>Chiudi</TextButton></div>
            </div>
          </div>
        )}
      </Dialog>
      <AlertDialog open={confirmSeason != null} onDismiss={() => setConfirmSeason(null)} title="Segnare la stagione come vista?"
        text={`Tutti gli episodi di ${confirmSeason?.name ?? ''} verranno segnati come visti.`}
        dismiss={<TextButton onClick={() => setConfirmSeason(null)}>Annulla</TextButton>}
        confirm={<TextButton onClick={() => {
          const s = confirmSeason!
          setConfirmSeason(null)
          if (s.episodes[s.episodes.length - 1] === last) setPending(() => (liked: boolean) => { void library.completeSeason(media, s, seasons, liked) })
          else void library.completeSeason(media, s, seasons, null)
        }}>Segna come vista</TextButton>} />
      <ReactionDialog open={pending != null} title={media.title} onChoice={(liked) => { pending?.(liked); setPending(null) }} onDismiss={() => setPending(null)} />
    </div>
  )
}
