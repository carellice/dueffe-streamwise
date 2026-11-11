// TvGuideScreen, TvGuideProgrammeCard, TvGuideProgrammePage and TvProgrammeReminder of MainActivity.kt.
// The guide is downloaded and parsed by the server (GET /api/guide?date=); reminders are Web Push.
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Media } from '../../../shared/model.ts'
import { isSeries } from '../../../shared/model.ts'
import { channelNumber, onAir, programmeKey, recognize, searchTitle, type GuideDay, type Programme } from '../../../shared/guide.ts'
import { dateRome, formatIt, plusDays, timeRome, todayRome, MONTHS } from '../../../shared/dates.ts'
import { api, ApiError } from '../lib/api.ts'
import { useBackHandler } from '../lib/back.ts'
import { deleteReminder, reminders, saveReminder, useStore } from '../lib/store.ts'
import { enablePush, notificationsAllowed } from '../lib/push.ts'
import { addToCalendar } from '../lib/calendar.ts'
import { tmdb } from '../lib/tmdb.ts'
import { spring, tween } from '../components/motion.ts'
import { Dialog, DialogButton } from '../components/overlay.tsx'
import { ExpandingPage } from '../components/Transform.tsx'
import { AnimatedCount, GlassIconButton, Icon, LoadingSkeleton, MetaPill, Press, PulsingDot, RemoteImage, Reveal, SegmentedPills, Spinner, boundsOf, rating, type Rect } from '../components/ui.tsx'
import { artSource, type OpenMedia } from '../components/cards.tsx'
import { FilterChip } from '../lib/subscriptions.tsx'
import { OutlinedField } from './Ai.tsx'

function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), interval)
    return () => window.clearInterval(id)
  }, [interval])
  return now
}

/** M3 DatePicker in a dialog: month grid, selected day filled with the primary color. */
function DatePickerDialog({ open, initial, onDismiss, onPick }: { open: boolean; initial: string; onDismiss: () => void; onPick: (date: string) => void }) {
  const [selected, setSelected] = useState(initial)
  const [month, setMonth] = useState(initial.slice(0, 7))
  useEffect(() => { if (open) { setSelected(initial); setMonth(initial.slice(0, 7)) } }, [open])
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const offset = (first.getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const today = todayRome()
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return (
    <Dialog open={open} onDismiss={onDismiss} style={{ maxWidth: 360 }}>
      <div style={{ background: 'var(--surface-high)', borderRadius: 28, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px 12px' }}>
          <div style={{ color: 'var(--muted)', fontSize: 14, fontWeight: 700 }}>Scegli il giorno</div>
          <div style={{ color: 'var(--ink)', fontSize: 32, lineHeight: '40px', marginTop: 36 }}>{formatIt(selected, 'EEE d MMM').replace(/^./, (c) => c.toUpperCase())}</div>
        </div>
        <div style={{ height: 1, background: 'var(--outline)' }} />
        <div className="row" style={{ padding: '8px 12px 0 24px' }}>
          <span className="grow" style={{ color: 'var(--muted)', fontSize: 14, fontWeight: 700 }}>{MONTHS[m - 1].replace(/^./, (c) => c.toUpperCase())} {y}</span>
          <button className="center" aria-label="Mese precedente" onClick={() => shift(-1)} style={{ width: 48, height: 48 }}><Icon name="chevronRight" color="var(--muted)" style={{ transform: 'rotate(180deg)' }} /></button>
          <button className="center" aria-label="Mese successivo" onClick={() => shift(1)} style={{ width: 48, height: 48 }}><Icon name="chevronRight" color="var(--muted)" /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 12px', textAlign: 'center' }}>
          {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, i) => <span key={i} style={{ color: 'var(--ink)', fontSize: 14, height: 40, lineHeight: '40px' }}>{d}</span>)}
          {Array.from({ length: offset }, (_, i) => <span key={'e' + i} />)}
          {Array.from({ length: days }, (_, i) => {
            const iso = `${month}-${String(i + 1).padStart(2, '0')}`
            const active = iso === selected
            return (
              <div key={iso} className="center" style={{ height: 48 }}>
                <button onClick={() => setSelected(iso)} style={{ width: 40, height: 40, borderRadius: 20, fontSize: 14, background: active ? 'var(--primary)' : 'transparent', color: active ? '#fff' : 'var(--ink)', boxShadow: iso === today && !active ? 'inset 0 0 0 1px var(--primary)' : undefined }}>{i + 1}</button>
              </div>
            )
          })}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', padding: '8px 12px 12px', gap: 8 }}>
          <DialogButton onClick={onDismiss}>Annulla</DialogButton>
          <DialogButton onClick={() => onPick(selected)}>Scegli</DialogButton>
        </div>
      </div>
    </Dialog>
  )
}

function ProgrammeCard({ programme, date, now, onOpen }: { programme: Programme; date: string; now: number; onOpen: (rect: Rect | null) => void }) {
  const live = onAir(programme, now)
  const startDate = dateRome(programme.start)
  const endDate = dateRome(programme.end)
  const progress = Math.min(1, Math.max(0, (now - programme.start) / Math.max(1000, programme.end - programme.start)))
  const kind = programme.type === 'movie' ? 'Film' : `Serie TV${programme.episode.trim() ? ' · ' + programme.episode : ''}`
  return (
    <Press pressed={0.98} onClick={(el) => onOpen(boundsOf(el))} className={'row ' + (live ? '' : 'glass')}
      style={{ borderRadius: 24, padding: 12, ...(live ? { background: 'linear-gradient(135deg, #12291F, var(--surface))', boxShadow: 'inset 0 0 0 1px rgba(61,220,151,.5)' } : {}) }}>
      <div className="col" style={{ width: 52, alignItems: 'center', flex: 'none' }}>
        <span style={{ color: live ? 'var(--like)' : 'var(--ink)', fontWeight: 900, fontSize: 17 }}>{timeRome(programme.start)}</span>
        <div style={{ margin: '4px 0', width: 2, height: 18, borderRadius: 1, background: live ? 'rgba(61,220,151,.5)' : 'var(--outline)' }} />
        <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>{timeRome(programme.end)}</span>
      </div>
      <div className="center" style={{ marginLeft: 10, width: 76, height: 104, borderRadius: 16, background: 'var(--raised)', overflow: 'hidden', flex: 'none' }}>
        {programme.image.trim() !== '' ? <RemoteImage url={programme.image} fallbackIcon={programme.type === 'movie' ? 'movie' : 'tv'} style={{ width: '100%', height: '100%' }} />
          : <Icon name={programme.type === 'movie' ? 'movie' : 'tv'} size={32} color="var(--secondary)" />}
      </div>
      <div className="grow col" style={{ paddingLeft: 14, gap: 5 }}>
        <div className="row">
          <span className="ellipsis" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 12, lineHeight: '16px' }}>{programme.channel}</span>
          {live && (
            <>
              <PulsingDot color="var(--like)" size={4} style={{ marginLeft: 6 }} />
              <span style={{ color: 'var(--like)', fontSize: 10, fontWeight: 900, letterSpacing: 1, marginLeft: 2, lineHeight: '14px' }}>IN ONDA</span>
            </>
          )}
        </div>
        <span className="clamp2" style={{ color: 'var(--ink)', fontWeight: 800, fontSize: 16, lineHeight: '22px' }}>{programme.title}</span>
        <span className="ellipsis" style={{ color: 'var(--muted)', fontSize: 12, lineHeight: '16px' }}>{kind}{startDate < date ? ' · iniziato ieri' : endDate > date ? ' · fino a domani' : ''}</span>
        {live && (
          <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: 'var(--raised)', overflow: 'hidden' }}>
            <motion.div initial={false} animate={{ width: `${progress * 100}%` }} transition={tween(500)} style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, rgba(61,220,151,.6), var(--like))' }} />
          </div>
        )}
      </div>
    </Press>
  )
}

function ReminderCard({ programme }: { programme: Programme }) {
  useStore()
  const key = programmeKey(programme)
  const savedReminder = reminders().find((r) => r.key === key)
  const saved = savedReminder?.minutes ?? -1
  const [dialog, setDialog] = useState(false)
  const [minutes, setMinutes] = useState(saved > 0 ? String(saved) : '15')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const clock = useNow(15000)
  const activate = async () => {
    const value = /^\d+$/.test(minutes) ? Number(minutes) : null
    if (value == null || value < 1 || value > 1440) { setMessage('Inserisci un numero da 1 a 1440.'); return }
    if (programme.start - value * 60000 <= Date.now()) { setMessage('Questo orario è già passato. Scegli un anticipo più breve.'); return }
    setBusy(true)
    if (!(await notificationsAllowed()) && !(await enablePush())) {
      setBusy(false)
      setMessage('Per ricevere il promemoria abilita le notifiche: apri StreamWise in HTTPS e installala come app.')
      return
    }
    try {
      await saveReminder({ key, title: programme.title, channel: programme.channel, start: programme.start, end: programme.end, minutes: value })
      setDialog(false)
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Impossibile attivare il promemoria.')
    }
    setBusy(false)
  }
  return (
    <div className="col" style={{ background: 'var(--raised)', borderRadius: 24, padding: 18, gap: 8 }}>
      <span style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 18 }}>Promemoria</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={saved} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={tween(220)} style={{ color: 'var(--muted)' }}>
          {saved > 0 ? `Ti avviserò ${saved} minuti prima dell’inizio` : clock < programme.start ? 'Scegli quanto prima ricevere una notifica' : 'La trasmissione è già iniziata'}
        </motion.span>
      </AnimatePresence>
      <div className="row" style={{ gap: 8 }}>
        {clock < programme.start && (
          <Press pressed={0.96} onClick={() => { setDialog(true); setMessage(null) }} className="center" style={{ height: 40, borderRadius: 20, padding: '0 24px', background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 700 }}>
            {saved > 0 ? 'Modifica' : 'Avvisami'}
          </Press>
        )}
        {saved > 0 && <DialogButton onClick={() => void deleteReminder(key)}>Rimuovi</DialogButton>}
        {clock < programme.end && (
          <DialogButton onClick={() => addToCalendar({
            title: programme.title, description: [programme.episode, programme.description].filter(Boolean).join('\n\n'),
            location: `${programme.channel} (canale ${channelNumber(programme.channel)})`, start: programme.start, end: programme.end,
          })}><span className="row" style={{ gap: 5 }}><Icon name="calendar" size={17} /> Calendario</span></DialogButton>
        )}
      </div>
      <Dialog open={dialog} onDismiss={() => setDialog(false)} style={{ maxWidth: 360 }}>
        <div style={{ background: 'var(--surface-high)', borderRadius: 28, padding: 24 }}>
          <div className="t-headline-small" style={{ color: 'var(--ink)', fontWeight: 400, letterSpacing: 0 }}>Quando ti avviso?</div>
          <div className="col t-body-medium" style={{ color: 'var(--muted)', marginTop: 16, gap: 12 }}>
            <span>Prima di {programme.title}</span>
            <div className="hscroll row" style={{ gap: 6 }}>
              {[5, 10, 15, 30, 60].map((v) => <FilterChip key={v} selected={minutes === String(v)} onClick={() => { setMinutes(String(v)); setMessage(null) }}>{v} min</FilterChip>)}
            </div>
            <OutlinedField label="Minuti prima (1–1440)" value={minutes} onChange={(v) => { setMinutes(v.replace(/\D/g, '').slice(0, 4)); setMessage(null) }} style={{ background: 'var(--surface-high)' }} />
            {message && <span style={{ color: 'var(--secondary)' }}>{message}</span>}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 24, gap: 8 }}>
            <DialogButton onClick={() => setDialog(false)}>Annulla</DialogButton>
            <DialogButton onClick={() => void activate()} disabled={busy}>Attiva</DialogButton>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function ProgrammePage({ programme, onDismiss, onOpen }: { programme: Programme; onDismiss: () => void; onOpen: OpenMedia }) {
  const [recognized, setRecognized] = useState<Media | null>(null)
  const [recognizing, setRecognizing] = useState(true)
  const hero = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const match = recognize(programme, await tmdb.searchTitles(searchTitle(programme), null))
        const detailed = match ? await tmdb.details(match).catch(() => match) : null
        if (alive) setRecognized(detailed)
      } catch { /* not recognized */ }
      if (alive) setRecognizing(false)
    })()
    return () => { alive = false }
  }, [programmeKey(programme)])
  const image = (recognized?.backdrop || recognized?.poster || '') || programme.image
  // The hero image is the source the detail page grows out of (and shrinks back into).
  const openDetail = () => { if (recognized) onOpen(recognized, artSource(hero.current, image, 26)) }
  const day = formatIt(dateRome(programme.start), 'EEEE d MMMM')
  return (
    <div className="fill scroll status-pad" style={{ background: 'var(--page)' }}>
      <div className="col" style={{ padding: '8px 20px 40px', gap: 18 }}>
        <div className="row">
          <GlassIconButton icon="back" label="Indietro" onClick={onDismiss} />
          <div className="col" style={{ paddingLeft: 14 }}>
            <span style={{ color: 'var(--ink)', fontWeight: 800, fontSize: 17 }}>{programme.channel}</span>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>Canale {channelNumber(programme.channel)} · Guida TV</span>
          </div>
        </div>
        <Reveal distance={16} style={{ position: 'relative' }}>
          {recognizing && image.trim() === '' ? <LoadingSkeleton style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 26 }} />
            : recognized ? (
              <div ref={hero} onClick={openDetail} style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 26, overflow: 'hidden', cursor: 'pointer' }}>
                <RemoteImage url={image} style={{ width: '100%', height: '100%' }} />
              </div>
            ) : <RemoteImage url={image} animatedPlaceholder fallbackIcon={programme.type === 'movie' ? 'movie' : 'tv'} style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 26 }} />}
          {onAir(programme, Date.now()) && (
            <div className="row" style={{ position: 'absolute', top: 12, left: 12, borderRadius: 999, background: 'rgba(0,0,0,.6)', padding: '3px 10px 3px 4px' }}>
              <PulsingDot color="var(--like)" size={4} />
              <span style={{ color: 'var(--like)', fontSize: 11, fontWeight: 900, letterSpacing: 1, lineHeight: '16px' }}>IN ONDA</span>
            </div>
          )}
        </Reveal>
        <Reveal delay={60} distance={16}>
          <div style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 900, letterSpacing: 1.6, lineHeight: '16px' }}>{programme.type === 'movie' ? 'FILM' : 'SERIE TV'}</div>
          <div className="t-headline-medium" style={{ color: 'var(--ink)', marginTop: 4 }}>{recognized?.title ?? programme.title}</div>
          {recognizing ? <LoadingSkeleton style={{ marginTop: 10, width: 140, height: 22, borderRadius: 11 }} /> : (
            <div className="hscroll row" style={{ marginTop: 10, gap: 7 }}>
              <MetaPill text={`${timeRome(programme.start)} – ${timeRome(programme.end)}`} tint="var(--accent)" background="rgba(255,89,100,.14)" />
              <MetaPill text={day.charAt(0).toUpperCase() + day.slice(1)} background="var(--raised)" />
              {recognized && <MetaPill text={recognized.year} background="var(--raised)" />}
              {recognized && recognized.rating > 0 && <MetaPill text={rating(recognized.rating)} icon="star" tint="var(--amber)" background="rgba(255,194,77,.14)" />}
            </div>
          )}
        </Reveal>
        {recognized && (
          <Press pressed={0.97} onClick={openDetail} className="brand-glow row center" style={{ height: 54, borderRadius: 27, gap: 9, color: '#fff', ['--glow' as string]: '10px' }}>
            <Icon name={isSeries(recognized) ? 'tv' : 'movie'} size={20} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Apri la scheda {isSeries(recognized) ? 'della serie' : 'del film'}</span>
          </Press>
        )}
        <ReminderCard programme={programme} />
        {programme.episode.trim() !== '' && <span style={{ color: 'var(--muted)' }}>{programme.episode}</span>}
        {programme.subtitle.trim() !== '' && <span style={{ color: 'var(--ink)', fontWeight: 700 }}>{programme.subtitle}</span>}
        {recognizing && programme.description.trim() === '' ? (
          <div className="col" style={{ gap: 10 }}>{[1, 0.95, 0.7].map((w) => <LoadingSkeleton key={w} style={{ width: `${w * 100}%`, height: 16, borderRadius: 6 }} />)}</div>
        ) : (
          <div>
            <div className="t-title-large" style={{ color: 'var(--ink)' }}>Trama</div>
            <div style={{ color: 'var(--muted)', fontSize: 16, lineHeight: '24px', marginTop: 8 }}>{programme.description.trim() || recognized?.overview || 'Trama non disponibile nella guida.'}</div>
          </div>
        )}
      </div>
    </div>
  )
}

const guideCache = new Map<string, GuideDay>()

export function TvGuideScreen({ date, onDate, backEnabled, onOpen, onExpandedChange }: { date: string; onDate: (d: string) => void; backEnabled: boolean; onOpen: OpenMedia; onExpandedChange: (v: boolean) => void }) {
  const now = useNow(1000)
  const today = dateRome(now)
  const [guide, setGuide] = useState<GuideDay | null>(guideCache.get(date) ?? null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const [type, setType] = useState('all')
  const [channel, setChannel] = useState<string | null>(null)
  const [liveOnly, setLiveOnly] = useState(false)
  const [channelMenu, setChannelMenu] = useState(false)
  const [calendar, setCalendar] = useState(false)
  const [selected, setSelected] = useState<{ programme: Programme; origin: Rect | null } | null>(null)
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => () => onExpandedChange(false), [])
  useEffect(() => {
    let alive = true
    setLoading(true)
    setFailed(false)
    api<GuideDay>(`/api/guide?date=${date}${reload > 0 ? '&force=1' : ''}`)
      .then((g) => { if (alive) { guideCache.set(date, g); setGuide(g) } })
      .catch(() => { if (alive) { setFailed(true); if (!guideCache.has(date)) setGuide((g) => (g && g.date === date ? g : g ? { ...g, date, programmes: [] } : null)) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [date, reload])
  useEffect(() => { setLiveOnly(false) }, [date])
  const dayProgrammes = guide?.date === date ? guide.programmes : []
  const channels = useMemo(() => [...new Set(dayProgrammes.map((p) => p.channel))].sort((a, b) => channelNumber(a) - channelNumber(b)), [dayProgrammes])
  const visible = dayProgrammes.filter((p) => p.end > now && (type === 'all' || p.type === type) && (channel == null || p.channel === channel) && (!liveOnly || onAir(p, now)))
  const days = useMemo(() => [...new Set([...(guide?.dates ?? Array.from({ length: 8 }, (_, i) => plusDays(today, i - 1))), date])].sort(), [guide?.dates?.join(), date, today])
  useEffect(() => {
    const index = days.indexOf(date)
    const el = strip.current?.children[Math.max(0, index - 1)] as HTMLElement | undefined
    if (el && strip.current) strip.current.scrollTo({ left: el.offsetLeft - 20, behavior: 'smooth' })
  }, [days.join(), date])
  const dates = guide?.dates ?? []
  const inGuide = dates.includes(date)
  const filterKey = `${date}|${type}|${channel ?? ''}-${liveOnly}`
  return (
    <div className="fill col status-pad" style={{ paddingBottom: 96 }}>
      <div className="col" style={{ paddingTop: 14, gap: 12 }}>
        <Reveal id="guide-header" className="row" style={{ padding: '0 20px' }}>
          <div className="grow col">
            <div className="row">
              <PulsingDot color="var(--like)" size={4} />
              <span style={{ color: 'var(--like)', fontSize: 11, fontWeight: 900, letterSpacing: 1.5, marginLeft: 4, lineHeight: '16px' }}>IN CHIARO · DIGITALE TERRESTRE</span>
            </div>
            <span className="t-display-small" style={{ color: 'var(--ink)' }}>Guida TV</span>
          </div>
          <GlassIconButton icon="calendar" label="Scegli il giorno" onClick={() => setCalendar(true)} />
          <Press pressed={0.88} onClick={() => { if (!loading) setReload((r) => r + 1) }} className="glass center" style={{ width: 44, height: 44, borderRadius: '50%', marginLeft: 10, flex: 'none' }}>
            {loading ? <Spinner size={20} stroke={2} color="var(--accent)" /> : <Icon name="refresh" size={21} />}
          </Press>
        </Reveal>
        <div ref={strip} className="hscroll row" style={{ padding: '0 20px', gap: 8 }}>
          {days.map((day) => {
            const active = day === date
            const label = day === today ? 'OGGI' : day === plusDays(today, 1) ? 'DOMANI' : day === plusDays(today, -1) ? 'IERI' : formatIt(day, 'EEE').toUpperCase().slice(0, 3)
            return (
              <Press key={day} pressed={0.9} onClick={() => onDate(day)} className="col center" style={{ width: 62, height: 70, borderRadius: 20, background: 'var(--raised)', flex: 'none', position: 'relative', overflow: 'hidden' }}>
                <motion.div className="fill" initial={false} animate={{ opacity: active ? 1 : 0 }} transition={tween(260)} style={{ background: 'var(--brand)' }} />
                <span style={{ position: 'relative', color: active ? 'rgba(255,255,255,.9)' : 'var(--muted)', fontSize: 11, fontWeight: 900, letterSpacing: 1, lineHeight: '16px' }}>{label}</span>
                <span style={{ position: 'relative', color: active ? '#fff' : 'var(--ink)', fontSize: 22, fontWeight: 900, lineHeight: '28px' }}>{Number(day.slice(8))}</span>
              </Press>
            )
          })}
        </div>
        <div className="row" style={{ padding: '0 20px', gap: 8 }}>
          <SegmentedPills options={['Tutti', 'Film', 'Serie']} selected={['all', 'movie', 'tv'].indexOf(type)} height={42} style={{ flex: 1 }} onSelect={(i) => setType(['all', 'movie', 'tv'][i])} />
          {date === today && (
            <Press pressed={0.92} onClick={() => setLiveOnly(!liveOnly)} className="row"
              style={{ height: 42, borderRadius: 21, padding: '0 14px 0 8px', flex: 'none', background: liveOnly ? 'rgba(61,220,151,.22)' : 'var(--raised)', boxShadow: `inset 0 0 0 1px ${liveOnly ? 'var(--like)' : 'rgba(255,255,255,.08)'}` }}>
              <PulsingDot color="var(--like)" size={4} />
              <span style={{ color: liveOnly ? 'var(--like)' : 'var(--ink)', fontWeight: 700, fontSize: 14, marginLeft: 3 }}>Live</span>
            </Press>
          )}
        </div>
        <div className="row" style={{ padding: '0 20px' }}>
          <Press pressed={0.96} onClick={() => setChannelMenu(true)} className="glass row grow" style={{ height: 40, borderRadius: 20, padding: '0 14px' }}>
            <Icon name="tv" size={18} color="var(--accent)" />
            <span className="grow ellipsis" style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 14, marginLeft: 8 }}>{channel ? `${channelNumber(channel)} · ${channel}` : 'Tutti i canali'}</span>
            <Icon name="chevronRight" size={18} color="var(--muted)" style={{ transform: 'rotate(90deg)' }} />
          </Press>
          <AnimatedCount value={visible.length} render={(n) => <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600, marginLeft: 12 }}>{n} titoli</span>} />
        </div>
      </div>
      <div style={{ height: 10 }} />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={filterKey} className="fill scroll" initial={{ opacity: 0, y: '5%' }} animate={{ opacity: 1, y: 0, transition: { opacity: tween(220), y: spring(1, 1500) } }} exit={{ opacity: 0, transition: tween(140) }}>
            <div className="col" style={{ padding: '0 16px 36px', gap: 12 }}>
              {(failed || guide?.cached) && (
                <div style={{ background: 'var(--raised)', borderRadius: 18, padding: 16 }}>
                  <div style={{ color: 'var(--muted)' }}>{guide == null ? 'La guida non è disponibile. Controlla la connessione e riprova.' : 'Stai consultando la guida salvata. Gli orari potrebbero essere cambiati.'}</div>
                  <DialogButton onClick={() => setReload((r) => r + 1)} disabled={loading}>Riprova</DialogButton>
                </div>
              )}
              {guide && dates.length > 0 && <span style={{ color: 'var(--muted)', fontSize: 11, padding: '0 4px' }}>Palinsesti disponibili: {formatIt(dates[0], 'd MMM')} – {formatIt(dates[dates.length - 1], 'd MMM')}</span>}
              {!loading && guide && visible.length === 0 && (
                <div className="col" style={{ background: 'var(--surface)', borderRadius: 26, padding: 26, alignItems: 'center', gap: 12, textAlign: 'center' }}>
                  <Icon name="tvGuide" size={38} color="var(--secondary)" />
                  <span style={{ color: 'var(--ink)', fontWeight: 700 }}>
                    {!inGuide ? 'Palinsesto non disponibile per questo giorno' : date < today ? 'Le trasmissioni di questo giorno sono terminate' : liveOnly ? 'Nessun titolo in onda adesso' : 'Nessun titolo con questi filtri'}
                  </span>
                  <span style={{ color: 'var(--muted)' }}>{!inGuide ? 'La guida pubblica copre solo i giorni indicati sopra. Scegli un’altra data dal calendario.' : 'Prova un altro canale o passa a Tutti.'}</span>
                  <DialogButton onClick={() => { if (!inGuide) setCalendar(true); else { setType('all'); setChannel(null); setLiveOnly(false) } }}>{!inGuide ? 'Scegli giorno' : 'Mostra tutti'}</DialogButton>
                </div>
              )}
              {visible.map((p) => (
                <motion.div key={programmeKey(p)} layout transition={spring(1, 400)}>
                  <ProgrammeCard programme={p} date={date} now={now} onOpen={(rect) => { onExpandedChange(true); setSelected({ programme: p, origin: rect }) }} />
                </motion.div>
              ))}
              {guide && <span style={{ color: 'var(--muted)', fontSize: 11, padding: '12px 4px', whiteSpace: 'pre-line' }}>{'Guida EPGShare01 · principali canali nazionali\nOrari italiani · la programmazione può variare'}</span>}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <Dialog open={channelMenu} onDismiss={() => setChannelMenu(false)}>
        <div style={{ background: 'var(--surface)', borderRadius: 28, padding: 16 }}>
          <div className="row">
            <span className="grow" style={{ color: 'var(--ink)', fontSize: 22, fontWeight: 700 }}>Scegli canale</span>
            <DialogButton onClick={() => setChannelMenu(false)}>Chiudi</DialogButton>
          </div>
          <div className="scroll col" style={{ maxHeight: 480, gap: 6, marginTop: 8 }}>
            <div className="col"><FilterChip selected={channel == null} onClick={() => { setChannel(null); setChannelMenu(false) }}>Tutti i canali</FilterChip></div>
            {channels.map((name) => (
              <Press key={name} pressed={0.98} onClick={() => { setChannel(name); setChannelMenu(false) }} className="row"
                style={{ borderRadius: 16, padding: 12, background: channel === name ? 'rgba(229,36,58,.22)' : 'var(--raised)', flex: 'none' }}>
                <span style={{ color: 'var(--secondary)', fontWeight: 700, width: 32, flex: 'none' }}>{channelNumber(name)}</span>
                <RemoteImage url={guide?.logos[name] ?? ''} fit="contain" fallbackIcon="tv" background={name.startsWith('Rai ') ? '#fff' : 'var(--raised)'} style={{ width: 56, height: 36, borderRadius: 8, flex: 'none' }} />
                <span className="grow" style={{ color: 'var(--ink)', fontWeight: 600, paddingLeft: 12 }}>{name}</span>
                <div style={{ width: 20, height: 20, borderRadius: '50%', boxShadow: `inset 0 0 0 2px ${channel === name ? 'var(--primary)' : 'var(--muted)'}`, padding: 5, margin: '0 10px', flex: 'none' }}>
                  {channel === name && <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--primary)' }} />}
                </div>
              </Press>
            ))}
          </div>
        </div>
      </Dialog>
      <DatePickerDialog open={calendar} initial={date} onDismiss={() => setCalendar(false)} onPick={(d) => { onDate(d); setCalendar(false) }} />
      {selected && (
        <ExpandingPage source={selected.origin} onClosed={() => { setSelected(null); onExpandedChange(false) }}>
          {(close) => <ProgrammePageWithBack backEnabled={backEnabled} close={close} programme={selected.programme} onOpen={onOpen} />}
        </ExpandingPage>
      )}
    </div>
  )
}

function ProgrammePageWithBack({ backEnabled, close, programme, onOpen }: { backEnabled: boolean; close: () => void; programme: Programme; onOpen: OpenMedia }) {
  useBackHandler(backEnabled, close)
  return <ProgrammePage programme={programme} onDismiss={close} onOpen={onOpen} />
}

