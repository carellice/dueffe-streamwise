// OnboardingScreen of MainActivity.kt: eight pages of artwork, shown on an account's first use.
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useBackHandler } from '../lib/back.ts'
import { tween } from '../components/motion.ts'
import { Portal } from '../components/overlay.tsx'
import { Icon, Press } from '../components/ui.tsx'
import type { IconName } from '../lib/icons.gen.ts'

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

function Poster({ image, style }: { image: string; style: CSSProperties }) {
  return (
    <div style={{ position: 'absolute', borderRadius: 15, overflow: 'hidden', background: '#211D22', boxShadow: '0 7px 14px rgba(0,0,0,.5), inset 0 0 0 1px var(--outline)', ...style }}>
      <img src={img(image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  )
}

function ServiceTile({ logo, x, y, rotate, scale }: { logo: string; x: number; y: number; rotate: number; scale: number }) {
  return (
    <div className="center" style={{ position: 'absolute', left: '50%', top: '50%', width: 102, height: 80, marginLeft: -51, marginTop: -40, borderRadius: 14, background: '#242329', boxShadow: '0 5px 10px rgba(0,0,0,.45), inset 0 0 0 1px #484148', transform: `translate(${x * scale}px, ${y * scale}px) rotate(${rotate}deg) scale(${scale})` }}>
      <img src={img(logo)} alt="" style={{ width: 59, height: 59, objectFit: 'contain' }} />
    </div>
  )
}

function Availability({ label, logos = [], cinema = false }: { label: string; logos?: string[]; cinema?: boolean }) {
  return (
    <div style={{ background: 'rgba(36,33,38,.93)', borderRadius: 15, boxShadow: 'inset 0 0 0 1px #494048', padding: '10px 9px' }}>
      <div className="ellipsis" style={{ color: '#B9ADB6', fontSize: 9, lineHeight: '12px' }}>{label}</div>
      <div className="row" style={{ marginTop: 6, height: 29, gap: 7 }}>
        {cinema ? <Icon name="movie" size={26} color="var(--coral)" /> : logos.map((l) => <img key={l} src={img(l)} alt="" style={{ width: 29, height: 29, objectFit: 'contain' }} />)}
      </div>
    </div>
  )
}

function TrackingRow({ icon, label, detail, accent }: { icon: IconName; label: string; detail: string; accent: string }) {
  return (
    <div className="row" style={{ height: 66, borderRadius: 18, background: '#242126', boxShadow: 'inset 0 0 0 1px #494048', padding: '0 14px', flex: 'none' }}>
      <div className="center" style={{ width: 39, height: 39, borderRadius: '50%', background: `color-mix(in srgb, ${accent} 14%, transparent)`, flex: 'none' }}>
        <Icon name={icon} size={19} color={accent} />
      </div>
      <div className="grow col" style={{ paddingLeft: 12 }}>
        <span className="ellipsis" style={{ color: '#F6F1F4', fontSize: 14, fontWeight: 700, lineHeight: '20px' }}>{label}</span>
        <span className="ellipsis" style={{ color: '#B7AFB8', fontSize: 11, marginTop: 2, lineHeight: '14px' }}>{detail}</span>
      </div>
    </div>
  )
}

function OrbitIcon({ icon, x, y }: { icon: IconName; x: number; y: number }) {
  return (
    <div className="center" style={{ position: 'absolute', left: '50%', top: '50%', width: 54, height: 54, marginLeft: -27, marginTop: -27, borderRadius: 18, background: 'var(--raised)', boxShadow: 'inset 0 0 0 1px rgba(255,89,100,.5)', transform: `translate(${x}px, ${y}px)` }}>
      <Icon name={icon} size={26} color="#F5D8E3" />
    </div>
  )
}

function Artwork({ page }: { page: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 360, h: 330 })
  useEffect(() => {
    const el = ref.current!
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    update()
    return () => observer.disconnect()
  }, [])
  const posterHeight = Math.min(box.h * 0.7, 290)
  const posterWidth = posterHeight * 0.67
  const compact = Math.min(1, box.w / 360, box.h / 330)
  const center = (w: number, h: number, x = 0, y = 0, rotate = 0, opacity = 1): CSSProperties => ({
    left: '50%', top: '50%', width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, transform: `translate(${x}px, ${y}px) rotate(${rotate}deg)`, opacity,
  })
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {page === 0 && (
        <>
          <Poster image="portrait" style={center(posterWidth * 0.78, posterHeight * 0.8, -posterWidth * 0.72, 7, -10, 0.68)} />
          <Poster image="blue_planet" style={center(posterWidth * 0.78, posterHeight * 0.8, posterWidth * 0.72, 9, 10, 0.72)} />
          <Poster image="red_planet" style={center(posterWidth, posterHeight, 0, 0, 2)} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: posterWidth * 0.75, height: 16, marginLeft: -posterWidth * 0.375, marginTop: posterHeight * 0.52 - 8, background: 'radial-gradient(ellipse, rgba(229,36,58,.67), transparent 70%)' }} />
        </>
      )}
      {page === 1 && (
        <>
          <ServiceTile logo="service_netflix" x={-58} y={-75} rotate={-9} scale={compact} />
          <ServiceTile logo="service_prime" x={-102} y={12} rotate={7} scale={compact} />
          <ServiceTile logo="service_disney" x={83} y={-5} rotate={-7} scale={compact} />
          <ServiceTile logo="service_apple" x={4} y={35} rotate={7} scale={compact} />
          <ServiceTile logo="service_max" x={104} y={92} rotate={-8} scale={compact} />
          <ServiceTile logo="service_paramount" x={-42} y={123} rotate={5} scale={compact} />
        </>
      )}
      {page === 2 && (
        <>
          <Poster image="portrait" style={center(posterWidth * 0.9, posterHeight, -box.w * 0.19, 2)} />
          <div className="col" style={{ position: 'absolute', left: '50%', top: '50%', width: box.w * 0.38, marginLeft: -box.w * 0.19 + box.w * 0.27, transform: 'translateY(-50%)', gap: 8 }}>
            <Availability label="Disponibile su" logos={['service_netflix', 'service_disney']} />
            <Availability label="Noleggio da" logos={['service_prime']} />
            <Availability label="Acquisto da" logos={['service_apple', 'service_paramount']} />
            <Availability label="Al cinema" cinema />
          </div>
        </>
      )}
      {page === 3 && (
        <div className="center" style={{ position: 'absolute', inset: 0 }}>
          <div className="col scroll" style={{ width: Math.min(box.w * 0.88, 330), maxHeight: box.h, gap: 10 }}>
            <TrackingRow icon="add" label="La mia lista" detail="Film salvati" accent="var(--accent)" />
            <TrackingRow icon="play" label="Continua a guardare" detail="Prossimo episodio" accent="#72D3B0" />
            <TrackingRow icon="check" label="Già visti" detail="Film e serie" accent="#76D5C3" />
            <TrackingRow icon="thumbUp" label="Le tue valutazioni" detail="Mi piace o non mi piace" accent="var(--accent)" />
          </div>
        </div>
      )}
      {page === 4 && (
        <>
          <Poster image="portrait" style={center(posterWidth * 0.65, posterHeight * 0.74, -posterWidth * 0.85, -posterHeight * 0.12, -8, 0.82)} />
          <Poster image="blue_planet" style={center(posterWidth * 0.84, posterHeight * 0.95, -posterWidth * 0.18, 0, -4)} />
          <Poster image="red_planet" style={center(posterWidth * 0.66, posterHeight * 0.77, posterWidth * 0.65, posterHeight * 0.16, 7)} />
          <div className="row" style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, calc(-50% + ${posterHeight * 0.34}px))`, background: 'rgba(29,32,41,.95)', borderRadius: 18, boxShadow: '0 6px 12px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,89,100,.5)', padding: '12px 16px', whiteSpace: 'nowrap' }}>
            <Icon name="sparkles" size={22} color="var(--accent)" />
            <span style={{ color: '#fff', fontWeight: 600, marginLeft: 8 }}>Consigliati per te</span>
          </div>
        </>
      )}
      {page === 5 && (() => {
        const ring = Math.min(236, box.h * 0.72)
        return (
          <>
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: ring, height: ring, marginLeft: -ring / 2, marginTop: -ring / 2, borderRadius: '50%', boxShadow: 'inset 0 0 0 1px rgba(255,89,100,.5)' }} />
            <OrbitIcon icon="tv" x={-105 * compact} y={-64 * compact} />
            <OrbitIcon icon="movie" x={88 * compact} y={-105 * compact} />
            <OrbitIcon icon="sparkles" x={-82 * compact} y={100 * compact} />
            <OrbitIcon icon="check" x={112 * compact} y={65 * compact} />
            <div className="brand-glow center" style={{ position: 'absolute', left: '50%', top: '50%', width: 126, height: 126, marginLeft: -63, marginTop: -63, borderRadius: 30, ['--glow' as string]: '16px' }}>
              <Icon name="search" size={58} color="#fff" />
            </div>
          </>
        )
      })()}
      {page === 6 && (
        <div className="center" style={{ position: 'absolute', inset: 0 }}>
          <img src={img('phone_notification')} alt="Anteprima delle notifiche di StreamWise" style={{ width: Math.min(box.w * 0.83, 290), height: Math.min(box.h * 0.96, 410), objectFit: 'contain' }} />
        </div>
      )}
      {page === 7 && (
        <div className="center" style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 240, height: 240, marginLeft: -120, marginTop: -120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,59,78,.4), transparent 70%)' }} />
          <img src={img('app_logo')} alt="Logo StreamWise" style={{ position: 'relative', width: Math.min(box.w * 0.72, box.h * 0.72, 240), height: Math.min(box.w * 0.72, box.h * 0.72, 240), objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}

export function OnboardingScreen({ onImportBackup, onComplete }: { onImportBackup: () => void; onComplete: () => void }) {
  const [page, setPage] = useState(0)
  const last = PAGES.length - 1
  useBackHandler(true, () => { if (page > 0) setPage(page - 1) })
  const edge = page === 0 || page === last
  return (
    <Portal>
      <motion.div className="fill" style={{ zIndex: 70, background: 'var(--onboarding, linear-gradient(180deg, #1A1414, #0A0B10, #16110F))', pointerEvents: 'auto', overflow: 'hidden' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(240)}>
        <div style={{ position: 'absolute', left: -90, bottom: -95, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,59,78,.33), transparent 70%)' }} />
        <div className="fill col status-pad nav-pad desk-narrow" style={{ padding: '10px 24px 20px', paddingTop: 'calc(10px + var(--safe-top))', paddingBottom: 'calc(20px + var(--safe-bottom))', alignItems: 'center' }}>
          <div className="row" style={{ width: '100%', height: 38, justifyContent: 'flex-end' }}>
            {page < last && <button onClick={onComplete} style={{ padding: '0 4px', height: 38, color: '#D2C8CE', fontSize: 14 }}>Salta</button>}
          </div>
          <div style={{ flex: 1, width: '100%', position: 'relative', minHeight: 0 }}>
            <AnimatePresence initial={false}>
              <motion.div key={page} className="fill" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: tween(260) }} exit={{ opacity: 0, transition: tween(180) }}>
                <Artwork page={page} />
              </motion.div>
            </AnimatePresence>
          </div>
          {edge ? (
            <div style={{ fontSize: 29, fontWeight: 900, letterSpacing: 1.1, lineHeight: '36px' }}>
              <span style={{ color: '#F9F5F7' }}>STREAM</span><span style={{ color: 'var(--coral)' }}>WISE</span>
            </div>
          ) : <div style={{ color: '#F6F2F4', fontSize: 25, lineHeight: '30px', fontWeight: 700, textAlign: 'center', whiteSpace: 'pre-line' }}>{PAGES[page][0]}</div>}
          <div style={{ color: edge ? '#E5DDE2' : '#BAB3BB', fontSize: 15, lineHeight: '21px', textAlign: 'center', marginTop: 10, minHeight: 44, whiteSpace: 'pre-line' }}>{PAGES[page][1]}</div>
          {page < last ? (
            <div className="row" style={{ padding: '20px 0 22px', gap: 7 }}>
              {PAGES.map((_, i) => <div key={i} style={{ width: i === page ? 9 : 7, height: i === page ? 9 : 7, borderRadius: '50%', background: i === page ? 'var(--accent)' : '#625C64' }} />)}
            </div>
          ) : <div style={{ height: 22 }} />}
          {edge ? (
            <>
              <Press pressed={0.97} onClick={() => (page === 0 ? setPage(1) : onComplete())} className="brand-glow center"
                style={{ width: '100%', height: 56, borderRadius: 28, ['--glow' as string]: '12px', color: '#fff', position: 'relative' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{page === 0 ? 'Inizia' : 'Inizia ora'}</span>
                <Icon name="arrowForward" size={22} style={{ position: 'absolute', right: 24 }} />
              </Press>
              {page === last && <button onClick={onImportBackup} style={{ marginTop: 4, height: 40, padding: '0 12px', color: '#BEB6BE', fontSize: 13 }}>Hai un backup? Ripristinalo</button>}
            </>
          ) : (
            <div className="row" style={{ width: '100%' }}>
              <button onClick={() => setPage(page - 1)} style={{ height: 40, color: '#D0C8CF', fontSize: 14 }}>‹  Indietro</button>
              <div className="grow" />
              <Press pressed={0.97} onClick={() => setPage(page + 1)} className="brand-glow row center" style={{ width: 140, height: 54, borderRadius: 27, ['--glow' as string]: '10px', color: '#fff', gap: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Avanti</span>
                <Icon name="arrowForward" size={20} />
              </Press>
            </div>
          )}
        </div>
      </motion.div>
    </Portal>
  )
}
