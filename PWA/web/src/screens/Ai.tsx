// The AI assistant: shared pieces, the setup card, "Simili secondo l'IA", "Ti piacerà?" and "Ritrova un titolo".
// The two hubs live in AiChat.tsx (conversation) and AiTools.tsx (tabs); Settings picks which one opens.
// Everything runs on the server with the account's own Cloudflare credentials (server/src/ai.ts),
// which answers with real TMDB titles: nothing needs to be matched here.
import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import type { Media } from '../../../shared/model.ts'
import { isSeries } from '../../../shared/model.ts'
import type { AiAnswer, AiResult, AiTvResult, AiVerdict } from '../../../shared/ai.ts'
import { timeRome } from '../../../shared/dates.ts'
import { api, ApiError } from '../lib/api.ts'
import { useBackHandler } from '../lib/back.ts'
import { refresh, useStore } from '../lib/store.ts'
import { emphasized, spring, tween } from '../components/motion.ts'
import { Icon, LinearProgress, LoadingSkeleton, Press, RemoteImage, Reveal, Spinner, TextButton } from '../components/ui.tsx'
import { ArtworkImage, artSource, posterUrl, FIND_TITLE, type OpenMedia } from '../components/cards.tsx'

export type { AiAnswer, AiResult, AiTvResult, AiVerdict }

const AI_FAILED = "Non riesco a contattare l'IA. Controlla la connessione e riprova."
export const aiError = (e: unknown) => (e instanceof ApiError && e.status !== 0 ? e.message : AI_FAILED)
export const AI_GRADIENT = 'linear-gradient(135deg, #A57BFF, #D7142B)'

/** POST /api/ai/<name>. */
export const aiCall = <T,>(name: string, body: unknown) => api<T>('/api/ai/' + name, { method: 'POST', json: body })

// --- which hub opens: saved per device, like the skin ---------------------------------------------

export type AiHubStyle = 'chat' | 'tabs'
const HUB_KEY = 'streamwise-ai-hub'
const hubListeners = new Set<() => void>()
let hubStyle: AiHubStyle = localStorage.getItem(HUB_KEY) === 'tabs' ? 'tabs' : 'chat'
export function setAiHubStyle(next: AiHubStyle) {
  hubStyle = next
  localStorage.setItem(HUB_KEY, next)
  hubListeners.forEach((l) => l())
}
export const useAiHubStyle = () => useSyncExternalStore((l) => { hubListeners.add(l); return () => hubListeners.delete(l) }, () => hubStyle)

// --- building blocks ---------------------------------------------------------------------------

export function ResultSkeleton({ lines = 4 }: { lines?: number }) {
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

/** A title the AI picked: poster, type and year, the reason, and the user's services that include it. */
export function AiResultCard({ media, reason, providers = [], onOpen }: { media: Media; reason: string; providers?: AiResult['providers']; onOpen: OpenMedia }) {
  const art = useRef<HTMLDivElement | null>(null)
  return (
    <Press className="glass row" style={{ borderRadius: 22, padding: 10, alignItems: 'flex-start' }} onClick={() => onOpen(media, artSource(art.current, posterUrl(media), 14))}>
      <ArtworkImage media={media} corner={14} style={{ width: 84, height: 124, flex: 'none' }} onEl={(el) => { art.current = el }} />
      <div className="grow col" style={{ padding: '2px 4px 0 14px', minWidth: 0 }}>
        <span style={{ color: 'var(--accent)', fontSize: 10, fontWeight: 900, letterSpacing: 1.2, lineHeight: '14px' }}>
          {isSeries(media) ? 'SERIE TV' : 'FILM'} · {media.year}{media.rating > 0 ? ` · ★ ${media.rating.toFixed(1).replace('.', ',')}` : ''}
        </span>
        <span className="clamp2" style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 800, marginTop: 2, lineHeight: '22px' }}>{media.title}</span>
        {reason.trim() !== '' && (
          <div className="row" style={{ marginTop: 6, alignItems: 'flex-start' }}>
            <Icon name="sparkles" size={14} color="var(--violet)" style={{ marginTop: 2, flex: 'none' }} />
            <span style={{ marginLeft: 6, color: 'var(--muted)', fontSize: 13, lineHeight: '18px', fontStyle: 'italic' }}>{reason}</span>
          </div>
        )}
        {providers.length > 0 && (
          <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
            {providers.slice(0, 3).map((p) => (
              <span key={p.id} className="row" style={{ gap: 5, borderRadius: 999, background: 'var(--raised)', padding: '3px 9px 3px 3px', fontSize: 11, fontWeight: 700, color: 'var(--ink)', lineHeight: '16px' }}>
                {p.logo ? <RemoteImage url={p.logo} style={{ width: 18, height: 18, borderRadius: 5 }} /> : <Icon name="play" size={14} />}
                {p.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </Press>
  )
}

/** A programme on TV tonight that the AI picked; opens the title when TMDB recognized it. */
export function AiTvCard({ item, onOpen }: { item: AiTvResult; onOpen: OpenMedia }) {
  const art = useRef<HTMLDivElement | null>(null)
  const { programme, media, reason } = item
  const image = media ? posterUrl(media) : programme.image
  return (
    <Press className="glass row" pressed={media ? 0.97 : 1} style={{ borderRadius: 22, padding: 10, alignItems: 'flex-start' }}
      onClick={() => { if (media) onOpen(media, artSource(art.current, posterUrl(media), 14)) }}>
      <div ref={art} style={{ width: 84, height: 124, flex: 'none', borderRadius: 14, overflow: 'hidden', position: 'relative', background: 'var(--raised)' }}>
        {image ? <RemoteImage url={image} style={{ position: 'absolute', inset: 0 }} /> : <div className="fill center"><Icon name="tv" size={30} color="var(--muted)" /></div>}
      </div>
      <div className="grow col" style={{ padding: '2px 4px 0 14px', minWidth: 0 }}>
        <span style={{ color: 'var(--accent)', fontSize: 10, fontWeight: 900, letterSpacing: 1.2, lineHeight: '14px' }}>
          ORE {timeRome(programme.start)} · {programme.channel.toUpperCase()}
        </span>
        <span className="clamp2" style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 800, marginTop: 2, lineHeight: '22px' }}>{media?.title ?? programme.title}</span>
        {reason !== '' && (
          <div className="row" style={{ marginTop: 6, alignItems: 'flex-start' }}>
            <Icon name="sparkles" size={14} color="var(--violet)" style={{ marginTop: 2, flex: 'none' }} />
            <span style={{ marginLeft: 6, color: 'var(--muted)', fontSize: 13, lineHeight: '18px', fontStyle: 'italic' }}>{reason}</span>
          </div>
        )}
      </div>
    </Press>
  )
}

/** The results of an answer, revealed one after the other. */
export function AiResults({ answer, onOpen }: { answer: AiAnswer; onOpen: OpenMedia }) {
  return (
    <div className="col" style={{ gap: 12 }}>
      {(answer.tv ?? []).map((item, index) => (
        <Reveal key={item.programme.channel + item.programme.start} delay={index * 70} distance={24}><AiTvCard item={item} onOpen={onOpen} /></Reveal>
      ))}
      {answer.results.map((r, index) => (
        <Reveal key={r.media.id} delay={index * 70} distance={24}><AiResultCard media={r.media} reason={r.reason} providers={r.providers} onOpen={onOpen} /></Reveal>
      ))}
    </div>
  )
}

export function AiHeader({ title, onBack, trailing }: { title: string; onBack: () => void; trailing?: ReactNode }) {
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

export function AiGlow() {
  return <div style={{ position: 'absolute', top: -90, right: -90, width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle, rgba(165,123,255,.22), transparent 70%)', pointerEvents: 'none' }} />
}

export function Chip({ label, active = false, onClick, small = false, icon }: { label: string; active?: boolean; onClick: () => void; small?: boolean; icon?: Parameters<typeof Icon>[0]['name'] }) {
  return (
    <Press pressed={0.95} onClick={onClick} className="row" style={{
      gap: 6, borderRadius: 999, background: active ? 'rgba(165,123,255,.22)' : 'var(--raised)', boxShadow: `inset 0 0 0 1px ${active ? 'var(--violet)' : 'rgba(255,255,255,.06)'}`,
      padding: small ? '8px 14px' : '10px 16px', color: active ? '#fff' : 'rgba(247,245,243,.85)', fontSize: small ? 13 : 14, fontWeight: 600, lineHeight: '20px', flex: 'none',
    }}>{icon && <Icon name={icon} size={16} color="var(--violet)" />}{label}</Press>
  )
}

export function AiButton({ busy, label, onClick, icon = true, height = 56, disabled }: { busy: boolean; label: string; onClick: () => void; icon?: boolean; height?: number; disabled?: boolean }) {
  return (
    <Press pressed={busy || disabled ? 1 : 0.97} disabled={busy || disabled} onClick={onClick} className="row center"
      style={{ height, borderRadius: height / 2, gap: 10, color: '#fff', background: disabled ? 'var(--raised)' : AI_GRADIENT, boxShadow: disabled ? 'none' : '0 7px 14px rgba(165,123,255,.35)' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={label} className="row" style={{ gap: 10 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(220)}>
          {busy ? <Spinner size={20} stroke={2} color="#fff" /> : icon ? <Icon name="sparkles" size={21} /> : null}
          <span style={{ fontWeight: 700, fontSize: 16 }}>{label}</span>
        </motion.div>
      </AnimatePresence>
    </Press>
  )
}

/** A text area with the AI's gradient outline. */
export function AiTextArea({ value, onChange, placeholder, rows = 3, onSubmit, max = 300 }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number; onSubmit?: () => void; max?: number }) {
  return (
    <div style={{ minHeight: rows * 22 + 38, borderRadius: 24, background: 'var(--surface)', padding: 16, position: 'relative' }}>
      <div className="fill" style={{ borderRadius: 24, padding: 1, background: 'linear-gradient(135deg, rgba(165,123,255,.5), rgba(215,20,43,.3))', WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none' }} />
      <textarea className="field" rows={rows} value={value} maxLength={max} enterKeyHint={onSubmit ? 'send' : undefined} placeholder={placeholder} style={{ caretColor: 'var(--violet)', position: 'relative' }}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        onKeyDown={(e) => { if (onSubmit && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() } }} />
    </div>
  )
}

export const ErrorText = ({ text }: { text: string | null }) => (text ? <div style={{ color: 'var(--dislike)', fontSize: 14, textAlign: 'center', lineHeight: '20px' }}>{text}</div> : null)

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
        L'assistente IA usa Workers AI di Cloudflare con il tuo account personale. Il piano gratuito include una quota giornaliera di richieste, più che sufficiente per l'uso quotidiano, senza carta di credito.
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


// --- in a title's detail --------------------------------------------------------------------------

/** "Simili secondo l'IA": TMDB's related titles, ranked and explained by the AI, on demand. */
export function AiSimilarSection({ media, onOpen }: { media: Media; onOpen: OpenMedia }) {
  const { data } = useStore()
  const configured = data?.ai.configured === true
  const [setupVisible, setSetupVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<AiResult[]>([])
  const ask = async () => {
    if (!configured) { setSetupVisible(true); return }
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      // Titles already proposed for this one are excluded, so "Altri simili" brings new ones.
      const answer = await aiCall<AiAnswer>('similar', { media, exclude: results.map((r) => r.media.id) })
      setResults((r) => [...r, ...answer.results])
      if (answer.results.length === 0) setError('Nessun nuovo titolo simile trovato questa volta. Riprova.')
    } catch (e) { setError(aiError(e)) }
    setLoading(false)
  }
  return (
    <motion.div layout transition={tween(320, emphasized)} className="col" style={{ padding: '8px 20px', gap: 12 }}>
      <span className="t-title-large" style={{ color: 'var(--ink)' }}>Simili secondo l'IA</span>
      <span style={{ color: 'var(--muted)', fontSize: 14, lineHeight: '20px' }}>Titoli che condividono atmosfera, temi e tono di “{media.title}”, con il motivo di ogni scelta e dove vederli.</span>
      {results.map((r, index) => (
        <Reveal key={r.media.id} delay={(index % 8) * 70} distance={24}><AiResultCard media={r.media} reason={r.reason} providers={r.providers} onOpen={onOpen} /></Reveal>
      ))}
      {loading && [0, 1].map((i) => <ResultSkeleton key={i} lines={3} />)}
      <ErrorText text={error} />
      {setupVisible && !configured
        ? <AiSetupCard onConfiguredChange={(ready) => { if (ready) { setSetupVisible(false); window.setTimeout(() => void ask(), 0) } }} />
        : <AiButton busy={loading} height={54} label={loading ? 'Cerco titoli simili…' : results.length === 0 ? "Trova simili con l'IA" : 'Altri simili'} onClick={() => void ask()} />}
    </motion.div>
  )
}

/** A ring with the match score. */
export function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = size / 2 - 5
  const c = 2 * Math.PI * r
  const color = score >= 70 ? 'var(--like)' : score >= 45 ? 'var(--violet)' : 'var(--dislike)'
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--raised)" strokeWidth={6} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={6} fill="none" strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score / 100) }} transition={tween(900, emphasized)} />
      </svg>
      <div className="fill center" style={{ color: 'var(--ink)', fontWeight: 900, fontSize: size / 3.6 }}>{score}%</div>
    </div>
  )
}

/** "Ti piacerà?": an honest verdict on how well this title fits the user's taste. */
export function AiVerdictSection({ media }: { media: Media }) {
  const { data } = useStore()
  const configured = data?.ai.configured === true
  const [setupVisible, setSetupVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<AiVerdict | null>(null)
  const ask = async () => {
    if (!configured) { setSetupVisible(true); return }
    if (loading) return
    setLoading(true)
    setError(null)
    try { setVerdict(await aiCall<AiVerdict>('why', { media })) } catch (e) { setError(aiError(e)) }
    setLoading(false)
  }
  return (
    <motion.div layout transition={tween(320, emphasized)} className="col" style={{ padding: '8px 20px', gap: 12 }}>
      {verdict ? (
        <Reveal distance={16}>
          <div className="col" style={{ background: 'var(--surface)', borderRadius: 24, boxShadow: 'inset 0 0 0 1px rgba(165,123,255,.45)', padding: 18, gap: 12 }}>
            <div className="row" style={{ gap: 14 }}>
              <ScoreRing score={verdict.score} />
              <div className="grow col">
                <span style={{ color: 'var(--violet)', fontSize: 11, fontWeight: 900, letterSpacing: 1.5 }}>TI PIACERÀ?</span>
                <span style={{ color: 'var(--ink)', fontSize: 15, lineHeight: '21px', fontWeight: 600, marginTop: 2 }}>{verdict.verdict}</span>
              </div>
            </div>
            {verdict.pros.map((p) => <span key={p} className="row" style={{ gap: 8, color: 'var(--ink)', fontSize: 14, lineHeight: '19px' }}><Icon name="check" size={18} color="var(--like)" style={{ flex: 'none' }} />{p}</span>)}
            {verdict.cons.map((p) => <span key={p} className="row" style={{ gap: 8, color: 'var(--muted)', fontSize: 14, lineHeight: '19px' }}><Icon name="close" size={18} color="var(--dislike)" style={{ flex: 'none' }} />{p}</span>)}
          </div>
        </Reveal>
      ) : setupVisible && !configured ? (
        <AiSetupCard onConfiguredChange={(ready) => { if (ready) { setSetupVisible(false); window.setTimeout(() => void ask(), 0) } }} />
      ) : (
        <Press pressed={loading ? 1 : 0.97} onClick={() => void ask()} className="row" style={{ background: 'var(--surface)', borderRadius: 24, boxShadow: 'inset 0 0 0 1px rgba(165,123,255,.45)', padding: 16, gap: 14 }}>
          <div className="center" style={{ width: 46, height: 46, borderRadius: '50%', background: AI_GRADIENT, flex: 'none' }}>
            {loading ? <Spinner size={20} stroke={2} color="#fff" /> : <Icon name="sparkles" size={22} color="#fff" />}
          </div>
          <div className="grow col">
            <span style={{ color: 'var(--ink)', fontWeight: 800, fontSize: 16 }}>{loading ? 'Ci penso un attimo…' : 'Ti piacerà?'}</span>
            <span style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '18px' }}>L'IA lo confronta con i tuoi gusti e ti dice pro e contro, senza spoiler</span>
          </div>
        </Press>
      )}
      <ErrorText text={error} />
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

/** The guided questions, then candidates checked on TMDB and the AI's own follow-up question. */
export function FindTitleFlow({ onOpen, onBackAtStart, restartRef }: { onOpen: OpenMedia; onBackAtStart?: () => void; restartRef?: React.MutableRefObject<(() => void) | null> }) {
  const [step, setStep] = useState(0)
  const [selections, setSelections] = useState<Record<number, string[]>>({})
  const [texts, setTexts] = useState<Record<number, string>>({})
  // Answers to the AI's own follow-up questions, added after each "Non è nessuno di questi".
  const followUps = useRef<[string, string][]>([])
  const excluded = useRef<string[]>([])
  const [answer, setAnswer] = useState<AiAnswer | null>(null)
  const [followText, setFollowText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = step >= STEPS.length
  const clues = (): [string, string][] => [
    ...STEPS.map((item, index): [string, string] | null => {
      const value = [...(selections[index] ?? []).filter((s) => s !== DONT_REMEMBER), ...((texts[index] ?? '').trim() ? [(texts[index] ?? '').trim()] : [])].join(', ')
      return value === '' ? null : [item.question, value]
    }).filter((c): c is [string, string] => c != null),
    ...followUps.current,
  ]
  const search = async () => {
    if (loading) return
    ;(document.activeElement as HTMLElement | null)?.blur()
    setLoading(true)
    setError(null)
    try {
      const found = await aiCall<AiAnswer>('identify', { clues: clues(), exclude: excluded.current })
      excluded.current.push(...found.results.map((r) => r.media.originalTitle || r.media.title))
      setAnswer(found)
      if (found.results.length === 0) setError('Non ho trovato titoli adatti. Rispondi alla domanda qui sotto o aggiungi altri dettagli.')
    } catch (e) { setError(aiError(e)) }
    setFollowText('')
    setLoading(false)
  }
  const answerFollowUp = (value: string) => {
    if (value.trim() === '') return
    followUps.current.push([answer?.question?.trim() || 'Altro dettaglio', value.trim()])
    void search()
  }
  const restart = () => {
    setStep(0); setSelections({}); setTexts({}); followUps.current = []; excluded.current = []
    setAnswer(null); setError(null)
  }
  if (restartRef) restartRef.current = loading ? null : step > 0 || done ? restart : null
  useBackHandler(step > 0, () => {
    if (step > 0 && !done) setStep(step - 1)
    else if (done && !loading) setStep(STEPS.length - 1)
    else onBackAtStart?.()
  })
  const current = STEPS[Math.min(step, STEPS.length - 1)]
  const selected = selections[step] ?? []
  const text = texts[step] ?? ''
  const canContinue = current.required ? text.trim() !== '' : true
  const last = step === STEPS.length - 1
  if (!done) return (
    <>
      <div className="col">
        <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>Domanda {step + 1} di {STEPS.length}</span>
        <LinearProgress value={(step + 1) / STEPS.length} color="var(--violet)" style={{ marginTop: 8 }} />
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
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
                    if (!shown.multiple && !active) setStep(step + 1)
                  }} />
                )
              })}
            </div>
          )}
          {STEPS[step].placeholder && <AiTextArea rows={4} max={400} value={text} placeholder={STEPS[step].placeholder!} onChange={(v) => setTexts({ ...texts, [step]: v })} />}
        </motion.div>
      </AnimatePresence>
      <div className="row" style={{ gap: 10 }}>
        {step > 0 && (
          <Press pressed={0.97} onClick={() => setStep(step - 1)} className="center" style={{ flex: 1, height: 54, borderRadius: 27, boxShadow: 'inset 0 0 0 1px var(--outline-strong)', color: 'var(--primary)', fontSize: 14, fontWeight: 700 }}>Indietro</Press>
        )}
        <Press pressed={canContinue ? 0.97 : 1} disabled={!canContinue} onClick={() => { setStep(step + 1); if (last) void search() }} className="row center"
          style={{ flex: step > 0 ? 1.6 : 1, height: 54, borderRadius: 27, gap: 8, background: canContinue ? AI_GRADIENT : 'var(--raised)', color: canContinue ? '#fff' : 'var(--muted)' }}>
          {last && <Icon name="sparkles" size={20} />}
          <span style={{ fontWeight: 700, fontSize: 16 }}>
            {last ? 'Trova il titolo' : current.required || current.multiple || selected.length > 0 || text.trim() !== '' ? 'Avanti' : 'Salta'}
          </span>
        </Press>
      </div>
    </>
  )
  return (
    <>
      <div style={{ color: 'var(--muted)', fontSize: 15, lineHeight: '21px', minHeight: 21 }}>
        {loading ? 'Sto ripensando ai tuoi indizi…' : answer?.intro || (answer && answer.results.length > 0 ? 'Forse cercavi uno di questi. Tocca quello giusto per aprirlo.' : '')}
      </div>
      {loading ? [0, 1, 2].map((i) => <ResultSkeleton key={i} lines={3} />) : answer && <AiResults answer={answer} onOpen={onOpen} />}
      <ErrorText text={error} />
      {!loading && (
        <div className="col" style={{ background: 'var(--surface)', borderRadius: 24, boxShadow: 'inset 0 0 0 1px var(--outline)', padding: 18, gap: 12 }}>
          <span className="t-title-large" style={{ color: 'var(--ink)' }}>{!answer || answer.results.length === 0 ? 'Proviamo ancora' : 'Non è nessuno di questi?'}</span>
          <span style={{ color: 'var(--muted)', fontSize: 15, lineHeight: '21px' }}>{answer?.question?.trim() || 'Aggiungi un dettaglio che ricordi: un attore, una scena, un luogo.'}</span>
          {(answer?.options ?? []).length > 0 && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {answer!.options!.map((option) => <Chip key={option} small label={option} onClick={() => answerFollowUp(option)} />)}
            </div>
          )}
          <input className="outlined" value={followText} placeholder="Oppure scrivi tu…" enterKeyHint="search" style={{ background: 'transparent' }}
            onChange={(e) => setFollowText(e.target.value.slice(0, 300))} onKeyDown={(e) => { if (e.key === 'Enter') answerFollowUp(followText) }} />
          <AiButton busy={false} icon={false} height={50} disabled={!followText.trim()} label="Cerca ancora" onClick={() => answerFollowUp(followText)} />
        </div>
      )}
    </>
  )
}

/** A full page for an AI tool, with the setup card while the AI is not connected. */
export function AiPage({ title, intro, onDismiss, trailing, children }: { title: string; intro: string; onDismiss: () => void; trailing?: ReactNode; children: ReactNode }) {
  const { data } = useStore()
  const [configured, setConfigured] = useState(data?.ai.configured === true)
  return (
    <div className="fill" style={{ background: 'var(--page)', overflow: 'hidden' }}>
      <AiGlow />
      <div className="fill scroll status-pad">
        <div className="col" style={{ padding: '8px 20px 40px', gap: 16 }}>
          <AiHeader title={title} onBack={onDismiss} trailing={configured ? trailing : null} />
          {!configured ? (
            <>
              <div style={{ color: 'var(--muted)', fontSize: 15, lineHeight: '21px' }}>{intro} Prima collega il tuo account Cloudflare: è gratuito.</div>
              <AiSetupCard onConfiguredChange={setConfigured} />
            </>
          ) : children}
        </div>
      </div>
    </div>
  )
}

export function FindTitleScreen({ onDismiss, onOpen }: { onDismiss: () => void; onOpen: OpenMedia }) {
  const restart = useRef<(() => void) | null>(null)
  const [, redraw] = useState(0)
  useBackHandler(true, onDismiss)
  return (
    <AiPage title={FIND_TITLE} intro="Rispondi a qualche domanda semplice e l'IA prova a indovinare il film o la serie che hai in mente." onDismiss={onDismiss}
      trailing={<span onClick={() => { restart.current?.(); redraw((n) => n + 1) }} style={{ color: 'var(--violet)', fontWeight: 700, fontSize: 14, padding: '8px 10px', cursor: 'pointer' }}>Ricomincia</span>}>
      <FindTitleFlow onOpen={onOpen} restartRef={restart} />
    </AiPage>
  )
}

