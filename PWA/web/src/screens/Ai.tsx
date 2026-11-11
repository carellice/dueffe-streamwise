// "Chiedi all'IA", "Ritrova un titolo", "Simili secondo l'IA" and AiSetupCard of MainActivity.kt.
// The AI runs on the server with the account's own Cloudflare credentials (server/src/ai.ts).
import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState, type CSSProperties } from 'react'
import type { Media } from '../../../shared/model.ts'
import { isSeries } from '../../../shared/model.ts'
import { api, ApiError } from '../lib/api.ts'
import { useBackHandler } from '../lib/back.ts'
import { entries, refresh, useStore } from '../lib/store.ts'
import { tmdb } from '../lib/tmdb.ts'
import { emphasized, spring, tween } from '../components/motion.ts'
import { Icon, LinearProgress, LoadingSkeleton, Press, Reveal, SegmentedPills, Spinner, TextButton } from '../components/ui.tsx'
import { ArtworkImage, artSource, posterUrl, FIND_TITLE, type OpenMedia } from '../components/cards.tsx'

type AiPick = { title: string; year: number | null; type: string; reason: string }
type Result = [Media, string]

const AI_FAILED = "Non riesco a contattare l'IA. Controlla la connessione e riprova."

const normalizedTitle = (value: string) => value.normalize('NFD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

/**
 * Matches an AI pick to its TMDB entry. The AI gives the original title, while search results are sorted by
 * their Italian title, so a lesser namesake without poster or plot could win: candidates are scored on both
 * titles, the year and how complete their data is.
 */
async function resolveAiPick(pick: AiPick): Promise<Media | null> {
  try {
    const wanted = normalizedTitle(pick.title)
    const candidates = (await tmdb.searchTitles(pick.title, null)).filter((m) => m.mediaType === pick.type)
    const score = (media: Media) => {
      const titles = [media.title, media.originalTitle].map(normalizedTitle).filter((t) => t !== '')
      const titleScore = titles.some((t) => t === wanted) ? 0
        : titles.some((t) => t.startsWith(wanted) || wanted.startsWith(t)) ? 1
          : titles.some((t) => t.includes(wanted) || wanted.includes(t)) ? 2 : 4
      const year = Number.parseInt(media.year, 10)
      const gap = Number.isNaN(year) || pick.year == null ? null : Math.abs(pick.year - year)
      const yearScore = pick.year == null ? 1 : gap == null ? 3 : gap === 0 ? 0 : gap === 1 ? 1 : 4
      const missing = (media.poster.trim() === '' ? 3 : 0) + (media.overview.trim() === '' || media.overview === 'Trama non disponibile.' ? 1 : 0)
      return titleScore * 3 + yearScore * 2 + missing
    }
    let best: Media | null = null
    for (const m of candidates) {
      if (best == null || score(m) < score(best) || (score(m) === score(best) && -m.rating < -best.rating)) best = m
    }
    return best
  } catch {
    return null
  }
}

async function resolveAll(picks: AiPick[]): Promise<Result[]> {
  const resolved = await Promise.all(picks.map(async (pick) => {
    const media = await resolveAiPick(pick)
    return media ? ([media, pick.reason] as Result) : null
  }))
  const seen = new Set<string>()
  return resolved.filter((r): r is Result => r != null && !seen.has(r[0].id) && (seen.add(r[0].id), true))
}

const aiError = (e: unknown) => (e instanceof ApiError && e.status !== 0 ? e.message : AI_FAILED)

function ResultSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="glass row" style={{ borderRadius: 22, padding: 10, alignItems: 'flex-start' }}>
      <LoadingSkeleton style={{ width: 84, height: 124, borderRadius: 14, flex: 'none' }} />
      <div className="grow col" style={{ padding: '6px 0 0 14px', gap: 10 }}>
        <LoadingSkeleton style={{ width: '40%', height: 10, borderRadius: 5 }} />
        <LoadingSkeleton style={{ width: '80%', height: 16, borderRadius: 8 }} />
        <LoadingSkeleton style={{ width: '100%', height: 12, borderRadius: 6 }} />
        {lines > 3 && <LoadingSkeleton style={{ width: '70%', height: 12, borderRadius: 6 }} />}
      </div>
    </div>
  )
}

export function AiResultCard({ media, reason, onOpen }: { media: Media; reason: string; onOpen: OpenMedia }) {
  const art = useRef<HTMLDivElement | null>(null)
  return (
    <Press className="glass row" style={{ borderRadius: 22, padding: 10 }} onClick={() => onOpen(media, artSource(art.current, posterUrl(media), 14))}>
      <ArtworkImage media={media} corner={14} style={{ width: 84, height: 124, flex: 'none' }} onEl={(el) => { art.current = el }} />
      <div className="grow col" style={{ padding: '0 4px 0 14px' }}>
        <span style={{ color: 'var(--accent)', fontSize: 10, fontWeight: 900, letterSpacing: 1.2, lineHeight: '14px' }}>{isSeries(media) ? 'SERIE TV' : 'FILM'} · {media.year}</span>
        <span className="clamp2" style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 800, marginTop: 2, lineHeight: '22px' }}>{media.title}</span>
        {reason.trim() !== '' && (
          <div className="row" style={{ marginTop: 8, alignItems: 'flex-start' }}>
            <Icon name="sparkles" size={14} color="var(--violet)" style={{ marginTop: 2 }} />
            <span style={{ marginLeft: 6, color: 'var(--muted)', fontSize: 13, lineHeight: '18px', fontStyle: 'italic' }}>{reason.charAt(0).toUpperCase() + reason.slice(1)}</span>
          </div>
        )}
      </div>
    </Press>
  )
}

const CLOUDFLARE_SIGN_UP = 'https://dash.cloudflare.com/sign-up'
const CLOUDFLARE_WORKERS_AI = 'https://dash.cloudflare.com/?to=/:account/ai/workers-ai'
const CLOUDFLARE_API_TOKENS = 'https://dash.cloudflare.com/profile/api-tokens'

/** M3 OutlinedTextField with a floating label. */
export function OutlinedField({ label, value, onChange, type = 'text', trailing, autoComplete, onEnter, style }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; trailing?: React.ReactNode; autoComplete?: string; onEnter?: () => void; style?: CSSProperties
}) {
  const [focused, setFocused] = useState(false)
  const floating = focused || value !== ''
  return (
    <label style={{ position: 'relative', display: 'block', height: 56, ...style }}>
      <span style={{
        position: 'absolute', left: 12, padding: '0 4px', zIndex: 1, pointerEvents: 'none', background: floating ? 'var(--surface)' : 'transparent',
        top: floating ? -8 : 16, fontSize: floating ? 12 : 16, lineHeight: '16px', letterSpacing: floating ? 0.4 : 0.5,
        color: focused ? 'var(--primary)' : 'var(--muted)', transition: 'all .15s cubic-bezier(.4,0,.2,1)',
      }}>{label}</span>
      <input className="outlined" value={value} type={type} autoComplete={autoComplete ?? 'off'} autoCorrect="off" autoCapitalize="off" spellCheck={false}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.() }}
        style={{ paddingRight: trailing ? 88 : 16, background: 'transparent' }} />
      {trailing && <div className="row" style={{ position: 'absolute', right: 4, top: 8, height: 40 }}>{trailing}</div>}
    </label>
  )
}

/** Guide and form to connect the user's own Cloudflare Workers AI account. */
export function AiSetupCard({ onConfiguredChange, style }: { onConfiguredChange?: (ready: boolean) => void; style?: CSSProperties }) {
  const { data } = useStore()
  const configured = data?.ai.configured === true
  const [accountId, setAccountId] = useState(data?.ai.accountId ?? '')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showGuide, setShowGuide] = useState(!configured)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<[string, boolean] | null>(null)
  const steps: [string, string | null, string | null][] = [
    ["Crea un account gratuito su Cloudflare, oppure accedi se ce l'hai già.", 'Apri Cloudflare', CLOUDFLARE_SIGN_UP],
    ['Apri Workers AI (menu AI › Workers AI) e tocca “Use REST API”.', 'Apri Workers AI', CLOUDFLARE_WORKERS_AI],
    ["Copia l'Account ID (32 caratteri) e incollalo qui sotto.", null, null],
    ['Tocca “Create a Workers AI API Token”, poi “Create API Token” e copia il token: Cloudflare lo mostra una sola volta. In alternativa: Profilo › API Tokens › Create Token › modello “Workers AI”.', 'Apri API Tokens', CLOUDFLARE_API_TOKENS],
    ['Incolla il token qui sotto e tocca “Verifica e salva”.', null, null],
  ]
  const verify = async () => {
    if (checking) return
    setChecking(true)
    setMessage(null)
    try {
      await api('/api/ai/config', { method: 'POST', json: { accountId: accountId.trim(), token: token.trim() } })
      await refresh(true)
      setShowGuide(false)
      setToken('')
      setMessage(["Fatto! L'IA è collegata al tuo account Cloudflare.", true])
      onConfiguredChange?.(true)
    } catch (e) {
      setMessage([e instanceof ApiError && e.status !== 0 ? e.message : 'Verifica non riuscita. Riprova.', false])
    }
    setChecking(false)
  }
  const remove = async () => {
    try {
      await api('/api/ai/config', { method: 'DELETE' })
      await refresh(true)
      setAccountId(''); setToken(''); setShowGuide(true)
      setMessage(['Credenziali rimosse dal server.', true])
      onConfiguredChange?.(false)
    } catch (e) {
      setMessage([aiError(e), false])
    }
  }
  const canSave = accountId.trim() !== '' && token.trim() !== '' && !checking
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 24, boxShadow: `inset 0 0 0 1px ${configured ? 'rgba(165,123,255,.5)' : 'var(--outline)'}`, padding: 18, ...style }}>
      <div className="row">
        <Icon name="sparkles" size={22} color="var(--violet)" />
        <span className="t-title-large grow" style={{ color: 'var(--ink)', paddingLeft: 10 }}>Intelligenza artificiale</span>
        <span style={{ borderRadius: 999, background: configured ? 'rgba(165,123,255,.2)' : 'var(--raised)', color: configured ? '#fff' : 'var(--muted)', fontSize: 12, fontWeight: 700, padding: '5px 10px', lineHeight: '16px' }}>{configured ? 'Attiva' : 'Da configurare'}</span>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '18px', marginTop: 8 }}>
        “Chiedi all'IA” usa Workers AI di Cloudflare con il tuo account personale. Il piano gratuito include una quota giornaliera di richieste, più che sufficiente per l'uso quotidiano, senza carta di credito.
      </div>
      <span onClick={() => setShowGuide(!showGuide)} style={{ display: 'inline-block', marginTop: 10, padding: '6px 0', color: 'var(--violet)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
        {showGuide ? 'Nascondi la guida' : 'Come ottenere Account ID e token'}
      </span>
      <AnimatePresence initial={false}>
        {showGuide && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring(1, 1500)} style={{ overflow: 'hidden' }}>
            <div className="col" style={{ paddingTop: 6, gap: 12 }}>
              {steps.map(([text, label, url], index) => (
                <div key={index} className="row" style={{ alignItems: 'flex-start' }}>
                  <div className="center" style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(165,123,255,.2)', color: '#fff', fontSize: 12, fontWeight: 700, flex: 'none' }}>{index + 1}</div>
                  <div className="grow col" style={{ paddingLeft: 10 }}>
                    <span style={{ color: 'var(--ink)', fontSize: 14, lineHeight: '19px' }}>{text}</span>
                    {label && url && <a href={url} target="_blank" rel="noopener" style={{ marginTop: 4, padding: '4px 0', color: 'var(--violet)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>{label} ›</a>}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <OutlinedField label="Account ID" value={accountId} onChange={(v) => { setAccountId(v.trim()); setMessage(null) }} style={{ marginTop: 14 }} />
      <OutlinedField label={configured && token === '' ? 'Token API Workers AI (salvato sul server)' : 'Token API Workers AI'} value={token} type={showToken ? 'text' : 'password'} autoComplete="new-password"
        onChange={(v) => { setToken(v.trim()); setMessage(null) }} onEnter={() => { if (canSave) void verify() }} style={{ marginTop: 8 }}
        trailing={<TextButton onClick={() => setShowToken(!showToken)} style={{ fontSize: 12 }}>{showToken ? 'Nascondi' : 'Mostra'}</TextButton>} />
      {message && <div style={{ color: message[1] ? 'var(--violet)' : 'var(--dislike)', fontSize: 13, lineHeight: '18px', marginTop: 10 }}>{message[0]}</div>}
      <div className="row" style={{ marginTop: 14, gap: 10 }}>
        {configured && (
          <Press pressed={0.97} onClick={() => void remove()} className="grow center" style={{ height: 50, borderRadius: 18, boxShadow: 'inset 0 0 0 1px var(--outline-strong)', color: 'var(--primary)', fontSize: 14, fontWeight: 700 }}>Rimuovi</Press>
        )}
        <Press pressed={canSave ? 0.97 : 1} disabled={!canSave} onClick={() => void verify()} className="grow center"
          style={{ height: 50, borderRadius: 18, background: canSave ? 'var(--violet)' : 'rgba(247,245,243,.12)', color: canSave ? '#fff' : 'rgba(247,245,243,.38)', fontSize: 14, fontWeight: 700 }}>
          {checking ? <Spinner size={18} stroke={2} color="#fff" /> : 'Verifica e salva'}
        </Press>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: '16px', marginTop: 12 }}>
        Account ID e token restano sul tuo server StreamWise, vengono inviati unicamente a Cloudflare e non finiscono nei backup JSON.
      </div>
    </div>
  )
}

function AiHeader({ title, onBack, trailing }: { title: string; onBack: () => void; trailing?: React.ReactNode }) {
  return (
    <div className="row">
      <Press pressed={0.88} aria-label="Indietro" onClick={onBack} className="glass center" style={{ width: 44, height: 44, borderRadius: '50%', flex: 'none' }}><Icon name="back" size={21} /></Press>
      <div className="grow col" style={{ paddingLeft: 14 }}>
        <span style={{ color: 'var(--violet)', fontSize: 11, fontWeight: 900, letterSpacing: 1.5, lineHeight: '16px' }}>INTELLIGENZA ARTIFICIALE</span>
        <span className="t-headline-medium" style={{ color: 'var(--ink)' }}>{title}</span>
      </div>
      {trailing}
    </div>
  )
}

function AiGlow() {
  return <div style={{ position: 'absolute', top: -90, right: -90, width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle, rgba(165,123,255,.22), transparent 70%)', pointerEvents: 'none' }} />
}

function Chip({ label, active, onClick, small = false }: { label: string; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <Press pressed={0.95} onClick={onClick} style={{
      borderRadius: 999, background: active ? 'rgba(165,123,255,.22)' : 'var(--raised)', boxShadow: `inset 0 0 0 1px ${active ? 'var(--violet)' : 'rgba(255,255,255,.06)'}`,
      padding: small ? '8px 14px' : '10px 16px', color: active ? '#fff' : 'rgba(247,245,243,.85)', fontSize: small ? 13 : 14, fontWeight: 600, lineHeight: '20px',
    }}>{label}</Press>
  )
}

function AiButton({ busy, label, onClick, icon = true, height = 56, disabled }: { busy: boolean; label: string; onClick: () => void; icon?: boolean; height?: number; disabled?: boolean }) {
  return (
    <Press pressed={busy || disabled ? 1 : 0.97} disabled={busy || disabled} onClick={onClick} className="row center"
      style={{ height, borderRadius: height / 2, gap: 10, color: '#fff', background: 'linear-gradient(135deg, #A57BFF, #D7142B)', boxShadow: '0 7px 14px rgba(165,123,255,.35)' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={label} className="row" style={{ gap: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(220)}>
          {busy ? <Spinner size={20} stroke={2} color="#fff" /> : icon ? <Icon name="sparkles" size={21} /> : null}
          <span style={{ fontWeight: 700, fontSize: 16 }}>{label}</span>
        </motion.div>
      </AnimatePresence>
    </Press>
  )
}

export function AiScreen({ onDismiss, onOpen }: { onDismiss: () => void; onOpen: OpenMedia }) {
  const { data } = useStore()
  const [configured, setConfigured] = useState(data?.ai.configured === true)
  const [request, setRequest] = useState('')
  const [type, setType] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const suggested = useRef<string[]>([])
  const [list] = useState(() => entries())
  const liked = list.filter((e) => e.liked === true).map((e) => e.media.title).slice(0, 30)
  const disliked = list.filter((e) => e.liked === false).map((e) => e.media.title).slice(0, 15)
  const watching = list.filter((e) => e.state === 'progress').map((e) => e.media.title).slice(0, 15)
  const known = new Set(list.map((e) => e.media.id))
  useBackHandler(true, onDismiss)
  const ask = async () => {
    if (loading) return
    ;(document.activeElement as HTMLElement | null)?.blur()
    setLoading(true)
    setError(null)
    // Titles already proposed in this session are excluded, so "Altri consigli" brings new ones.
    const exclude = [...list.map((e) => e.media.title), ...suggested.current].slice(-80)
    let picks: AiPick[] | null = null
    let failure: unknown = null
    try { picks = await api<AiPick[]>('/api/ai/recommend', { method: 'POST', json: { type, request: request.trim(), liked, disliked, watching, exclude } }) } catch (e) { failure = e }
    const resolved = (await resolveAll(picks ?? [])).filter(([m]) => !known.has(m.id))
    if (picks) suggested.current.push(...picks.map((p) => p.title))
    setResults(resolved)
    setError(failure ? aiError(failure) : resolved.length === 0 ? 'Nessun titolo adatto questa volta. Prova a riformulare la richiesta.' : null)
    setLoading(false)
  }
  return (
    <div className="fill" style={{ background: 'var(--page)', overflow: 'hidden' }}>
      <AiGlow />
      <div className="fill scroll status-pad">
        <div className="col" style={{ padding: '8px 20px 40px', gap: 16 }}>
          <AiHeader title="Chiedi all'IA" onBack={onDismiss} />
          <div style={{ color: 'var(--muted)', fontSize: 15, lineHeight: '21px' }}>
            {liked.length === 0 ? 'Dimmi cosa ti va e ti propongo qualcosa. Più titoli valuti con “Mi piace”, più i consigli diventano tuoi.'
              : `Consigli basati sui ${liked.length} titoli che ti sono piaciuti e su ciò che mi chiedi.`}
          </div>
          {!configured ? <AiSetupCard onConfiguredChange={setConfigured} /> : (
            <>
              <div style={{ minHeight: 104, borderRadius: 24, background: 'var(--surface)', padding: 16, position: 'relative' }}>
                <div className="fill" style={{ borderRadius: 24, padding: 1, background: 'linear-gradient(135deg, rgba(165,123,255,.5), rgba(215,20,43,.3))', WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none' }} />
                <textarea className="field" rows={3} value={request} maxLength={300} enterKeyHint="send" style={{ caretColor: 'var(--violet)', position: 'relative' }}
                  placeholder="Cosa ti va stasera? Ad esempio: qualcosa di leggero, che duri meno di due ore"
                  onChange={(e) => setRequest(e.target.value.slice(0, 300))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask() } }} />
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {['Qualcosa di leggero', 'Un thriller che non mi aspetto', 'Una serie breve', 'Da vedere in coppia', 'Un classico da recuperare'].map((idea) => (
                  <Chip key={idea} small label={idea} active={request === idea} onClick={() => setRequest(idea)} />
                ))}
              </div>
              <SegmentedPills options={['Tutto', 'Film', 'Serie TV']} selected={['all', 'movie', 'tv'].indexOf(type)} height={42} onSelect={(i) => setType(['all', 'movie', 'tv'][i])} />
              <AiButton busy={loading} label={loading ? 'Sto pensando ai tuoi gusti…' : results.length === 0 ? 'Consigliami' : 'Altri consigli'} onClick={() => void ask()} />
              {error && <div style={{ color: 'var(--dislike)', fontSize: 14, textAlign: 'center' }}>{error}</div>}
              {loading ? [0, 1, 2].map((i) => <ResultSkeleton key={i} />)
                : results.map(([media, reason], index) => (
                  <Reveal key={media.id} delay={index * 70} distance={24}><AiResultCard media={media} reason={reason} onOpen={onOpen} /></Reveal>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** "Simili secondo l'IA" in a title's detail: asks Workers AI for related films and series on demand. */
export function AiSimilarSection({ media, onOpen }: { media: Media; onOpen: OpenMedia }) {
  const { data } = useStore()
  const configured = data?.ai.configured === true
  const [setupVisible, setSetupVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const suggested = useRef<string[]>([])
  const ask = async () => {
    if (!configured) { setSetupVisible(true); return }
    if (loading) return
    setLoading(true)
    setError(null)
    const list = entries()
    const liked = list.filter((e) => e.liked === true).map((e) => e.media.title).slice(0, 15)
    // Titles already proposed for this one are excluded, so "Altri simili" brings new ones.
    const exclude = [...list.filter((e) => e.state === 'watched').map((e) => e.media.title), ...suggested.current].slice(-60)
    const year = /^\d+$/.test(media.year) ? media.year : ''
    let picks: AiPick[] | null = null
    let failure: unknown = null
    try {
      picks = await api<AiPick[]>('/api/ai/similar', { method: 'POST', json: { title: media.originalTitle.trim() || media.title, year, type: media.mediaType, genres: media.genres, liked, exclude } })
    } catch (e) { failure = e }
    const resolved = (await resolveAll(picks ?? [])).filter(([c]) => c.id !== media.id && !results.some(([r]) => r.id === c.id))
    if (picks) suggested.current.push(...picks.map((p) => p.title))
    setResults((r) => [...r, ...resolved])
    setError(failure ? aiError(failure) : resolved.length === 0 ? 'Nessun nuovo titolo simile trovato questa volta. Riprova.' : null)
    setLoading(false)
  }
  return (
    <motion.div layout transition={tween(320, emphasized)} className="col" style={{ padding: '8px 20px', gap: 12 }}>
      <span className="t-title-large" style={{ color: 'var(--ink)' }}>Simili secondo l'IA</span>
      <span style={{ color: 'var(--muted)', fontSize: 14, lineHeight: '20px' }}>Film e serie che condividono atmosfera, temi e tono di “{media.title}”, con il motivo di ogni scelta.</span>
      {results.map(([item, reason], index) => (
        <Reveal key={item.id} delay={(index % 8) * 70} distance={24}><AiResultCard media={item} reason={reason} onOpen={onOpen} /></Reveal>
      ))}
      {loading && [0, 1].map((i) => <ResultSkeleton key={i} lines={3} />)}
      {error && <div style={{ color: 'var(--dislike)', fontSize: 14, textAlign: 'center' }}>{error}</div>}
      {setupVisible && !configured
        ? <AiSetupCard onConfiguredChange={(ready) => { if (ready) { setSetupVisible(false); window.setTimeout(() => void ask(), 0) } }} />
        : <AiButton busy={loading} height={54} label={loading ? 'Cerco titoli simili…' : results.length === 0 ? "Trova simili con l'IA" : 'Altri simili'} onClick={() => void ask()} />}
    </motion.div>
  )
}

// --- Ritrova un titolo ------------------------------------------------------------------------

/** One question of the "Ritrova un titolo" guide; "Non ricordo" answers are not sent to the AI. */
type Step = { question: string; hint: string; options: string[]; multiple?: boolean; placeholder?: string; required?: boolean }
const DONT_REMEMBER = 'Non ricordo'
const STEPS: Step[] = [
  { question: 'È un film o una serie TV?', hint: 'Partiamo dalle basi.', options: ['Film', 'Serie TV', DONT_REMEMBER] },
  { question: 'Più o meno di quando è?', hint: "Va bene anche un'idea approssimativa.", options: ['Recente (dal 2020)', 'Anni 2010', 'Anni 2000', "Anni '90", 'Prima del 1990', DONT_REMEMBER] },
  { question: 'Che genere era?', hint: 'Puoi sceglierne più di uno.', options: ['Azione', 'Commedia', 'Drammatico', 'Thriller', 'Horror', 'Fantascienza', 'Fantasy', 'Animazione', 'Romantico', 'Crime', 'Avventura', 'Guerra', DONT_REMEMBER], multiple: true },
  { question: 'Da dove veniva?', hint: 'Il paese o la lingua originale.', options: ['Italia', 'Stati Uniti', 'Regno Unito', 'Altro paese europeo', 'Asia', DONT_REMEMBER] },
  { question: 'Cosa ricordi della trama?', hint: 'Racconta con parole tue, anche pochi dettagli aiutano.', options: [], placeholder: 'Es. un uomo rivive sempre la stessa giornata e cerca di uscirne…', required: true },
  { question: 'Qualche altro dettaglio?', hint: 'Facoltativo: attori, una scena, un luogo, il finale, la locandina.', options: [], placeholder: "Es. c'era un attore biondo, una scena sotto la pioggia…" },
]

export function FindTitleScreen({ onDismiss, onOpen }: { onDismiss: () => void; onOpen: OpenMedia }) {
  const { data } = useStore()
  const [configured, setConfigured] = useState(data?.ai.configured === true)
  const [step, setStep] = useState(0)
  const [selections, setSelections] = useState<Record<number, string[]>>({})
  const [texts, setTexts] = useState<Record<number, string>>({})
  // Answers to the AI's own follow-up questions, added after each "Non è nessuno di questi".
  const followUps = useRef<[string, string][]>([])
  const excluded = useRef<string[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>([])
  const [followText, setFollowText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [direction, setDirection] = useState(1)
  const done = step >= STEPS.length
  const clues = (): [string, string][] => [
    ...STEPS.map((item, index): [string, string] | null => {
      const answer = [...(selections[index] ?? []).filter((s) => s !== DONT_REMEMBER), ...((texts[index] ?? '').trim() ? [(texts[index] ?? '').trim()] : [])].join(', ')
      return answer === '' ? null : [item.question, answer]
    }).filter((c): c is [string, string] => c != null),
    ...followUps.current,
  ]
  const search = async () => {
    if (loading) return
    ;(document.activeElement as HTMLElement | null)?.blur()
    setLoading(true)
    setError(null)
    let found: { picks: AiPick[]; question: string; options: string[] } | null = null
    let failure: unknown = null
    try { found = await api('/api/ai/identify', { method: 'POST', json: { clues: clues(), exclude: excluded.current } }) } catch (e) { failure = e }
    const resolved = await resolveAll(found?.picks ?? [])
    if (found) excluded.current.push(...found.picks.map((p) => p.title))
    setResults(resolved)
    setQuestion(found?.question ?? '')
    setOptions(found?.options ?? [])
    setFollowText('')
    setError(failure ? aiError(failure) : resolved.length === 0 ? 'Non ho trovato titoli adatti. Rispondi alla domanda qui sotto o aggiungi altri dettagli.' : null)
    setLoading(false)
  }
  const answerFollowUp = (answer: string) => {
    if (answer.trim() === '') return
    followUps.current.push([question.trim() || 'Altro dettaglio', answer.trim()])
    void search()
  }
  const restart = () => {
    setStep(0); setSelections({}); setTexts({}); followUps.current = []; excluded.current = []
    setResults([]); setQuestion(''); setOptions([]); setError(null)
  }
  const go = (next: number) => { setDirection(next > step ? 1 : -1); setStep(next) }
  useBackHandler(true, () => {
    if (step > 0 && !done) go(step - 1)
    else if (done && !loading) go(STEPS.length - 1)
    else onDismiss()
  })
  const current = STEPS[Math.min(step, STEPS.length - 1)]
  const selected = selections[step] ?? []
  const text = texts[step] ?? ''
  const canContinue = current.required ? text.trim() !== '' : true
  const last = step === STEPS.length - 1
  return (
    <div className="fill" style={{ background: 'var(--page)', overflow: 'hidden' }}>
      <AiGlow />
      <div className="fill scroll status-pad">
        <div className="col" style={{ padding: '8px 20px 40px', gap: 16 }}>
          <AiHeader title={FIND_TITLE} onBack={onDismiss} trailing={configured && (step > 0 || done) ? (
            <span onClick={() => { if (!loading) restart() }} style={{ color: 'var(--violet)', fontWeight: 700, fontSize: 14, padding: '8px 10px', cursor: 'pointer' }}>Ricomincia</span>
          ) : null} />
          {!configured ? (
            <>
              <div style={{ color: 'var(--muted)', fontSize: 15, lineHeight: '21px' }}>Rispondi a qualche domanda semplice e l'IA prova a indovinare il film o la serie che hai in mente. Prima collega il tuo account Cloudflare.</div>
              <AiSetupCard onConfiguredChange={setConfigured} />
            </>
          ) : !done ? (
            <>
              <div className="col">
                <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>Domanda {step + 1} di {STEPS.length}</span>
                <LinearProgress value={(step + 1) / STEPS.length} color="var(--violet)" style={{ marginTop: 8 }} />
              </div>
              <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                <motion.div key={step} className="col" style={{ gap: 14 }}
                  initial={{ opacity: 0, x: '20%' }} animate={{ opacity: 1, x: 0, transition: { opacity: tween(260, undefined, 60), x: tween(380, emphasized) } }}
                  exit={{ opacity: 0, transition: tween(140) }}>
                  <span className="t-headline-small" style={{ color: 'var(--ink)', fontWeight: 800 }}>{STEPS[step].question}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 15, lineHeight: '21px' }}>{STEPS[step].hint}</span>
                  {STEPS[step].options.length > 0 && (
                    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                      {STEPS[step].options.map((option) => {
                        const active = selected.includes(option)
                        return (
                          <Chip key={option} label={option} active={active} onClick={() => {
                            const shown = STEPS[step]
                            const next = !shown.multiple ? (active ? [] : [option])
                              : option === DONT_REMEMBER ? (active ? [] : [option])
                                : active ? selected.filter((s) => s !== option) : [...selected.filter((s) => s !== DONT_REMEMBER), option]
                            setSelections({ ...selections, [step]: next })
                            // Single-choice questions move on by themselves.
                            if (!shown.multiple && !active) go(step + 1)
                          }} />
                        )
                      })}
                    </div>
                  )}
                  {STEPS[step].placeholder && (
                    <div style={{ minHeight: 120, borderRadius: 24, background: 'var(--surface)', padding: 16, position: 'relative' }}>
                      <div className="fill" style={{ borderRadius: 24, padding: 1, background: 'linear-gradient(135deg, rgba(165,123,255,.5), rgba(215,20,43,.3))', WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none' }} />
                      <textarea className="field" rows={4} value={text} placeholder={STEPS[step].placeholder} style={{ caretColor: 'var(--violet)', position: 'relative' }}
                        onChange={(e) => setTexts({ ...texts, [step]: e.target.value.slice(0, 400) })} />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
              <div className="row" style={{ gap: 10 }}>
                {step > 0 && (
                  <Press pressed={0.97} onClick={() => go(step - 1)} className="center" style={{ flex: 1, height: 54, borderRadius: 27, boxShadow: 'inset 0 0 0 1px var(--outline-strong)', color: 'var(--primary)', fontSize: 14, fontWeight: 700 }}>Indietro</Press>
                )}
                <Press pressed={canContinue ? 0.97 : 1} disabled={!canContinue} onClick={() => { if (last) { go(step + 1); void search() } else go(step + 1) }} className="row center"
                  style={{ flex: step > 0 ? 1.6 : 1, height: 54, borderRadius: 27, gap: 8, background: canContinue ? 'linear-gradient(135deg, #A57BFF, #D7142B)' : 'var(--raised)', color: canContinue ? '#fff' : 'var(--muted)' }}>
                  {last && <Icon name="sparkles" size={20} />}
                  <span style={{ fontWeight: 700, fontSize: 16 }}>
                    {last ? 'Trova il titolo' : current.required || current.multiple || selected.length > 0 || text.trim() !== '' ? 'Avanti' : 'Salta'}
                  </span>
                </Press>
              </div>
            </>
          ) : (
            <>
              <div style={{ color: 'var(--muted)', fontSize: 15, lineHeight: '21px', minHeight: 21 }}>
                {loading ? 'Sto ripensando ai tuoi indizi…' : results.length > 0 ? 'Forse cercavi uno di questi. Tocca quello giusto per aprirlo.' : ''}
              </div>
              {loading ? [0, 1, 2].map((i) => <ResultSkeleton key={i} lines={3} />)
                : results.map(([media, reason], index) => <Reveal key={media.id} delay={index * 70} distance={24}><AiResultCard media={media} reason={reason} onOpen={onOpen} /></Reveal>)}
              {error && <div style={{ color: 'var(--dislike)', fontSize: 14, textAlign: 'center' }}>{error}</div>}
              {!loading && (
                <div className="col" style={{ background: 'var(--surface)', borderRadius: 24, boxShadow: 'inset 0 0 0 1px var(--outline)', padding: 18, gap: 12 }}>
                  <span className="t-title-large" style={{ color: 'var(--ink)' }}>{results.length === 0 ? 'Proviamo ancora' : 'Non è nessuno di questi?'}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 15, lineHeight: '21px' }}>{question.trim() || 'Aggiungi un dettaglio che ricordi: un attore, una scena, un luogo.'}</span>
                  {options.length > 0 && (
                    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                      {options.map((option) => (
                        <Press key={option} pressed={0.95} onClick={() => answerFollowUp(option)}
                          style={{ borderRadius: 999, background: 'var(--raised)', boxShadow: 'inset 0 0 0 1px rgba(165,123,255,.4)', padding: '9px 14px', color: 'var(--ink)', fontSize: 13, fontWeight: 600, lineHeight: '18px' }}>{option}</Press>
                      ))}
                    </div>
                  )}
                  <input className="outlined" value={followText} placeholder="Oppure scrivi tu…" enterKeyHint="search" style={{ background: 'transparent' }}
                    onChange={(e) => setFollowText(e.target.value.slice(0, 300))} onKeyDown={(e) => { if (e.key === 'Enter') answerFollowUp(followText) }} />
                  <Press pressed={followText.trim() ? 0.97 : 1} disabled={!followText.trim()} onClick={() => answerFollowUp(followText)} className="center"
                    style={{ height: 50, borderRadius: 25, background: followText.trim() ? 'var(--violet)' : 'rgba(247,245,243,.12)', color: followText.trim() ? '#fff' : 'rgba(247,245,243,.38)', fontWeight: 700, fontSize: 14 }}>
                    Cerca ancora
                  </Press>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
