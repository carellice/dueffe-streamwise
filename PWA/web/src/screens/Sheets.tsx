// AdvisorSheet ("Scegli per me") and ActionSheet of MainActivity.kt, both ModalBottomSheets.
import { useState } from 'react'
import type { Media } from '../../../shared/model.ts'
import { isSeries } from '../../../shared/model.ts'
import * as lib from '../../../shared/library.ts'
import { GENRES, PLATFORMS, genreValue, type Genre, type Platform } from '../../../shared/tmdb.ts'
import { entries, entryOf, followOf, removeEntry, saveEntry } from '../lib/store.ts'
import { tmdb } from '../lib/tmdb.ts'
import { advisorPlatformLogo } from '../lib/subscriptions.tsx'
import { AlertDialog, BottomSheet } from '../components/overlay.tsx'
import { Icon, Press, RemoteImage, Spinner } from '../components/ui.tsx'
import type { IconName } from '../lib/icons.gen.ts'
import { ReactionDialog, toggleFollow } from './Detail.tsx'

export type AdvisorRequest = { type: string; genre: Genre | null; platform: Platform | null; libraryOnly: boolean }

const random = <T,>(list: T[]): T | null => (list.length === 0 ? null : list[Math.floor(Math.random() * list.length)])

export async function chooseAdvisorTitle(request: AdvisorRequest, excludedId: string | null = null): Promise<Media | null> {
  let choices: Media[]
  if (request.libraryOnly) {
    choices = entries().filter((e) => e.state === 'saved' || e.state === 'progress').map((e) => e.media).filter((media) =>
      (request.type === 'all' || media.mediaType === request.type) &&
      (request.genre == null || genreValue(request.genre, media.mediaType) <= 0 || media.genreIds.includes(genreValue(request.genre, media.mediaType))) &&
      (request.platform == null || [...media.flatrate, ...media.rent, ...media.buy].some((p) => p.id === request.platform!.providerId)))
  } else {
    const actualType = request.type === 'all'
      ? random(['movie', 'tv'].filter((t) => request.genre == null || genreValue(request.genre, t) !== 0)) ?? 'movie'
      : request.type
    const page = 1 + Math.floor(Math.random() * 35)
    const found = await tmdb.discover(actualType, page, request.genre ? genreValue(request.genre, actualType) : null, request.platform?.providerId ?? null, 'popular').catch(() => [] as Media[])
    choices = found.filter((m) => entryOf(m) == null)
  }
  return random(choices.filter((m) => m.id !== excludedId))
}

function AdvisorTypeChoice({ label, icon, selected, onClick }: { label: string; icon: IconName; selected: boolean; onClick: () => void }) {
  return (
    <Press pressed={0.96} onClick={onClick} className={'grow row center ' + (selected ? 'brand-glow' : '')}
      style={{ height: 58, borderRadius: 24, padding: '0 10px', background: selected ? undefined : 'var(--raised)', boxShadow: selected ? undefined : 'inset 0 0 0 1px var(--outline)', ['--glow' as string]: '7px' }}>
      <Icon name={icon} size={21} color={selected ? '#fff' : 'var(--muted)'} />
      <span style={{ color: selected ? '#fff' : 'var(--muted)', fontWeight: 700, marginLeft: 7, whiteSpace: 'nowrap' }}>{label}</span>
    </Press>
  )
}

function SheetHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="row">
      <div className="brand-glow center" style={{ width: 64, height: 64, borderRadius: 20, flex: 'none', ['--glow' as string]: '10px' }}>
        <Icon name="sparkles" size={30} color="#fff" />
      </div>
      <div className="grow col" style={{ paddingLeft: 16 }}>
        <span className="t-headline-large" style={{ color: 'var(--ink)' }}>{title}</span>
        <span style={{ color: 'var(--muted)', fontSize: 14, lineHeight: '19px', marginTop: 3 }}>{subtitle}</span>
      </div>
      <CloseButton onClick={onClose} />
    </div>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Press pressed={0.9} aria-label="Chiudi" onClick={onClick} className="center" style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--raised)', flex: 'none' }}>
      <Icon name="close" />
    </Press>
  )
}

export function AdvisorSheet({ libraryOnly, onDismiss, onOpen }: { libraryOnly: boolean; onDismiss: () => void; onOpen: (m: Media, r: AdvisorRequest) => void }) {
  const [type, setType] = useState('all')
  const [genre, setGenre] = useState<Genre | null>(null)
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <BottomSheet onDismiss={onDismiss} radius={34}>
      {(close) => (
        <div className="col nav-pad" style={{ padding: '0 20px 24px', paddingBottom: 'calc(24px + var(--safe-bottom))' }}>
          <SheetHeader title="Scegli per me" subtitle={libraryOnly ? 'Una proposta casuale dalla tua lista.' : 'Una proposta casuale dal catalogo, su misura per te.'} onClose={() => close()} />
          <div className="row" style={{ paddingTop: 26 }}>
            <Icon name="movie" size={22} color="var(--muted)" />
            <span style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 17, marginLeft: 10 }}>Tipo di contenuto</span>
          </div>
          <div className="row" style={{ paddingTop: 12, gap: 9 }}>
            <AdvisorTypeChoice label="Tutto" icon="grid" selected={type === 'all'} onClick={() => setType('all')} />
            <AdvisorTypeChoice label="Film" icon="movie" selected={type === 'movie'} onClick={() => setType('movie')} />
            <AdvisorTypeChoice label="Serie" icon="tv" selected={type === 'tv'} onClick={() => setType('tv')} />
          </div>
          <div className="row" style={{ paddingTop: 25 }}>
            <span style={{ color: 'var(--muted)', fontSize: 25, lineHeight: '30px' }}>◇</span>
            <span className="grow" style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 17, marginLeft: 8 }}>Generi</span>
            <span style={{ color: 'var(--secondary)', fontSize: 13, fontWeight: 600 }}>Facoltativo</span>
          </div>
          <div className="row" style={{ paddingTop: 10, flexWrap: 'wrap', gap: 8 }}>
            {GENRES.map((item) => {
              const selected = genre?.id === item.id
              return (
                <Press key={item.id} pressed={0.96} onClick={() => setGenre(selected ? null : item)}
                  style={{ height: 32, borderRadius: 18, padding: '0 16px', display: 'flex', alignItems: 'center', background: selected ? '#4A1C22' : 'var(--raised)', boxShadow: `inset 0 0 0 1px ${selected ? 'var(--secondary)' : 'var(--outline)'}`, color: selected ? '#fff' : 'var(--muted)', fontSize: 14, fontWeight: 700 }}>
                  {item.label}
                </Press>
              )
            })}
          </div>
          <div className="row" style={{ paddingTop: 25 }}>
            <Icon name="tv" size={22} color="var(--muted)" />
            <span className="grow" style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 17, marginLeft: 10 }}>Piattaforme</span>
            <span style={{ color: 'var(--secondary)', fontSize: 13, fontWeight: 600 }}>Facoltativo</span>
          </div>
          <div className="hscroll row" style={{ paddingTop: 12, gap: 10 }}>
            {PLATFORMS.map((item) => {
              const selected = platform?.id === item.id
              return (
                <Press key={item.id} pressed={0.94} onClick={() => setPlatform(selected ? null : item)} className={selected ? 'brand-glow' : ''}
                  style={{ width: 68, height: 68, borderRadius: 18, flex: 'none', padding: 13, background: selected ? undefined : 'var(--raised)', boxShadow: selected ? undefined : 'inset 0 0 0 1px var(--outline)', ['--glow' as string]: '7px' }}>
                  <img src={advisorPlatformLogo(item.id)} alt={item.label} style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'relative' }} />
                </Press>
              )
            })}
          </div>
          {error && <div style={{ color: 'var(--error)', fontSize: 13, textAlign: 'center', paddingTop: 14 }}>{error}</div>}
          <Press pressed={loading ? 1 : 0.97} disabled={loading} className={'row center ' + (loading ? '' : 'brand-glow')}
            onClick={async () => {
              setLoading(true)
              setError(null)
              const request: AdvisorRequest = { type, genre, platform, libraryOnly }
              const choice = await chooseAdvisorTitle(request)
              setLoading(false)
              if (choice) close(() => onOpen(choice, request))
              else setError('Nessun titolo trovato con queste preferenze.')
            }}
            style={{ marginTop: 22, height: 62, borderRadius: 31, gap: 10, ['--glow' as string]: '13px', background: loading ? 'var(--raised)' : undefined, color: loading ? 'var(--muted)' : '#fff' }}>
            {loading ? <Spinner size={23} stroke={2} color="#fff" /> : <Icon name="sparkles" size={25} />}
            <span style={{ fontSize: 18, fontWeight: 700 }}>{loading ? 'Sto scegliendo…' : 'Sorprendimi'}</span>
          </Press>
        </div>
      )}
    </BottomSheet>
  )
}

function ActionButton({ label, subtitle, icon, accent, destructive = false, onClick }: { label: string; subtitle: string; icon: IconName; accent: string; destructive?: boolean; onClick: () => void }) {
  return (
    <Press pressed={0.98} onClick={onClick} className="row"
      style={{ background: destructive ? '#621322' : 'var(--raised)', borderRadius: 22, boxShadow: `inset 0 0 0 1px ${destructive ? '#9B2D43' : 'var(--outline)'}`, marginBottom: 10, padding: '13px 15px' }}>
      <div className="center" style={{ width: 48, height: 48, borderRadius: '50%', flex: 'none', background: `color-mix(in srgb, ${accent} 15%, transparent)` }}>
        <Icon name={icon} size={25} color={destructive ? '#FFB5C2' : accent} />
      </div>
      <div className="grow col" style={{ paddingLeft: 13 }}>
        <span className="clamp2" style={{ color: destructive ? '#fff' : 'var(--ink)', fontWeight: 700, fontSize: 16, lineHeight: '22px' }}>{label}</span>
        <span className="clamp2" style={{ color: destructive ? '#E9BAC3' : 'var(--muted)', fontSize: 13, lineHeight: '18px', marginTop: 2 }}>{subtitle}</span>
      </div>
      <Icon name="chevronRight" size={23} color={destructive ? '#E9BAC3' : 'var(--muted)'} />
    </Press>
  )
}

export function ActionSheet({ media, onDismiss }: { media: Media; onDismiss: () => void }) {
  const entry = entryOf(media)
  const state = entry?.state ?? ''
  const [confirmHide, setConfirmHide] = useState(false)
  const [followed] = useState(() => followOf(media.id) != null)
  const [pendingReaction, setPendingReaction] = useState<((liked: boolean) => void) | null>(null)
  const listed = state === 'saved' || state === 'progress' || state === 'watched'
  return (
    <BottomSheet onDismiss={onDismiss}>
      {(close) => {
        const changed = (work: () => void | Promise<unknown>) => close(() => { void work(); onDismiss() })
        const seasonsThen = async (work: (seasons: Awaited<ReturnType<typeof tmdb.seasons>>) => void) => {
          const seasons = await tmdb.seasons(media, true).catch(() => [])
          work(seasons)
        }
        return (
          <div className="col nav-pad" style={{ padding: '0 20px 26px', paddingBottom: 'calc(26px + var(--safe-bottom))' }}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <RemoteImage url={media.poster || media.backdrop} style={{ width: 104, height: 150, borderRadius: 20, flex: 'none' }} />
              <div className="grow col" style={{ padding: '14px 0 0 16px' }}>
                <span style={{ color: 'var(--secondary)', fontSize: 11, fontWeight: 900, letterSpacing: 1.7, lineHeight: '16px' }}>{isSeries(media) ? 'SERIE TV' : 'FILM'}</span>
                <span className="t-headline-medium clamp2" style={{ color: 'var(--ink)', marginTop: 6 }}>{media.title}</span>
                <span className="clamp2" style={{ color: 'var(--muted)', fontSize: 14, marginTop: 9 }}>{[media.year, media.genres.slice(0, 2).join(', ')].filter((x) => x.trim() !== '').join('  •  ')}</span>
              </div>
              <CloseButton onClick={() => close()} />
            </div>
            <div style={{ height: 24 }} />
            {state === 'hidden' ? (
              <ActionButton label="Ripristina nel catalogo" subtitle="Mostra nuovamente questo titolo" icon="check" accent="var(--like)" onClick={() => changed(() => removeEntry(media))} />
            ) : (
              <>
                {listed && (
                  <ActionButton label={entry?.pinned ? 'Rimuovi dai fissati' : 'Fissa in cima alla home'}
                    subtitle={entry?.pinned ? 'Il titolo non resterà più in cima alla lista' : 'Il titolo comparirà in cima alle sezioni della home e della libreria'}
                    icon="pushPin" accent="var(--secondary)" onClick={() => changed(() => saveEntry(lib.togglePinned(entryOf(media))))} />
                )}
                {isSeries(media) ? (
                  state === 'watched' ? (
                    <>
                      <ActionButton label="Cambia voto" subtitle="Aggiorna il tuo giudizio sulla serie" icon="thumbUp" accent="var(--like)"
                        onClick={() => setPendingReaction(() => (liked: boolean) => changed(() => saveEntry(lib.setLiked(entryOf(media), liked))))} />
                      <ActionButton label="Ricomincia dal primo episodio" subtitle="Azzera il progresso della serie" icon="play" accent="#62C8D7"
                        onClick={() => changed(() => saveEntry(lib.restart(entryOf(media), media)))} />
                    </>
                  ) : (
                    <>
                      <ActionButton label={state === 'progress' ? 'Rimuovi dalla mia lista' : 'Aggiungi alla mia lista'}
                        subtitle={state === 'progress' ? 'Il titolo verrà rimosso dalla tua lista' : 'Salvalo per guardarlo più tardi'}
                        icon={state === 'progress' ? 'check' : 'add'} accent="var(--secondary)"
                        onClick={() => changed(() => (state === 'progress' ? removeEntry(media) : saveEntry(lib.save(entryOf(media), media))))} />
                      {entry && (
                        <ActionButton label={`Segna S${entry.nextSeason} · E${entry.nextEpisode} come visto`} subtitle="Aggiorna il tuo progresso" icon="check" accent="var(--like)"
                          onClick={() => void seasonsThen((seasons) => {
                            const all = lib.flatten(seasons)
                            const next = all.find((e) => e.season === entry.nextSeason && e.number === entry.nextEpisode)
                            if (!next) return
                            if (next === all[all.length - 1]) setPendingReaction(() => (liked: boolean) => changed(() => saveEntry(lib.markEpisode(entryOf(media), media, next, seasons, liked))))
                            else changed(() => saveEntry(lib.markEpisode(entryOf(media), media, next, seasons, null)))
                          })} />
                      )}
                      <ActionButton label="Segna tutta la serie come vista" subtitle="Tutti gli episodi verranno segnati come visti" icon="tv" accent="#E273C6"
                        onClick={() => setPendingReaction(() => (liked: boolean) => void seasonsThen((seasons) => changed(() => saveEntry(lib.completeSeries(entryOf(media), media, seasons, liked)))))} />
                    </>
                  )
                ) : (
                  <>
                    {state !== 'watched' && (
                      <ActionButton label={state === 'saved' ? 'Rimuovi dalla mia lista' : 'Aggiungi alla mia lista'}
                        subtitle={state === 'saved' ? 'Il film verrà rimosso dalla tua lista' : 'Salvalo per guardarlo più tardi'}
                        icon={state === 'saved' ? 'check' : 'add'} accent="var(--secondary)"
                        onClick={() => changed(() => (state === 'saved' ? removeEntry(media) : saveEntry(lib.save(entryOf(media), media))))} />
                    )}
                    <ActionButton label={state === 'watched' ? 'Rimetti nella mia lista' : 'Segna come visto'}
                      subtitle={state === 'watched' ? 'Il film tornerà tra i titoli da vedere' : 'Completa il film e lascia il tuo voto'} icon="check" accent="var(--like)"
                      onClick={() => {
                        if (state === 'watched') changed(() => saveEntry(lib.markMovieUnwatched(entryOf(media), media)))
                        else setPendingReaction(() => (liked: boolean) => changed(() => saveEntry(lib.watched(entryOf(media), media, liked))))
                      }} />
                    {state === 'watched' && (
                      <ActionButton label="Cambia voto" subtitle="Aggiorna il tuo giudizio sul film" icon="thumbUp" accent="var(--like)"
                        onClick={() => setPendingReaction(() => (liked: boolean) => changed(() => saveEntry(lib.setLiked(entryOf(media), liked))))} />
                    )}
                  </>
                )}
                <ActionButton label={followed ? 'Non seguire più' : 'Segui le uscite'}
                  subtitle={followed ? 'Non riceverai più notifiche per questo titolo' : isSeries(media) ? 'Ricevi una notifica a ogni nuovo episodio' : 'Ricevi una notifica all’uscita e all’arrivo in streaming'}
                  icon={followed ? 'notifications' : 'notificationsNone'} accent="var(--amber)" onClick={() => changed(() => toggleFollow(media, null))} />
                <ActionButton label="Non mi interessa" subtitle="Suggeriremo meno contenuti simili" icon="visibilityOff" accent="var(--error)" destructive onClick={() => setConfirmHide(true)} />
              </>
            )}
            <AlertDialog open={confirmHide} onDismiss={() => setConfirmHide(false)} title="Non ti interessa?" text="Questo titolo verrà nascosto dal catalogo e dalle proposte."
              confirm={{ label: 'Nascondi', onClick: () => { setConfirmHide(false); changed(() => saveEntry(lib.hide(entryOf(media), media))) } }}
              dismiss={{ label: 'Annulla', onClick: () => setConfirmHide(false) }} />
            <ReactionDialog open={pendingReaction != null} title={media.title} alreadyWatched={state === 'watched'} onDismiss={() => setPendingReaction(null)}
              onChoice={(liked) => { pendingReaction?.(liked); setPendingReaction(null) }} />
          </div>
        )
      }}
    </BottomSheet>
  )
}
