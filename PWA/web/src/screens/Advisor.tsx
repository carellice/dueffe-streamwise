import { useState, type ReactNode } from 'react'
import { flatten } from '../../../shared/library.ts'
import { isSeries, type Media } from '../../../shared/model.ts'
import { GENRES, genreValue, PLATFORMS } from '../../../shared/tmdb.ts'
import { BottomSheet } from '../components/Overlay.tsx'
import { alpha, C, Icon, Pressable, RemoteImage, Spinner, TonalIconButton } from '../components/ui.tsx'
import type { IconName } from '../lib/icons.gen.ts'
import type { AdvisorRequest } from '../lib/nav.ts'
import { follow, getData, isFollowed, library, unfollow, useData, useStore } from '../lib/store.ts'
import { attempt, tmdb } from '../lib/tmdb.ts'
import { closeActions, closeAdvisor, openMedia } from '../lib/ui.ts'
import { enablePush } from '../lib/push.ts'
import { AlertDialog, toast } from '../components/Overlay.tsx'
import { TextButton } from '../components/ui.tsx'
import { ReactionDialog } from './Detail.tsx'

export const platformLogo = (id: string) => `/onboarding/service_${({ netflix: 'netflix', 'prime-video': 'prime', 'apple-tv-plus': 'apple', 'disney-plus': 'disney', 'paramount-plus': 'paramount' } as Record<string, string>)[id] ?? 'max'}.webp`

const pick = <T,>(list: T[]): T | null => (list.length ? list[Math.floor(Math.random() * list.length)] : null)

export async function chooseAdvisorTitle(request: AdvisorRequest, excludedId: string | null = null): Promise<Media | null> {
  const genre = GENRES.find((g) => g.id === request.genre) ?? null
  const platform = PLATFORMS.find((p) => p.id === request.platform) ?? null
  let choices: Media[]
  if (request.libraryOnly) {
    choices = [...getData().library.values()].filter((e) => e.state === 'saved' || e.state === 'progress').map((e) => e.media).filter((m) =>
      (request.type === 'all' || m.mediaType === request.type) &&
      (genre == null || genreValue(genre, m.mediaType) <= 0 || m.genreIds.includes(genreValue(genre, m.mediaType))) &&
      (platform == null || [...m.flatrate, ...m.rent, ...m.buy].some((p) => p.id === platform.providerId)))
  } else {
    const actualType = request.type === 'all' ? pick(['movie', 'tv'].filter((t) => genre == null || genreValue(genre, t) !== 0)) ?? 'movie' : request.type
    const page = 1 + Math.floor(Math.random() * 35)
    choices = (await attempt(() => tmdb.discover(actualType, page, genre ? genreValue(genre, actualType) : null, platform?.providerId ?? null, 'popular'), []))
      .filter((m) => !getData().library.has(m.id))
  }
  return pick(choices.filter((m) => m.id !== excludedId))
}

function TypeChoice({ label, icon, selected, onClick }: { label: string; icon: IconName; selected: boolean; onClick: () => void }) {
  return (
    <Pressable pressed={0.96} onClick={() => onClick()} className={selected ? 'brand-glow' : undefined}
      style={{ flex: 1, height: 58, borderRadius: 24, background: selected ? undefined : C.raised, border: selected ? undefined : `1px solid ${C.outline}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px', ['--glow-blur' as string]: '7px' }}>
      <Icon name={icon} size={21} color={selected ? '#fff' : C.muted} style={{ position: 'relative' }} />
      <span style={{ marginLeft: 7, color: selected ? '#fff' : C.muted, fontWeight: 700, position: 'relative' }}>{label}</span>
    </Pressable>
  )
}

function SectionLabel({ icon, title, optional }: { icon: ReactNode; title: string; optional?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginTop: 25 }}>
      {icon}
      <span style={{ color: C.muted, fontWeight: 700, fontSize: 17, marginLeft: 10, flex: 1 }}>{title}</span>
      {optional && <span style={{ color: C.accent, fontSize: 13, fontWeight: 600 }}>Facoltativo</span>}
    </div>
  )
}

/** "Scegli per me": type, genre and platform, then a random title. */
export function AdvisorSheetView({ libraryOnly, open }: { libraryOnly: boolean; open: boolean }) {
  const [type, setType] = useState('all')
  const [genre, setGenre] = useState<string | null>(null)
  const [platform, setPlatform] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const surprise = async () => {
    setLoading(true)
    setError(null)
    const request: AdvisorRequest = { type, genre, platform, libraryOnly }
    const choice = await chooseAdvisorTitle(request)
    setLoading(false)
    if (choice) { closeAdvisor(); window.setTimeout(() => openMedia(choice, null, request), 260) }
    else setError('Nessun titolo trovato con queste preferenze.')
  }
  return (
    <BottomSheet open={open} onDismiss={closeAdvisor} style={{ borderRadius: '34px 34px 0 0' }}>
      <div style={{ padding: '0 20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div className="brand-glow" style={{ width: 64, height: 64, borderRadius: 20, padding: 17, flex: 'none', ['--glow-blur' as string]: '10px' }}>
            <Icon name="sparkles" size={30} color="#fff" style={{ position: 'relative' }} />
          </div>
          <div style={{ marginLeft: 16, flex: 1 }}>
            <div className="t-headline-large" style={{ color: C.ink }}>Scegli per me</div>
            <div style={{ color: C.muted, fontSize: 14, lineHeight: '19px', marginTop: 3 }}>{libraryOnly ? 'Una proposta casuale dalla tua lista.' : 'Una proposta casuale dal catalogo, su misura per te.'}</div>
          </div>
          <TonalIconButton icon="close" label="Chiudi" onClick={closeAdvisor} background={C.raised} tint={C.ink} />
        </div>
        <SectionLabel icon={<Icon name="movie" size={22} color={C.muted} />} title="Tipo di contenuto" />
        <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
          <TypeChoice label="Tutto" icon="grid" selected={type === 'all'} onClick={() => setType('all')} />
          <TypeChoice label="Film" icon="movie" selected={type === 'movie'} onClick={() => setType('movie')} />
          <TypeChoice label="Serie" icon="tv" selected={type === 'tv'} onClick={() => setType('tv')} />
        </div>
        <SectionLabel icon={<span style={{ color: C.muted, fontSize: 25, lineHeight: '24px' }}>◇</span>} title="Generi" optional />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {GENRES.map((g) => {
            const selected = genre === g.id
            return (
              <div key={g.id} onClick={() => setGenre(selected ? null : g.id)}
                style={{ height: 32, borderRadius: 18, padding: '0 16px', display: 'flex', alignItems: 'center', cursor: 'pointer', background: selected ? '#4A1C22' : C.raised, border: `1px solid ${selected ? C.accent : C.outline}`, color: selected ? '#fff' : C.muted, fontSize: 14, fontWeight: 500, letterSpacing: 0.1 }}>
                {g.label}
              </div>
            )
          })}
        </div>
        <SectionLabel icon={<Icon name="tv" size={22} color={C.muted} />} title="Piattaforme" optional />
        <div className="hscroll" style={{ gap: 10, marginTop: 12 }}>
          {PLATFORMS.map((p) => {
            const selected = platform === p.id
            return (
              <Pressable key={p.id} pressed={0.94} onClick={() => setPlatform(selected ? null : p.id)} className={selected ? 'brand-glow' : undefined} aria-label={p.label}
                style={{ width: 68, height: 68, borderRadius: 18, flex: 'none', padding: 13, background: selected ? undefined : C.raised, border: selected ? undefined : `1px solid ${C.outline}`, ['--glow-blur' as string]: '7px' }}>
                <img src={platformLogo(p.id)} alt={p.label} style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'relative' }} />
              </Pressable>
            )
          })}
        </div>
        {error && <div style={{ color: C.error, fontSize: 13, textAlign: 'center', marginTop: 14 }}>{error}</div>}
        <Pressable pressed={0.97} onClick={() => { if (!loading) void surprise() }} className={loading ? undefined : 'brand-glow'}
          style={{ marginTop: 22, height: 62, borderRadius: 31, background: loading ? C.raised : undefined, color: loading ? C.muted : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', ['--glow-blur' as string]: '13px' }}>
          {loading ? <Spinner size={23} color="#fff" stroke={2} /> : <Icon name="sparkles" size={25} style={{ position: 'relative' }} />}
          <span style={{ marginLeft: 10, fontSize: 18, fontWeight: 700, position: 'relative' }}>{loading ? 'Sto scegliendo…' : 'Sorprendimi'}</span>
        </Pressable>
      </div>
    </BottomSheet>
  )
}

// --- ActionSheet (long press on a title) --------------------------------------------------------

function ActionButton({ label, subtitle, icon, accent, destructive = false, onClick }: { label: string; subtitle: string; icon: IconName; accent: string; destructive?: boolean; onClick: () => void }) {
  return (
    <Pressable pressed={0.98} onClick={() => onClick()}
      style={{ marginBottom: 10, borderRadius: 22, background: destructive ? '#621322' : C.raised, border: `1px solid ${destructive ? '#9B2D43' : C.outline}`, padding: '13px 15px', display: 'flex', alignItems: 'center' }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: alpha(accent, 0.15), display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Icon name={icon} size={25} color={destructive ? '#FFB5C2' : accent} />
      </div>
      <div style={{ marginLeft: 13, flex: 1, minWidth: 0 }}>
        <div className="clamp2" style={{ color: destructive ? '#fff' : C.ink, fontWeight: 700, fontSize: 16 }}>{label}</div>
        <div className="clamp2" style={{ color: destructive ? '#E9BAC3' : C.muted, fontSize: 13, marginTop: 2, lineHeight: '18px' }}>{subtitle}</div>
      </div>
      <Icon name="chevron_right" size={23} color={destructive ? '#E9BAC3' : C.muted} />
    </Pressable>
  )
}

export function ActionSheetView({ media }: { media: Media | null }) {
  const data = useData()
  const permission = useStore((s) => s.settings.remindersEnabled)
  const [shown, setShown] = useState<Media | null>(media)
  if (media && media !== shown) setShown(media)
  const m = media ?? shown
  const [confirmHide, setConfirmHide] = useState(false)
  const [pending, setPending] = useState<((liked: boolean) => void) | null>(null)
  if (!m) return null
  const entry = data.library.get(m.id)
  const state = entry?.state ?? ''
  const followed = isFollowed(m.id)
  const done = () => closeActions()
  const nextEpisode = async (liked: boolean | null, current = entry!) => {
    const seasons = await attempt(() => tmdb.seasons(m, true), [])
    const next = seasons.flatMap((s) => s.episodes).find((e) => e.season === current.nextSeason && e.number === current.nextEpisode)
    if (!next) return
    const all = flatten(seasons)
    if (next === all[all.length - 1] && liked == null) setPending(() => (l: boolean) => { void library.markEpisode(m, next, seasons, l); done() })
    else { void library.markEpisode(m, next, seasons, liked); done() }
  }
  const pickMovieSaved = state === 'saved'
  return (
    <>
      <BottomSheet open={media != null} onDismiss={done} style={{ borderRadius: '36px 36px 0 0' }}>
        <div style={{ padding: '0 20px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <RemoteImage url={m.poster || m.backdrop} style={{ width: 104, height: 150, borderRadius: 20, flex: 'none' }} />
            <div style={{ marginLeft: 16, paddingTop: 14, flex: 1, minWidth: 0 }}>
              <div style={{ color: C.accent, fontSize: 11, fontWeight: 900, letterSpacing: 1.7 }}>{isSeries(m) ? 'SERIE TV' : 'FILM'}</div>
              <div className="t-headline-medium clamp2" style={{ color: C.ink, marginTop: 6 }}>{m.title}</div>
              <div className="clamp2" style={{ color: C.muted, fontSize: 14, marginTop: 9 }}>{[m.year, m.genres.slice(0, 2).join(', ')].filter(Boolean).join('  •  ')}</div>
            </div>
            <TonalIconButton icon="close" label="Chiudi" onClick={done} background={C.raised} tint={C.ink} />
          </div>
          <div style={{ height: 24 }} />
          {state === 'hidden' ? (
            <ActionButton label="Ripristina nel catalogo" subtitle="Mostra nuovamente questo titolo" icon="check" accent={C.like} onClick={() => { void library.restore(m); done() }} />
          ) : (
            <>
              {(state === 'saved' || state === 'progress' || state === 'watched') && (
                <ActionButton label={entry?.pinned ? 'Rimuovi dai fissati' : 'Fissa in cima alla home'}
                  subtitle={entry?.pinned ? 'Il titolo non resterà più in cima alla lista' : 'Il titolo comparirà in cima alle sezioni della home e della libreria'}
                  icon="push_pin" accent={C.accent} onClick={() => { void library.togglePinned(m); done() }} />
              )}
              {isSeries(m) ? (
                state === 'watched' ? (
                  <>
                    <ActionButton label="Cambia voto" subtitle="Aggiorna il tuo giudizio sulla serie" icon="thumb_up" accent={C.like} onClick={() => setPending(() => (l: boolean) => { void library.setLiked(m, l); done() })} />
                    <ActionButton label="Ricomincia dal primo episodio" subtitle="Azzera il progresso della serie" icon="play" accent="#62C8D7" onClick={() => { void library.restart(m); done() }} />
                  </>
                ) : (
                  <>
                    <ActionButton label={state === 'progress' ? 'Rimuovi dalla mia lista' : 'Aggiungi alla mia lista'}
                      subtitle={state === 'progress' ? 'Il titolo verrà rimosso dalla tua lista' : 'Salvalo per guardarlo più tardi'}
                      icon={state === 'progress' ? 'check' : 'add'} accent={C.accent} onClick={() => { void (state === 'progress' ? library.remove(m) : library.save(m)); done() }} />
                    {entry && (
                      <ActionButton label={`Segna S${entry.nextSeason} · E${entry.nextEpisode} come visto`} subtitle="Aggiorna il tuo progresso" icon="check" accent={C.like} onClick={() => void nextEpisode(null)} />
                    )}
                    <ActionButton label="Segna tutta la serie come vista" subtitle="Tutti gli episodi verranno segnati come visti" icon="tv" accent="#E273C6"
                      onClick={() => setPending(() => (l: boolean) => { void attempt(() => tmdb.seasons(m, true), []).then((seasons) => { void library.completeSeries(m, seasons, l); done() }) })} />
                  </>
                )
              ) : (
                <>
                  {state !== 'watched' && (
                    <ActionButton label={pickMovieSaved ? 'Rimuovi dalla mia lista' : 'Aggiungi alla mia lista'} subtitle={pickMovieSaved ? 'Il film verrà rimosso dalla tua lista' : 'Salvalo per guardarlo più tardi'}
                      icon={pickMovieSaved ? 'check' : 'add'} accent={C.accent} onClick={() => { void (pickMovieSaved ? library.remove(m) : library.save(m)); done() }} />
                  )}
                  <ActionButton label={state === 'watched' ? 'Rimetti nella mia lista' : 'Segna come visto'} subtitle={state === 'watched' ? 'Il film tornerà tra i titoli da vedere' : 'Completa il film e lascia il tuo voto'}
                    icon="check" accent={C.like} onClick={() => { if (state === 'watched') { void library.markMovieUnwatched(m); done() } else setPending(() => (l: boolean) => { void library.watched(m, l); done() }) }} />
                  {state === 'watched' && <ActionButton label="Cambia voto" subtitle="Aggiorna il tuo giudizio sul film" icon="thumb_up" accent={C.like} onClick={() => setPending(() => (l: boolean) => { void library.setLiked(m, l); done() })} />}
                </>
              )}
              <ActionButton label={followed ? 'Non seguire più' : 'Segui le uscite'}
                subtitle={followed ? 'Non riceverai più notifiche per questo titolo' : isSeries(m) ? 'Ricevi una notifica a ogni nuovo episodio' : 'Ricevi una notifica all’uscita e all’arrivo in streaming'}
                icon={followed ? 'notifications' : 'notifications_none'} accent={C.amber}
                onClick={() => {
                  if (followed) void unfollow(m.id)
                  else {
                    void follow(m, null)
                    if (!permission) void enablePush().then((ok) => { if (!ok) toast('Senza notifiche non potrò avvisarti delle uscite') })
                  }
                  done()
                }} />
              <ActionButton label="Non mi interessa" subtitle="Suggeriremo meno contenuti simili" icon="visibility_off" accent={C.error} destructive onClick={() => setConfirmHide(true)} />
            </>
          )}
        </div>
      </BottomSheet>
      <AlertDialog open={confirmHide} onDismiss={() => setConfirmHide(false)} title="Non ti interessa?" text="Questo titolo verrà nascosto dal catalogo e dalle proposte."
        dismiss={<TextButton onClick={() => setConfirmHide(false)}>Annulla</TextButton>}
        confirm={<TextButton onClick={() => { void library.hide(m); setConfirmHide(false); done() }}>Nascondi</TextButton>} />
      <ReactionDialog open={pending != null} title={m.title} alreadyWatched={state === 'watched'}
        onChoice={(liked) => { pending?.(liked); setPending(null) }} onDismiss={() => setPending(null)} />
    </>
  )
}

