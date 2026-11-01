import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { dateParts, formatDate, MONTHS, plusDays, romeClock, romeStartOfDay, romeTime, today as romeToday, WEEKDAYS_SHORT } from '../../../shared/dates.ts'
import { isSeries, programmeKey, programmeSearchTitle, type Media, type Programme } from '../../../shared/model.ts'
import { tween } from '../components/motion.ts'
import { AlertDialog, Dialog, toast } from '../components/Overlay.tsx'
import {
  alpha, AnimatedCount, brand, C, FilledButton, FilterChip, GlassIconButton, Icon, LoadingSkeleton, MetaPill, OutlinedField, Pressable, PulsingDot,
  RemoteImage, Reveal, SegmentedPills, Spinner, TextButton,
} from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import { close, open, setGuideDate, setTabChrome, useNav } from '../lib/nav.ts'
import { enablePush } from '../lib/push.ts'
import { cancelReminder, saveReminder, useData, useStore } from '../lib/store.ts'
import { attempt, tmdb } from '../lib/tmdb.ts'
import { openMedia, rating } from '../lib/ui.ts'

type Guide = { programmes: Programme[]; dates: string[]; cached: boolean; updatedAt: number; logos: Record<string, string> }

const CHANNEL_ORDER = ['Rai 1', 'Rai 2', 'Rai 3', 'Rete 4', 'Canale 5', 'Italia 1', 'La7', 'TV8', 'Nove', '20', 'Rai 4', 'Iris', 'Rai 5', 'Rai Movie', 'Rai Premium', 'Cielo', 'Twentyseven', 'La 5', 'Real Time', 'Mediaset Extra', 'Italia 2', 'Giallo', 'Top Crime', 'Cine34', 'Warner TV', 'La7 Cinema', 'Boing', 'Cartoonito', 'Rai Gulp', 'Rai Yoyo', 'K2', 'Frisbee', 'Super!']
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 20, 21, 22, 23, 24, 25, 26, 27, 30, 31, 55, 66, 38, 39, 34, 37, 29, 40, 46, 42, 43, 41, 44, 47]
export const channelNumber = (name: string) => { const i = CHANNEL_ORDER.indexOf(name); return i >= 0 ? NUMBERS[i] : Number.MAX_SAFE_INTEGER }

let guideCache: Guide | null = null

const onAir = (p: Programme, now: number) => now >= p.start && now < p.end
function forDate(guide: Guide, date: string): Programme[] {
  const from = romeStartOfDay(date), until = romeStartOfDay(plusDays(date, 1))
  return guide.programmes.filter((p) => p.start >= from && p.start < until)
}

export function GuideScreen() {
  const requested = useNav((s) => s.guideDate)
  const request = useNav((s) => s.guideRequest)
  const date = requested || romeToday()
  const [now, setNow] = useState(Date.now())
  const today = romeClock(now).date
  const [guide, setGuide] = useState<Guide | null>(guideCache)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const [type, setType] = useState('all')
  const [channel, setChannel] = useState<string | null>(null)
  const [liveOnly, setLiveOnly] = useState(false)
  const [channelMenu, setChannelMenu] = useState(false)
  const [calendar, setCalendar] = useState(false)
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id) }, [])
  useEffect(() => {
    setLoading(true)
    setFailed(false)
    void api<Guide>(`/api/guide${reload > 0 ? '?force=1' : ''}`).then((g) => { guideCache = g; setGuide(g) }, () => setFailed(true)).finally(() => setLoading(false))
  }, [reload])
  useEffect(() => { setLiveOnly(false) }, [date])
  useEffect(() => () => setTabChrome(true), [])
  const day = guide ? forDate(guide, date) : []
  const channels = [...new Set(day.map((p) => p.channel))].sort((a, b) => channelNumber(a) - channelNumber(b))
  const rows = day.filter((p) => p.end > now && (type === 'all' || p.type === type) && (channel == null || p.channel === channel) && (!liveOnly || onAir(p, now)))
  const days = [...new Set([...(guide?.dates ?? Array.from({ length: 8 }, (_, i) => plusDays(today, i - 1))), date])].sort()
  useEffect(() => {
    const index = days.indexOf(date)
    const el = strip.current?.children[Math.max(0, index - 1)] as HTMLElement | undefined
    if (el && strip.current) strip.current.scrollTo({ left: el.offsetLeft - 20, behavior: 'smooth' })
  }, [date, days.join(), request])
  const label = (d: string) => (d === today ? 'OGGI' : d === plusDays(today, 1) ? 'DOMANI' : d === plusDays(today, -1) ? 'IERI' : WEEKDAYS_SHORT[dateParts(d).weekday].toUpperCase().slice(0, 3))
  const inGuide = guide?.dates.includes(date) ?? false
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: 'var(--status-top)', paddingBottom: 96 }}>
      <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12, flex: 'none' }}>
        <Reveal style={{ padding: '0 20px', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <PulsingDot color={C.like} size={4} />
              <span style={{ color: C.like, fontSize: 11, fontWeight: 900, letterSpacing: 1.5, marginLeft: 4 }}>IN CHIARO · DIGITALE TERRESTRE</span>
            </div>
            <div className="t-display-small" style={{ color: C.ink }}>Guida TV</div>
          </div>
          <GlassIconButton icon="calendar" label="Scegli il giorno" onClick={() => setCalendar(true)} />
          <div style={{ width: 10 }} />
          <Pressable pressed={0.88} className="glass" onClick={() => { if (!loading) setReload(reload + 1) }} aria-label="Aggiorna guida"
            style={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {loading ? <Spinner size={20} color={C.accent} stroke={2} /> : <Icon name="refresh" size={21} color={C.ink} />}
          </Pressable>
        </Reveal>
        <div ref={strip} className="hscroll" style={{ gap: 8, padding: '0 20px' }}>
          {days.map((d) => {
            const active = d === date
            return (
              <Pressable key={d} pressed={0.9} onClick={() => setGuideDate(d)}
                style={{ width: 62, height: 70, flex: 'none', borderRadius: 20, background: C.raised, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <motion.div initial={false} animate={{ opacity: active ? 1 : 0 }} transition={tween(260)} style={{ position: 'absolute', inset: 0, background: brand }} />
                <span style={{ position: 'relative', color: active ? 'rgba(255,255,255,.9)' : C.muted, fontSize: 11, fontWeight: 900, letterSpacing: 1 }}>{label(d)}</span>
                <span style={{ position: 'relative', color: active ? '#fff' : C.ink, fontSize: 22, fontWeight: 900, lineHeight: '28px' }}>{dateParts(d).day}</span>
              </Pressable>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 20px' }}>
          <SegmentedPills options={['Tutti', 'Film', 'Serie']} selected={['all', 'movie', 'tv'].indexOf(type)} onSelect={(i) => setType(['all', 'movie', 'tv'][i])} height={42} style={{ flex: 1 }} />
          {date === today && (
            <Pressable pressed={0.92} onClick={() => setLiveOnly(!liveOnly)}
              style={{ height: 42, borderRadius: 42, background: liveOnly ? alpha(C.like, 0.22) : C.raised, border: `1px solid ${liveOnly ? C.like : 'rgba(255,255,255,.08)'}`, display: 'flex', alignItems: 'center', padding: '0 14px 0 8px', flex: 'none' }}>
              <PulsingDot color={C.like} size={4} />
              <span style={{ color: liveOnly ? C.like : C.ink, fontWeight: 700, fontSize: 14, marginLeft: 3 }}>Live</span>
            </Pressable>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px' }}>
          <Pressable pressed={0.96} className="glass" onClick={() => setChannelMenu(true)} style={{ flex: 1, height: 40, borderRadius: 40, display: 'flex', alignItems: 'center', padding: '0 14px', minWidth: 0 }}>
            <Icon name="tv" size={18} color={C.accent} />
            <span className="ellipsis" style={{ color: C.ink, fontWeight: 600, fontSize: 14, marginLeft: 8, flex: 1 }}>{channel ? `${channelNumber(channel)} · ${channel}` : 'Tutti i canali'}</span>
            <Icon name="chevron_right" size={18} color={C.muted} style={{ transform: 'rotate(90deg)' }} />
          </Pressable>
          <AnimatedCount value={rows.length}>{(v) => <span style={{ color: C.muted, fontSize: 12, fontWeight: 600, marginLeft: 12 }}>{v} titoli</span>}</AnimatedCount>
        </div>
      </div>
      <div style={{ height: 10, flex: 'none' }} />
      <div style={{ flex: 1, position: 'relative' }}>
        <AnimatePresence initial={false}>
          <motion.div key={`${date}|${type}|${channel ?? ''}-${liveOnly}`} className="scroll" style={{ position: 'absolute', inset: 0, padding: '0 16px 36px' }}
            initial={{ opacity: 0, y: '5.5%' }} animate={{ opacity: 1, y: 0, transition: { opacity: tween(220), y: tween(300) } }} exit={{ opacity: 0, transition: tween(140) }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(failed || guide?.cached) && (
                <div style={{ background: C.raised, borderRadius: 18, padding: 16 }}>
                  <div style={{ color: C.muted }}>{!guide ? 'La guida non è disponibile. Controlla la connessione e riprova.' : 'Stai consultando la guida salvata. Gli orari potrebbero essere cambiati.'}</div>
                  <TextButton onClick={() => setReload(reload + 1)} disabled={loading}>Riprova</TextButton>
                </div>
              )}
              {guide && guide.dates.length > 0 && (
                <div style={{ color: C.muted, fontSize: 11, padding: '0 4px' }}>Palinsesti disponibili: {formatDate(guide.dates[0], 'd MMM')} – {formatDate(guide.dates[guide.dates.length - 1], 'd MMM')}</div>
              )}
              {!loading && guide && rows.length === 0 && (
                <div style={{ background: C.panel, borderRadius: 26, padding: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
                  <Icon name="tv_guide" size={38} color={C.accent} />
                  <div style={{ color: C.ink, fontWeight: 700 }}>{!inGuide ? 'Palinsesto non disponibile per questo giorno' : date < today ? 'Le trasmissioni di questo giorno sono terminate' : liveOnly ? 'Nessun titolo in onda adesso' : 'Nessun titolo con questi filtri'}</div>
                  <div style={{ color: C.muted }}>{!inGuide ? 'La guida pubblica copre solo i giorni indicati sopra. Scegli un’altra data dal calendario.' : 'Prova un altro canale o passa a Tutti.'}</div>
                  <TextButton onClick={() => { if (!inGuide) setCalendar(true); else { setType('all'); setChannel(null); setLiveOnly(false) } }}>{!inGuide ? 'Scegli giorno' : 'Mostra tutti'}</TextButton>
                </div>
              )}
              {rows.map((p) => <ProgrammeCard key={programmeKey(p)} programme={p} date={date} now={now} />)}
              {guide && <div style={{ color: C.muted, fontSize: 11, padding: '12px 4px', whiteSpace: 'pre-line' }}>{'Guida EPGShare01 · principali canali nazionali\nOrari italiani · la programmazione può variare'}</div>}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <Dialog open={channelMenu} onDismiss={() => setChannelMenu(false)}>
        <div style={{ background: C.panel, borderRadius: 28, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1, color: C.ink, fontSize: 22, fontWeight: 700 }}>Scegli canale</div>
            <TextButton onClick={() => setChannelMenu(false)}>Chiudi</TextButton>
          </div>
          <div className="scroll" style={{ maxHeight: 480, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <FilterChip selected={channel == null} label="Tutti i canali" onClick={() => { setChannel(null); setChannelMenu(false) }} style={{ width: '100%' }} />
            {channels.map((name) => (
              <div key={name} onClick={() => { setChannel(name); setChannelMenu(false) }}
                style={{ borderRadius: 16, background: channel === name ? alpha(C.primary, 0.22) : C.raised, padding: 12, display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 'none' }}>
                <span style={{ width: 32, color: C.accent, fontWeight: 700 }}>{channelNumber(name)}</span>
                <RemoteImage url={guide?.logos[name] ?? ''} fit="contain" fallbackIcon="tv" backgroundColor={name.startsWith('Rai ') ? '#fff' : C.raised} style={{ width: 56, height: 36, borderRadius: 8, flex: 'none' }} />
                <span style={{ flex: 1, marginLeft: 12, color: C.ink, fontWeight: 600 }}>{name}</span>
                <Radio checked={channel === name} />
              </div>
            ))}
          </div>
        </div>
      </Dialog>
      <DatePickerDialog open={calendar} initial={date} onDismiss={() => setCalendar(false)} onPick={(d) => { setGuideDate(d); setCalendar(false) }} />
    </div>
  )
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <div style={{ width: 20, height: 20, margin: 10, borderRadius: '50%', border: `2px solid ${checked ? C.primary : C.muted}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      {checked && <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.primary }} />}
    </div>
  )
}

function ProgrammeCard({ programme: p, date, now }: { programme: Programme; date: string; now: number }) {
  const live = onAir(p, now)
  const startDay = romeClock(p.start).date, endDay = romeClock(p.end).date
  const progress = Math.min(1, Math.max(0, (now - p.start) / Math.max(1000, p.end - p.start)))
  const glassStyle = live ? { background: `linear-gradient(135deg, #12291F, ${C.surface})`, border: `1px solid ${alpha(C.like, 0.5)}` } : {}
  return (
    <motion.div layout transition={tween(300)}>
      <Pressable onClick={(rect) => { setTabChrome(true); open({ kind: 'programme', programme: p }, { rect, corner: 24 }) }} className={live ? undefined : 'glass'}
        style={{ borderRadius: 24, padding: 12, display: 'flex', alignItems: 'center', ...glassStyle }}>
        <div style={{ width: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' }}>
          <span style={{ color: live ? C.like : C.ink, fontWeight: 900, fontSize: 17 }}>{romeTime(p.start)}</span>
          <div style={{ margin: '4px 0', width: 2, height: 18, borderRadius: 2, background: live ? alpha(C.like, 0.5) : C.outline }} />
          <span style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>{romeTime(p.end)}</span>
        </div>
        <div style={{ marginLeft: 10, width: 76, height: 104, borderRadius: 16, background: C.raised, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', position: 'relative' }}>
          {p.image ? <RemoteImage url={p.image} fallbackIcon={p.type === 'movie' ? 'movie' : 'tv'} style={{ position: 'absolute', inset: 0 }} /> : <Icon name={p.type === 'movie' ? 'movie' : 'tv'} size={32} color={C.accent} />}
        </div>
        <div style={{ flex: 1, marginLeft: 14, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <span className="ellipsis" style={{ color: C.accent, fontWeight: 700, fontSize: 12, lineHeight: '16px' }}>{p.channel}</span>
            {live && <><div style={{ marginLeft: 6 }}><PulsingDot color={C.like} size={4} /></div><span style={{ color: C.like, fontSize: 10, fontWeight: 900, letterSpacing: 1, marginLeft: 2 }}>IN ONDA</span></>}
          </div>
          <div className="clamp2" style={{ color: C.ink, fontWeight: 800, fontSize: 16, lineHeight: '22px' }}>{p.title}</div>
          <div className="ellipsis" style={{ color: C.muted, fontSize: 12, lineHeight: '16px' }}>
            {(p.type === 'movie' ? 'Film' : `Serie TV${p.episode.trim() ? ' · ' + p.episode : ''}`) + (startDay < date ? ' · iniziato ieri' : endDay > date ? ' · fino a domani' : '')}
          </div>
          {live && (
            <div style={{ marginTop: 4, height: 4, borderRadius: 4, background: C.raised, overflow: 'hidden' }}>
              <motion.div initial={false} animate={{ width: `${progress * 100}%` }} transition={tween(500)} style={{ height: '100%', borderRadius: 4, background: `linear-gradient(90deg, ${alpha(C.like, 0.6)}, ${C.like})` }} />
            </div>
          )}
        </div>
      </Pressable>
    </motion.div>
  )
}

const normalized = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** TvGuideRepository.recognize: the one TMDB title of the same type with exactly this name. */
function recognize(p: Programme, results: Media[]): Media | null {
  const title = normalized(programmeSearchTitle(p))
  let found: Media | null = null
  for (const m of results) {
    if (m.mediaType === p.type && (normalized(m.title) === title || normalized(m.originalTitle) === title)) {
      if (found && found.id !== m.id) return null
      found = m
    }
  }
  return found
}

export function ProgrammePage({ pageKey, programme: p }: { pageKey: number; programme: Programme }) {
  const [recognized, setRecognized] = useState<Media | null>(null)
  const [recognizing, setRecognizing] = useState(true)
  const hero = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void (async () => {
      const match = recognize(p, await attempt(() => tmdb.searchTitles(programmeSearchTitle(p), null), []))
      setRecognized(match ? await attempt(() => tmdb.details(match), match) : null)
      setRecognizing(false)
    })()
  }, [programmeKey(p)])
  const image = (recognized && (recognized.backdrop || recognized.poster)) || p.image
  const openDetail = () => { if (recognized) openMedia(recognized, { rect: hero.current?.getBoundingClientRect() ?? null, url: image, corner: 26 }) }
  const start = p.start
  const dayLabel = formatDate(romeClock(start).date, 'EEEE d MMMM')
  return (
    <div className="scroll" style={{ position: 'absolute', inset: 0, background: C.bg, padding: 'calc(var(--status-top) + 8px) 20px 40px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <GlassIconButton icon="back" label="Indietro" onClick={() => close(pageKey)} />
          <div style={{ marginLeft: 14 }}>
            <div style={{ color: C.ink, fontWeight: 800, fontSize: 17 }}>{p.channel}</div>
            <div style={{ color: C.muted, fontSize: 12 }}>Canale {channelNumber(p.channel)} · Guida TV</div>
          </div>
        </div>
        <Reveal distance={16} style={{ position: 'relative' }}>
          {recognizing && !image ? <LoadingSkeleton style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 26 }} /> : (
            <div ref={hero} onClick={recognized ? openDetail : undefined} style={{ cursor: recognized ? 'pointer' : 'default' }}>
              <RemoteImage url={image} fallbackIcon={p.type === 'movie' ? 'movie' : 'tv'} animatedPlaceholder style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 26 }} />
            </div>
          )}
          {onAir(p, Date.now()) && (
            <div style={{ position: 'absolute', top: 12, left: 12, borderRadius: 40, background: 'rgba(0,0,0,.6)', padding: '3px 10px 3px 4px', display: 'flex', alignItems: 'center' }}>
              <PulsingDot color={C.like} size={4} /><span style={{ color: C.like, fontSize: 11, fontWeight: 900, letterSpacing: 1 }}>IN ONDA</span>
            </div>
          )}
        </Reveal>
        <Reveal delay={60} distance={16}>
          <div style={{ color: C.accent, fontSize: 11, fontWeight: 900, letterSpacing: 1.6 }}>{p.type === 'movie' ? 'FILM' : 'SERIE TV'}</div>
          <div className="t-headline-medium" style={{ color: C.ink, marginTop: 4 }}>{recognized?.title ?? p.title}</div>
          {recognizing ? <LoadingSkeleton style={{ marginTop: 10, width: 140, height: 22, borderRadius: 22 }} /> : (
            <div className="hscroll" style={{ gap: 7, marginTop: 10 }}>
              <MetaPill text={`${romeTime(p.start)} – ${romeTime(p.end)}`} tint={C.accent} background={alpha(C.accent, 0.14)} style={{ flex: 'none' }} />
              <MetaPill text={dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)} background={C.raised} style={{ flex: 'none' }} />
              {recognized && <MetaPill text={recognized.year} background={C.raised} style={{ flex: 'none' }} />}
              {recognized && recognized.rating > 0 && <MetaPill text={rating(recognized.rating)} icon="star" tint={C.amber} background={alpha(C.amber, 0.14)} style={{ flex: 'none' }} />}
            </div>
          )}
        </Reveal>
        {recognized && (
          <Pressable pressed={0.97} className="brand-glow" onClick={openDetail} style={{ height: 54, borderRadius: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', ['--glow-blur' as string]: '10px' }}>
            <Icon name={isSeries(recognized) ? 'tv' : 'movie'} size={20} style={{ position: 'relative' }} />
            <span style={{ marginLeft: 9, fontWeight: 700, fontSize: 14, position: 'relative' }}>Apri la scheda {isSeries(recognized) ? 'della serie' : 'del film'}</span>
          </Pressable>
        )}
        <ProgrammeReminder programme={p} />
        {p.episode.trim() && <div style={{ color: C.muted }}>{p.episode}</div>}
        {p.subtitle.trim() && <div style={{ color: C.ink, fontWeight: 700 }}>{p.subtitle}</div>}
        {recognizing && !p.description.trim() ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[1, 0.95, 0.7].map((w) => <LoadingSkeleton key={w} style={{ width: `${w * 100}%`, height: 16, borderRadius: 6 }} />)}</div>
        ) : (
          <div>
            <div className="t-title-large" style={{ color: C.ink }}>Trama</div>
            <div style={{ color: C.muted, fontSize: 16, lineHeight: '24px', marginTop: 8 }}>{p.description.trim() || recognized?.overview || 'Trama non disponibile nella guida.'}</div>
          </div>
        )}
      </div>
    </div>
  )
}

/** TvProgrammeReminder: the server sends the push at the chosen time, like the exact alarm did. */
function ProgrammeReminder({ programme: p }: { programme: Programme }) {
  const data = useData()
  const permission = useStore((s) => s.settings.remindersEnabled)
  const key = programmeKey(p)
  const saved = data.reminders.find((r) => r.key === key)?.minutes ?? -1
  const [dialog, setDialog] = useState(false)
  const [minutes, setMinutes] = useState(saved > 0 ? String(saved) : '15')
  const [message, setMessage] = useState<string | null>(null)
  const [clock, setClock] = useState(Date.now())
  useEffect(() => { const id = window.setInterval(() => setClock(Date.now()), 15_000); return () => window.clearInterval(id) }, [])
  const before = clock < p.start
  const activate = async () => {
    const value = /^\d+$/.test(minutes) ? Number(minutes) : NaN
    if (!(value >= 1 && value <= 1440)) { setMessage('Inserisci un numero da 1 a 1440.'); return }
    if (p.start - value * 60_000 <= Date.now()) { setMessage('Questo orario è già passato. Scegli un anticipo più breve.'); return }
    if (!permission && !(await enablePush())) { setMessage('Per ricevere il promemoria abilita le notifiche: apri StreamWise in HTTPS, installala come app e consenti le notifiche.'); return }
    try {
      await saveReminder(p, value)
      setDialog(false)
    } catch (e) {
      setMessage((e as Error).message || 'Impossibile attivare il promemoria.')
    }
  }
  return (
    <div style={{ background: C.raised, borderRadius: 24, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ color: C.ink, fontWeight: 700, fontSize: 18 }}>Promemoria</div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={saved} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(180)} style={{ color: C.muted }}>
          {saved > 0 ? `Ti avviserò ${saved} minuti prima dell’inizio` : before ? 'Scegli quanto prima ricevere una notifica' : 'La trasmissione è già iniziata'}
        </motion.div>
      </AnimatePresence>
      <div style={{ display: 'flex' }}>
        {before && <FilledButton onClick={() => { setDialog(true); setMessage(null) }}>{saved > 0 ? 'Modifica' : 'Avvisami'}</FilledButton>}
        {saved > 0 && <TextButton onClick={() => void cancelReminder(key).catch(() => toast('Rimozione non riuscita'))}>Rimuovi</TextButton>}
      </div>
      <AlertDialog open={dialog} onDismiss={() => setDialog(false)} title="Quando ti avviso?"
        text={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>Prima di {p.title}</div>
            <div className="hscroll" style={{ gap: 6 }}>
              {[5, 10, 15, 30, 60].map((v) => <FilterChip key={v} selected={minutes === String(v)} label={`${v} min`} onClick={() => { setMinutes(String(v)); setMessage(null) }} />)}
            </div>
            <OutlinedField value={minutes} onChange={(v) => { setMinutes(v.replace(/\D/g, '').slice(0, 4)); setMessage(null) }} label="Minuti prima (1–1440)" inputMode="numeric" />
            {message && <div style={{ color: C.accent }}>{message}</div>}
          </div>
        }
        dismiss={<TextButton onClick={() => setDialog(false)}>Annulla</TextButton>}
        confirm={<TextButton onClick={() => void activate()}>Attiva</TextButton>} />
    </div>
  )
}

// --- DatePicker (M3) -------------------------------------------------------------------------------

function DatePickerDialog({ open: visible, initial, onDismiss, onPick }: { open: boolean; initial: string; onDismiss: () => void; onPick: (d: string) => void }) {
  const [selected, setSelected] = useState(initial)
  const [month, setMonth] = useState(initial.slice(0, 7))
  useEffect(() => { if (visible) { setSelected(initial); setMonth(initial.slice(0, 7)) } }, [visible])
  const first = `${month}-01`
  const { weekday } = dateParts(first)
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const shift = (delta: number) => { const d = new Date(Date.UTC(y, m - 1 + delta, 1)); setMonth(d.toISOString().slice(0, 7)) }
  const today = romeToday()
  return (
    <Dialog open={visible} onDismiss={onDismiss} width="min(360px, calc(100vw - 32px))">
      <div style={{ background: '#1A1D26', borderRadius: 28, padding: '16px 12px 12px' }}>
        <div style={{ color: C.muted, fontSize: 14, padding: '0 12px' }}>Scegli il giorno</div>
        <div className="t-headline-large" style={{ color: C.ink, padding: '12px 12px 16px', fontWeight: 400, letterSpacing: 0 }}>{formatDate(selected, 'EEE d MMM')}</div>
        <div style={{ height: 1, background: C.outline }} />
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 4px' }}>
          <span style={{ flex: 1, color: C.muted, fontWeight: 500, fontSize: 14, paddingLeft: 12 }}>{MONTHS[m - 1]} {y}</span>
          <Pressable onClick={() => shift(-1)} style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="chevron_right" color={C.muted} style={{ transform: 'rotate(180deg)' }} /></Pressable>
          <Pressable onClick={() => shift(1)} style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="chevron_right" color={C.muted} /></Pressable>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', rowGap: 4 }}>
          {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, i) => <div key={i} style={{ color: C.ink, fontSize: 14, height: 40, lineHeight: '40px' }}>{d}</div>)}
          {Array.from({ length: weekday }, (_, i) => <div key={'e' + i} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const iso = `${month}-${String(i + 1).padStart(2, '0')}`
            const on = iso === selected
            return (
              <div key={iso} onClick={() => setSelected(iso)} style={{ display: 'flex', justifyContent: 'center', cursor: 'pointer' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', lineHeight: '38px', fontSize: 14, background: on ? C.primary : 'transparent', color: on ? '#fff' : iso === today ? C.primary : C.ink, border: iso === today && !on ? `1px solid ${C.primary}` : '1px solid transparent' }}>{i + 1}</div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8 }}>
          <TextButton onClick={onDismiss}>Annulla</TextButton>
          <TextButton onClick={() => onPick(selected)}>Scegli</TextButton>
        </div>
      </div>
    </Dialog>
  )
}
