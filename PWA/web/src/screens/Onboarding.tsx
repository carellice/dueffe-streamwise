import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { tween } from '../components/motion.ts'
import { toast } from '../components/Overlay.tsx'
import { alpha, C, Icon, OutlinedButton, Pressable, TextButton } from '../components/ui.tsx'
import type { IconName } from '../lib/icons.gen.ts'
import { setTab, useBackHandler, type Tab } from '../lib/nav.ts'
import { importBackup, updateSettings } from '../lib/store.ts'

const PAGES: [string, string][] = [
  ['', 'Tutti i tuoi film e serie TV,\nin un’unica app.'],
  ['Tutti i tuoi servizi,\nin un unico posto', 'Cerca film e serie TV tra le principali piattaforme di streaming, noleggio, acquisto e cinema.'],
  ['Scopri dove guardare', 'Trova subito dove un titolo è disponibile: streaming, noleggio, acquisto o al cinema.'],
  ['Segui ciò che guardi', 'Salva i film, continua le serie dal prossimo episodio e ritrova tutto ciò che hai già visto.'],
  ['Ricevi nuovi consigli', 'Scopri nuovi titoli simili a quelli che hai guardato e valutato positivamente.'],
  ['La tua esperienza,\nsenza complicazioni', 'Un modo semplice e veloce per esplorare, organizzare e non perdere mai un titolo.'],
  ['Resta sempre aggiornato', 'Ritrova nuove uscite e stagioni in arrivo quando esplori il catalogo.'],
  ['', 'Un mondo di storie.\nSempre con te.'],
]

const img = (name: string) => `/onboarding/${name}.webp`

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [page, setPage] = useState(0)
  const file = useRef<HTMLInputElement>(null)
  const last = PAGES.length - 1
  const done = () => { updateSettings({ onboarded: true }); onComplete() }
  useBackHandler(page > 0, () => setPage(page - 1))
  const edge = page === 0 || page === last
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, background: C.bg }}>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, #1A1414, ${C.bg}, #16110F)`, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: -90, bottom: -95, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,59,78,.33), transparent 70%)' }} />
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'calc(var(--status-top) + 10px) 24px calc(var(--nav-bottom) + 20px)' }}>
        <div style={{ width: '100%', height: 38, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flex: 'none' }}>
          {page < last && <TextButton onClick={done} color="#D2C8CE" style={{ padding: '0 4px' }}><span style={{ fontSize: 14, fontWeight: 500 }}>Salta</span></TextButton>}
        </div>
        <div style={{ width: '100%', flex: 1, position: 'relative' }}>
          <AnimatePresence initial={false}>
            <motion.div key={page} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: tween(260) }} exit={{ opacity: 0, transition: tween(180) }} style={{ position: 'absolute', inset: 0 }}>
              <Artwork page={page} />
            </motion.div>
          </AnimatePresence>
        </div>
        {edge ? (
          <div style={{ fontSize: 29, fontWeight: 900, letterSpacing: 1.1, lineHeight: '36px' }}><span style={{ color: '#F9F5F7' }}>STREAM</span><span style={{ color: C.coral }}>WISE</span></div>
        ) : (
          <div style={{ color: '#F6F2F4', fontSize: 25, lineHeight: '30px', fontWeight: 700, textAlign: 'center', whiteSpace: 'pre-line' }}>{PAGES[page][0]}</div>
        )}
        <div style={{ color: edge ? '#E5DDE2' : '#BAB3BB', fontSize: 15, lineHeight: '21px', textAlign: 'center', marginTop: 10, minHeight: 44, whiteSpace: 'pre-line' }}>{PAGES[page][1]}</div>
        {page < last ? (
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '20px 0 22px' }}>
            {PAGES.map((_, i) => <div key={i} style={{ width: i === page ? 9 : 7, height: i === page ? 9 : 7, borderRadius: '50%', background: i === page ? C.accent : '#625C64' }} />)}
          </div>
        ) : <div style={{ height: 22 }} />}
        {edge ? (
          <>
            <Pressable pressed={0.97} className="brand-glow" onClick={() => (page === 0 ? setPage(1) : done())}
              style={{ width: '100%', height: 56, borderRadius: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', color: '#fff', ['--glow-blur' as string]: '12px' }}>
              <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: 0.1, position: 'relative' }}>{page === 0 ? 'Inizia' : 'Inizia ora'}</span>
              <Icon name="arrow_forward" size={22} style={{ position: 'absolute', right: 24 }} />
            </Pressable>
            {page === last && (
              <TextButton onClick={() => file.current?.click()} color="#BEB6BE" style={{ marginTop: 4 }}><span style={{ fontSize: 13, fontWeight: 500 }}>Hai un backup? Ripristinalo</span></TextButton>
            )}
          </>
        ) : (
          <div style={{ width: '100%', display: 'flex', alignItems: 'center' }}>
            <TextButton onClick={() => setPage(page - 1)} color="#D0C8CF" style={{ padding: 0 }}><span style={{ fontSize: 14, fontWeight: 500 }}>‹  Indietro</span></TextButton>
            <div style={{ flex: 1 }} />
            <Pressable pressed={0.97} className="brand-glow" onClick={() => setPage(page + 1)}
              style={{ width: 140, height: 54, borderRadius: 27, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', ['--glow-blur' as string]: '10px' }}>
              <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: 0.1, position: 'relative' }}>Avanti</span>
              <Icon name="arrow_forward" size={20} style={{ marginLeft: 12, position: 'relative' }} />
            </Pressable>
          </div>
        )}
        <input ref={file} type="file" accept="application/json,text/json,text/plain,.json" style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void f.text().then(importBackup).then(() => onComplete(), (err: Error) => toast(err.message || 'Ripristino non riuscito'))
          }} />
      </div>
    </div>
  )
}

/** A centered element moved by (x, y) like Modifier.offset inside Box(contentAlignment = Center). */
function At({ x = 0, y = 0, rotate = 0, scale = 1, opacity = 1, children, style }: { x?: number; y?: number; rotate?: number; scale?: number; opacity?: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})`, opacity, ...style }}>
      {children}
    </div>
  )
}

function Poster({ name, w, h }: { name: string; w: number; h: number }) {
  return (
    <div style={{ width: w, height: h, borderRadius: 15, background: '#211D22', border: `1px solid ${C.outline}`, overflow: 'hidden', boxShadow: '0 7px 14px rgba(0,0,0,.45)' }}>
      <img src={img(name)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  )
}

function ServiceTile({ logo, label }: { logo: string; label: string }) {
  return (
    <div style={{ width: 102, height: 80, borderRadius: 14, background: '#242329', border: '1px solid #484148', boxShadow: '0 5px 10px rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={img('service_' + logo)} alt={label} style={{ width: 59, height: 59, objectFit: 'contain' }} />
    </div>
  )
}

function Availability({ label, logos = [], cinema = false }: { label: string; logos?: string[]; cinema?: boolean }) {
  return (
    <div style={{ background: 'rgba(36,33,38,.933)', borderRadius: 15, border: '1px solid #494048', padding: '10px 9px' }}>
      <div className="ellipsis" style={{ color: '#B9ADB6', fontSize: 9, lineHeight: '12px' }}>{label}</div>
      <div style={{ marginTop: 6, height: 29, display: 'flex', gap: 7, alignItems: 'center' }}>
        {cinema ? <Icon name="movie" size={26} color={C.coral} /> : logos.map((l) => <img key={l} src={img('service_' + l)} alt="" style={{ width: 29, height: 29, objectFit: 'contain' }} />)}
      </div>
    </div>
  )
}

function TrackingRow({ icon, label, detail, accent }: { icon: IconName; label: string; detail: string; accent: string }) {
  return (
    <div style={{ height: 66, borderRadius: 18, background: '#242126', border: '1px solid #494048', display: 'flex', alignItems: 'center', padding: '0 14px', flex: 'none' }}>
      <div style={{ width: 39, height: 39, borderRadius: '50%', background: alpha(accent, 0.14), padding: 10, flex: 'none' }}><Icon name={icon} size={19} color={accent} /></div>
      <div style={{ marginLeft: 12, minWidth: 0 }}>
        <div className="ellipsis" style={{ color: '#F6F1F4', fontSize: 14, fontWeight: 700, lineHeight: '19px' }}>{label}</div>
        <div className="ellipsis" style={{ color: '#B7AFB8', fontSize: 11, marginTop: 2, lineHeight: '14px' }}>{detail}</div>
      </div>
    </div>
  )
}

function Orbit({ icon }: { icon: IconName }) {
  return <div style={{ width: 54, height: 54, borderRadius: 18, background: C.raised, border: `1px solid ${alpha(C.accent, 0.5)}`, padding: 14 }}><Icon name={icon} size={26} color="#F5D8E3" /></div>
}

function Artwork({ page }: { page: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 360, h: 330 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const ph = Math.min(size.h * 0.7, 290), pw = ph * 0.67
  const k = Math.min(1, size.w / 360, size.h / 330)
  let content: ReactNode
  switch (page) {
    case 0: content = (
      <>
        <At x={-pw * 0.72} y={7} rotate={-10} opacity={0.68}><Poster name="portrait" w={pw * 0.78} h={ph * 0.8} /></At>
        <At x={pw * 0.72} y={9} rotate={10} opacity={0.72}><Poster name="blue_planet" w={pw * 0.78} h={ph * 0.8} /></At>
        <At rotate={2}><Poster name="red_planet" w={pw} h={ph} /></At>
        <At y={ph * 0.52}><div style={{ width: pw * 0.75, height: 16, background: 'radial-gradient(ellipse, rgba(229,36,58,.67), transparent 70%)' }} /></At>
      </>
    ); break
    case 1: content = (
      <>
        {([['netflix', 'Netflix', -58, -75, -9], ['prime', 'Prime Video', -102, 12, 7], ['disney', 'Disney+', 83, -5, -7], ['apple', 'Apple TV', 4, 35, 7], ['max', 'HBO Max', 104, 92, -8], ['paramount', 'Paramount+', -42, 123, 5]] as const).map(([logo, label, x, y, r]) => (
          <At key={logo} x={x * k} y={y * k} rotate={r} scale={k}><ServiceTile logo={logo} label={label} /></At>
        ))}
      </>
    ); break
    case 2: content = (
      <>
        <At x={-size.w * 0.19} y={2}><Poster name="portrait" w={pw * 0.9} h={ph} /></At>
        <At x={size.w * 0.27}>
          <div style={{ width: size.w * 0.38, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Availability label="Disponibile su" logos={['netflix', 'disney']} />
            <Availability label="Noleggio da" logos={['prime']} />
            <Availability label="Acquisto da" logos={['apple', 'paramount']} />
            <Availability label="Al cinema" cinema />
          </div>
        </At>
      </>
    ); break
    case 3: content = (
      <At>
        <div className="scroll" style={{ width: Math.min(size.w * 0.88, 330), maxHeight: size.h, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <TrackingRow icon="add" label="La mia lista" detail="Film salvati" accent={C.accent} />
          <TrackingRow icon="play" label="Continua a guardare" detail="Prossimo episodio" accent="#72D3B0" />
          <TrackingRow icon="check" label="Già visti" detail="Film e serie" accent="#76D5C3" />
          <TrackingRow icon="thumb_up" label="Le tue valutazioni" detail="Mi piace o non mi piace" accent={C.accent} />
        </div>
      </At>
    ); break
    case 4: content = (
      <>
        <At x={-pw * 0.85} y={-ph * 0.12} rotate={-8} opacity={0.82}><Poster name="portrait" w={pw * 0.65} h={ph * 0.74} /></At>
        <At x={-pw * 0.18} rotate={-4}><Poster name="blue_planet" w={pw * 0.84} h={ph * 0.95} /></At>
        <At x={pw * 0.65} y={ph * 0.16} rotate={7}><Poster name="red_planet" w={pw * 0.66} h={ph * 0.77} /></At>
        <At y={ph * 0.34}>
          <div style={{ background: 'rgba(29,32,41,.953)', borderRadius: 18, border: `1px solid ${alpha(C.accent, 0.5)}`, padding: '12px 16px', display: 'flex', alignItems: 'center', boxShadow: '0 6px 12px rgba(0,0,0,.45)', whiteSpace: 'nowrap' }}>
            <Icon name="sparkles" size={22} color={C.accent} /><span style={{ color: '#fff', fontWeight: 600, marginLeft: 8 }}>Consigliati per te</span>
          </div>
        </At>
      </>
    ); break
    case 5: content = (
      <>
        <At><div style={{ width: Math.min(236, size.h * 0.72), height: Math.min(236, size.h * 0.72), borderRadius: '50%', border: `1px solid ${alpha(C.accent, 0.5)}` }} /></At>
        <At x={-105 * k} y={-64 * k}><Orbit icon="tv" /></At>
        <At x={88 * k} y={-105 * k}><Orbit icon="movie" /></At>
        <At x={-82 * k} y={100 * k}><Orbit icon="sparkles" /></At>
        <At x={112 * k} y={65 * k}><Orbit icon="check" /></At>
        <At><div className="brand-glow" style={{ width: 126, height: 126, borderRadius: 30, padding: 34, ['--glow-blur' as string]: '16px' }}><Icon name="search" size={58} color="#fff" style={{ position: 'relative' }} /></div></At>
      </>
    ); break
    case 6: content = (
      <At><img src={img('phone_notification')} alt="Anteprima delle notifiche di StreamWise" style={{ width: Math.min(size.w * 0.83, 290), height: Math.min(size.h * 0.96, 410), objectFit: 'contain' }} /></At>
    ); break
    default: content = (
      <>
        <At><div style={{ width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,59,78,.4), transparent 70%)' }} /></At>
        <At><img src={img('app_logo')} alt="Logo StreamWise" style={{ width: Math.min(size.w * 0.72, size.h * 0.72, 240), height: Math.min(size.w * 0.72, size.h * 0.72, 240), objectFit: 'contain' }} /></At>
      </>
    )
  }
  return <div ref={box} style={{ position: 'absolute', inset: 0 }}>{content}</div>
}

const TOUR: [Tab, string, string][] = [
  ['home', 'La Home', 'Riprendi le serie da dove eri, guarda cosa è di tendenza e lasciati sorprendere con un consiglio su misura.'],
  ['discover', 'Scopri', 'Passa da Film a Serie TV con un tocco, sfoglia i titoli in evidenza e filtra per piattaforma e genere.'],
  ['guide', 'La Guida TV', 'Scegli un giorno e scopri film e serie sul digitale terrestre. Filtra per canale o consulta i programmi in onda adesso.'],
  ['library', 'La tua Libreria', 'Serie in corso, titoli da vedere, già visti, uscite che segui e il confronto degli abbonamenti, tutto in un posto.'],
  ['home', 'Cerca e personalizza', 'Dalla Home trovi la ricerca e le Impostazioni. Da lì puoi esportare un backup JSON o ripristinarlo su un nuovo telefono.'],
]

export function TourOverlay({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0)
  useEffect(() => { setTab(TOUR[step][0]) }, [step])
  const [, title, body] = TOUR[step]
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.62)' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '20px 20px calc(var(--nav-bottom) + 44px)' }}>
        <div style={{ background: C.panel, borderRadius: 30, border: `1px solid ${C.outline}`, padding: 22 }}>
          <div style={{ color: C.accent, fontSize: 11, fontWeight: 900, letterSpacing: 1.5 }}>TOUR GUIDATO  {step + 1}/{TOUR.length}</div>
          <div className="t-headline-medium" style={{ color: C.ink, marginTop: 8 }}>{title}</div>
          <div style={{ color: C.muted, fontSize: 16, lineHeight: '23px', marginTop: 8 }}>{body}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            {step > 0 && <OutlinedButton onClick={() => setStep(step - 1)} style={{ flex: 1, borderRadius: 16 }}>Indietro</OutlinedButton>}
            <Pressable pressed={0.97} className="brand-glow" onClick={() => (step < TOUR.length - 1 ? setStep(step + 1) : onComplete())}
              style={{ flex: 1, height: 40, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <span className="t-label-large" style={{ position: 'relative', color: '#fff' }}>{step < TOUR.length - 1 ? 'Avanti' : 'Ho capito'}</span>
            </Pressable>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}><TextButton onClick={onComplete}>Salta tour</TextButton></div>
      </div>
    </div>
  )
}
