import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { isSeries, type Media } from '../../../shared/model.ts'
import { FIND_TITLE } from '../components/cards.tsx'
import { emphasized, tween } from '../components/motion.ts'
import {
  alpha, C, GlassIconButton, Icon, LinearProgress, LoadingSkeleton, OutlinedButton, OutlinedField, Pressable, RemoteImage, Reveal,
  SegmentedPills, Spinner, TextButton,
} from '../components/ui.tsx'
import { FALLBACK_ERROR, identify, recommend, resolvePicks, similar } from '../lib/ai.ts'
import { close, useBackHandler } from '../lib/nav.ts'
import { clearAi, getData, setupAi, useData } from '../lib/store.ts'
import { openMedia } from '../lib/ui.ts'

const violetGradient = `linear-gradient(135deg, ${C.violet}, ${C.red})`

const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : FALLBACK_ERROR)

function Glow() {
  return <div style={{ position: 'absolute', top: -90, right: -90, width: 340, height: 340, borderRadius: '50%', background: `radial-gradient(circle, ${alpha(C.violet, 0.22)}, transparent 70%)`, pointerEvents: 'none' }} />
}

function AiHeader({ pageKey, title, trailing }: { pageKey: number; title: string; trailing?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <GlassIconButton icon="back" label="Indietro" onClick={() => close(pageKey)} />
      <div style={{ flex: 1, marginLeft: 14 }}>
        <div style={{ color: C.violet, fontSize: 11, fontWeight: 900, letterSpacing: 1.5 }}>INTELLIGENZA ARTIFICIALE</div>
        <div className="t-headline-medium" style={{ color: C.ink }}>{title}</div>
      </div>
      {trailing}
    </div>
  )
}

function ResultSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="glass" style={{ borderRadius: 22, padding: 10, display: 'flex' }}>
      <LoadingSkeleton style={{ width: 84, height: 124, borderRadius: 14, flex: 'none' }} />
      <div style={{ flex: 1, padding: '6px 0 0 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <LoadingSkeleton style={{ width: '40%', height: 10, borderRadius: 10 }} />
        <LoadingSkeleton style={{ width: '80%', height: 16, borderRadius: 16 }} />
        <LoadingSkeleton style={{ width: '100%', height: 12, borderRadius: 12 }} />
        {lines > 3 && <LoadingSkeleton style={{ width: '70%', height: 12, borderRadius: 12 }} />}
      </div>
    </div>
  )
}

export function AiResultCard({ media, reason, delay = 0 }: { media: Media; reason: string; delay?: number }) {
  const art = useRef<HTMLDivElement>(null)
  return (
    <Reveal delay={delay} distance={24}>
      <Pressable className="glass" onClick={() => openMedia(media, { rect: art.current?.getBoundingClientRect() ?? null, url: media.poster || media.backdrop, corner: 14 })}
        style={{ borderRadius: 22, padding: 10, display: 'flex', alignItems: 'center' }}>
        <div ref={art} style={{ width: 84, height: 124, borderRadius: 14, overflow: 'hidden', flex: 'none' }}><RemoteImage url={media.poster || media.backdrop} style={{ width: '100%', height: '100%' }} /></div>
        <div style={{ flex: 1, padding: '0 4px 0 14px', minWidth: 0 }}>
          <div style={{ color: C.accent, fontSize: 10, fontWeight: 900, letterSpacing: 1.2, lineHeight: '16px' }}>{isSeries(media) ? 'SERIE TV' : 'FILM'} · {media.year}</div>
          <div className="clamp2" style={{ color: C.ink, fontSize: 16, fontWeight: 800, marginTop: 2, lineHeight: '22px' }}>{media.title}</div>
          {reason.trim() && (
            <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: 8 }}>
              <Icon name="sparkles" size={14} color={C.violet} style={{ marginTop: 2 }} />
              <div style={{ marginLeft: 6, color: C.muted, fontSize: 13, lineHeight: '18px', fontStyle: 'italic' }}>{reason.charAt(0).toUpperCase() + reason.slice(1)}</div>
            </div>
          )}
        </div>
      </Pressable>
    </Reveal>
  )
}

/** The violet → red call to action of the AI screens. */
function AiButton({ busy, label, busyLabel, onClick, height = 56, disabled, style }: { busy: boolean; label: string; busyLabel: string; onClick: () => void; height?: number; disabled?: boolean; style?: CSSProperties }) {
  return (
    <Pressable pressed={0.97} onClick={() => { if (!busy && !disabled) onClick() }}
      style={{ height, borderRadius: height, background: violetGradient, boxShadow: `0 6px 14px ${alpha(C.violet, 0.45)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', ...style }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={busy ? 'busy' : 'idle'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(150)} style={{ display: 'flex', alignItems: 'center' }}>
          {busy ? <Spinner size={20} color="#fff" stroke={2} /> : <Icon name="sparkles" size={21} color="#fff" />}
          <span style={{ marginLeft: 10, fontWeight: 700, fontSize: 16, letterSpacing: 0.1 }}>{busy ? busyLabel : label}</span>
        </motion.div>
      </AnimatePresence>
    </Pressable>
  )
}

// --- Chiedi all'IA ----------------------------------------------------------------------------

const IDEAS = ['Qualcosa di leggero', 'Un thriller che non mi aspetto', 'Una serie breve', 'Da vedere in coppia', 'Un classico da recuperare']
const TYPES = ['all', 'movie', 'tv']

export function AiPage({ pageKey }: { pageKey: number }) {
  const { aiConfigured } = useData()
  const [request, setRequest] = useState('')
  const [type, setType] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<[Media, string][]>([])
  const suggested = useRef<string[]>([])
  const entries = useMemo(() => [...getData().library.values()], [])
  const liked = entries.filter((e) => e.liked === true).map((e) => e.media.title).slice(0, 30)
  const disliked = entries.filter((e) => e.liked === false).map((e) => e.media.title).slice(0, 15)
  const watching = entries.filter((e) => e.state === 'progress').map((e) => e.media.title).slice(0, 15)
  const known = new Set(entries.map((e) => e.media.id))
  const ask = async () => {
    if (loading) return
    ;(document.activeElement as HTMLElement | null)?.blur()
    setLoading(true)
    setError(null)
    // Titles already proposed in this session are excluded, so "Altri consigli" brings new ones.
    const exclude = [...entries.map((e) => e.media.title), ...suggested.current].slice(-80)
    let failure: unknown = null
    let picks: Awaited<ReturnType<typeof recommend>> = []
    try { picks = await recommend({ type, request: request.trim(), liked, disliked, watching, exclude }) } catch (e) { failure = e }
    const resolved = (await resolvePicks(picks)).filter(([m]) => !known.has(m.id))
    suggested.current.push(...picks.map((p) => p.title))
    setResults(resolved)
    setError(failure ? errorText(failure) : resolved.length === 0 ? 'Nessun titolo adatto questa volta. Prova a riformulare la richiesta.' : null)
    setLoading(false)
  }
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, overflow: 'hidden' }}>
      <Glow />
      <div className="scroll" style={{ position: 'absolute', inset: 0, paddingTop: 'var(--status-top)' }}>
        <div style={{ padding: '8px 20px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AiHeader pageKey={pageKey} title="Chiedi all'IA" />
          <div style={{ color: C.muted, fontSize: 15, lineHeight: '21px' }}>
            {liked.length === 0 ? 'Dimmi cosa ti va e ti propongo qualcosa. Più titoli valuti con “Mi piace”, più i consigli diventano tuoi.' : `Consigli basati sui ${liked.length} titoli che ti sono piaciuti e su ciò che mi chiedi.`}
          </div>
          {!aiConfigured ? <AiSetupCard /> : (
            <>
              <div style={{ minHeight: 104, borderRadius: 24, background: C.surface, padding: 16, position: 'relative' }}>
                <GradientBorder radius={24} />
                <textarea value={request} onChange={(e) => setRequest(e.target.value.slice(0, 300))} rows={3} enterKeyHint="send"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask() } }}
                  placeholder="Cosa ti va stasera? Ad esempio: qualcosa di leggero, che duri meno di due ore" className="field" style={{ caretColor: C.violet, position: 'relative' }} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {IDEAS.map((idea) => <Choice key={idea} label={idea} active={request === idea} onClick={() => setRequest(idea)} small />)}
              </div>
              <SegmentedPills options={['Tutto', 'Film', 'Serie TV']} selected={TYPES.indexOf(type)} onSelect={(i) => setType(TYPES[i])} height={42} />
              <AiButton busy={loading} label={results.length === 0 ? 'Consigliami' : 'Altri consigli'} busyLabel="Sto pensando ai tuoi gusti…" onClick={() => void ask()} />
              {error && <div style={{ color: C.dislike, fontSize: 14, textAlign: 'center' }}>{error}</div>}
              {loading ? [0, 1, 2].map((i) => <ResultSkeleton key={i} lines={4} />) : results.map(([m, reason], i) => <AiResultCard key={m.id} media={m} reason={reason} delay={i * 70} />)}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function GradientBorder({ radius }: { radius: number }) {
  return <div style={{ position: 'absolute', inset: 0, borderRadius: radius, padding: 1, background: `linear-gradient(135deg, ${alpha(C.violet, 0.5)}, ${alpha(C.red, 0.3)})`, WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude', pointerEvents: 'none' }} />
}

function Choice({ label, active, onClick, small = false, outline }: { label: string; active: boolean; onClick: () => void; small?: boolean; outline?: string }) {
  return (
    <Pressable onClick={() => onClick()}
      style={{ borderRadius: 40, background: active ? alpha(C.violet, 0.22) : C.raised, border: `1px solid ${outline ?? (active ? C.violet : 'rgba(255,255,255,.06)')}`, padding: small ? '8px 14px' : '10px 16px' }}>
      <span style={{ color: active ? '#fff' : alpha(C.ink, 0.85), fontSize: small ? 13 : 14, fontWeight: 600, lineHeight: '20px' }}>{label}</span>
    </Pressable>
  )
}

// --- Ritrova un titolo --------------------------------------------------------------------------

/** One question of the guide; "Non ricordo" answers are not sent to the AI. */
type Step = { question: string; hint: string; options?: string[]; multiple?: boolean; placeholder?: string; required?: boolean }
const DONT_REMEMBER = 'Non ricordo'
const STEPS: Step[] = [
  { question: 'È un film o una serie TV?', hint: 'Partiamo dalle basi.', options: ['Film', 'Serie TV', DONT_REMEMBER] },
  { question: 'Più o meno di quando è?', hint: "Va bene anche un'idea approssimativa.", options: ['Recente (dal 2020)', 'Anni 2010', 'Anni 2000', "Anni '90", 'Prima del 1990', DONT_REMEMBER] },
  { question: 'Che genere era?', hint: 'Puoi sceglierne più di uno.', options: ['Azione', 'Commedia', 'Drammatico', 'Thriller', 'Horror', 'Fantascienza', 'Fantasy', 'Animazione', 'Romantico', 'Crime', 'Avventura', 'Guerra', DONT_REMEMBER], multiple: true },
  { question: 'Da dove veniva?', hint: 'Il paese o la lingua originale.', options: ['Italia', 'Stati Uniti', 'Regno Unito', 'Altro paese europeo', 'Asia', DONT_REMEMBER] },
  { question: 'Cosa ricordi della trama?', hint: 'Racconta con parole tue, anche pochi dettagli aiutano.', placeholder: 'Es. un uomo rivive sempre la stessa giornata e cerca di uscirne…', required: true },
  { question: 'Qualche altro dettaglio?', hint: 'Facoltativo: attori, una scena, un luogo, il finale, la locandina.', placeholder: "Es. c'era un attore biondo, una scena sotto la pioggia…" },
]

export function FindTitlePage({ pageKey }: { pageKey: number }) {
  const { aiConfigured } = useData()
  const [step, setStep] = useState(0)
  const [selections, setSelections] = useState<Record<number, string[]>>({})
  const [texts, setTexts] = useState<Record<number, string>>({})
  const followUps = useRef<[string, string][]>([])
  const excluded = useRef<string[]>([])
  const [results, setResults] = useState<[Media, string][]>([])
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>([])
  const [followText, setFollowText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = step >= STEPS.length

  const clues = (): [string, string][] => [
    ...STEPS.flatMap((item, index): [string, string][] => {
      const answer = [...(selections[index] ?? []).filter((o) => o !== DONT_REMEMBER), ...((texts[index] ?? '').trim() ? [(texts[index] ?? '').trim()] : [])].join(', ')
      return answer ? [[item.question, answer]] : []
    }),
    ...followUps.current,
  ]
  const search = async () => {
    if (loading) return
    ;(document.activeElement as HTMLElement | null)?.blur()
    setLoading(true)
    setError(null)
    let failure: unknown = null
    let identification: Awaited<ReturnType<typeof identify>> | null = null
    try { identification = await identify(clues(), excluded.current) } catch (e) { failure = e }
    const resolved = await resolvePicks(identification?.picks ?? [])
    if (identification) excluded.current.push(...identification.picks.map((p) => p.title))
    setResults(resolved)
    setQuestion(identification?.question ?? '')
    setOptions(identification?.options ?? [])
    setFollowText('')
    setError(failure ? errorText(failure) : resolved.length === 0 ? 'Non ho trovato titoli adatti. Rispondi alla domanda qui sotto o aggiungi altri dettagli.' : null)
    setLoading(false)
  }
  const answerFollowUp = (answer: string) => {
    if (!answer.trim()) return
    followUps.current.push([question.trim() || 'Altro dettaglio', answer.trim()])
    void search()
  }
  const restart = () => {
    setStep(0); setSelections({}); setTexts({}); followUps.current = []; excluded.current = []
    setResults([]); setQuestion(''); setOptions([]); setError(null)
  }
  useBackHandler(step > 0 || (done && !loading), () => {
    if (step > 0 && !done) setStep(step - 1)
    else if (done && !loading) setStep(STEPS.length - 1)
  })

  const current = STEPS[Math.min(step, STEPS.length - 1)]
  const selected = selections[step] ?? []
  const text = texts[step] ?? ''
  const canContinue = current.required ? text.trim() !== '' : true
  const last = step === STEPS.length - 1
  const choose = (index: number, option: string) => {
    const shown = STEPS[index]
    const now = selections[index] ?? []
    const active = now.includes(option)
    const next = !shown.multiple ? (active ? [] : [option])
      : option === DONT_REMEMBER ? (active ? [] : [option])
        : active ? now.filter((o) => o !== option) : [...now.filter((o) => o !== DONT_REMEMBER), option]
    setSelections({ ...selections, [index]: next })
    // Single-choice questions move on by themselves.
    if (!shown.multiple && !active) setStep(index + 1)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.bg, overflow: 'hidden' }}>
      <Glow />
      <div className="scroll" style={{ position: 'absolute', inset: 0, paddingTop: 'var(--status-top)' }}>
        <div style={{ padding: '8px 20px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AiHeader pageKey={pageKey} title={FIND_TITLE} trailing={aiConfigured && (step > 0 || done) ? (
            <Pressable onClick={() => { if (!loading) restart() }} style={{ borderRadius: 40, padding: '8px 10px' }}>
              <span style={{ color: C.violet, fontWeight: 700, fontSize: 14 }}>Ricomincia</span>
            </Pressable>
          ) : null} />
          {!aiConfigured ? (
            <>
              <div style={{ color: C.muted, fontSize: 15, lineHeight: '21px' }}>Rispondi a qualche domanda semplice e l'IA prova a indovinare il film o la serie che hai in mente. Prima collega il tuo account Cloudflare.</div>
              <AiSetupCard />
            </>
          ) : !done ? (
            <>
              <div>
                <div style={{ color: C.muted, fontSize: 13, fontWeight: 600 }}>Domanda {step + 1} di {STEPS.length}</div>
                <LinearProgress value={(step + 1) / STEPS.length} color={C.violet} track={C.raised} style={{ marginTop: 8 }} />
              </div>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div key={step}
                  initial={{ opacity: 0, x: '20%' }} animate={{ opacity: 1, x: 0, transition: { opacity: tween(260, undefined, 60), x: tween(380, emphasized) } }}
                  exit={{ opacity: 0, transition: tween(140) }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="t-headline-small" style={{ color: C.ink, fontWeight: 800 }}>{STEPS[step].question}</div>
                  <div style={{ color: C.muted, fontSize: 15, lineHeight: '21px' }}>{STEPS[step].hint}</div>
                  {STEPS[step].options && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {STEPS[step].options!.map((o) => <Choice key={o} label={o} active={(selections[step] ?? []).includes(o)} onClick={() => choose(step, o)} />)}
                    </div>
                  )}
                  {STEPS[step].placeholder && (
                    <div style={{ minHeight: 120, borderRadius: 24, background: C.surface, padding: 16, position: 'relative' }}>
                      <GradientBorder radius={24} />
                      <textarea value={texts[step] ?? ''} onChange={(e) => setTexts({ ...texts, [step]: e.target.value.slice(0, 400) })} rows={4}
                        placeholder={STEPS[step].placeholder} className="field" style={{ caretColor: C.violet, position: 'relative' }} />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
              <div style={{ display: 'flex', gap: 10 }}>
                {step > 0 && <OutlinedButton onClick={() => setStep(step - 1)} style={{ flex: 1, height: 54 }}>Indietro</OutlinedButton>}
                <Pressable pressed={0.97} onClick={() => { if (!canContinue) return; if (last) { setStep(step + 1); void search() } else setStep(step + 1) }}
                  style={{ flex: step > 0 ? 1.6 : 1, height: 54, borderRadius: 54, background: canContinue ? violetGradient : C.raised, color: canContinue ? '#fff' : C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {last && <Icon name="sparkles" size={20} />}
                  <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.1 }}>
                    {last ? 'Trova il titolo' : current.required || current.multiple || selected.length > 0 || text.trim() ? 'Avanti' : 'Salta'}
                  </span>
                </Pressable>
              </div>
            </>
          ) : (
            <>
              <div style={{ color: C.muted, fontSize: 15, lineHeight: '21px' }}>{loading ? 'Sto ripensando ai tuoi indizi…' : results.length ? 'Forse cercavi uno di questi. Tocca quello giusto per aprirlo.' : ''}</div>
              {loading ? [0, 1, 2].map((i) => <ResultSkeleton key={i} />) : results.map(([m, reason], i) => <AiResultCard key={m.id} media={m} reason={reason} delay={i * 70} />)}
              {error && <div style={{ color: C.dislike, fontSize: 14, textAlign: 'center' }}>{error}</div>}
              {!loading && (
                <div style={{ background: C.panel, borderRadius: 24, border: `1px solid ${C.outline}`, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="t-title-large" style={{ color: C.ink }}>{results.length === 0 ? 'Proviamo ancora' : 'Non è nessuno di questi?'}</div>
                  <div style={{ color: C.muted, fontSize: 15, lineHeight: '21px' }}>{question.trim() || 'Aggiungi un dettaglio che ricordi: un attore, una scena, un luogo.'}</div>
                  {options.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {options.map((o) => <Choice key={o} label={o} active={false} onClick={() => answerFollowUp(o)} small outline={alpha(C.violet, 0.4)} />)}
                    </div>
                  )}
                  <OutlinedField value={followText} onChange={(v) => setFollowText(v.slice(0, 300))} placeholder="Oppure scrivi tu…" enterKeyHint="search" onSubmit={() => answerFollowUp(followText)} />
                  <Pressable pressed={0.97} onClick={() => { if (followText.trim()) answerFollowUp(followText) }}
                    style={{ height: 50, borderRadius: 50, background: followText.trim() ? C.violet : alpha(C.ink, 0.12), color: followText.trim() ? '#fff' : alpha(C.ink, 0.38), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 0.1 }}>Cerca ancora</span>
                  </Pressable>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Simili secondo l'IA (in the detail page) ------------------------------------------------------

export function AiSimilarSection({ media }: { media: Media }) {
  const { aiConfigured } = useData()
  const [setupVisible, setSetupVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<[Media, string][]>([])
  const suggested = useRef<string[]>([])
  const ask = async () => {
    if (!getData().aiConfigured) { setSetupVisible(true); return }
    if (loading) return
    setLoading(true)
    setError(null)
    const entries = [...getData().library.values()]
    const liked = entries.filter((e) => e.liked === true).map((e) => e.media.title).slice(0, 15)
    // Titles already proposed for this one are excluded, so "Altri simili" brings new ones.
    const exclude = [...entries.filter((e) => e.state === 'watched').map((e) => e.media.title), ...suggested.current].slice(-60)
    const year = /^\d+$/.test(media.year) ? media.year : ''
    let failure: unknown = null
    let picks: Awaited<ReturnType<typeof similar>> = []
    try { picks = await similar({ title: media.originalTitle || media.title, year, type: media.mediaType, genres: media.genres, liked, exclude }) } catch (e) { failure = e }
    const resolved = (await resolvePicks(picks)).filter(([c]) => c.id !== media.id && !results.some(([r]) => r.id === c.id))
    suggested.current.push(...picks.map((p) => p.title))
    setResults([...results, ...resolved])
    setError(failure ? errorText(failure) : resolved.length === 0 ? 'Nessun nuovo titolo simile trovato questa volta. Riprova.' : null)
    setLoading(false)
  }
  return (
    <motion.div layout transition={tween(320, emphasized)} style={{ padding: '8px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="t-title-large" style={{ color: C.ink }}>Simili secondo l'IA</div>
      <div style={{ color: C.muted, fontSize: 14, lineHeight: '20px' }}>Film e serie che condividono atmosfera, temi e tono di “{media.title}”, con il motivo di ogni scelta.</div>
      {results.map(([item, reason], i) => <AiResultCard key={item.id} media={item} reason={reason} delay={(i % 8) * 70} />)}
      {loading && [0, 1].map((i) => <ResultSkeleton key={i} />)}
      {error && <div style={{ color: C.dislike, fontSize: 14, textAlign: 'center' }}>{error}</div>}
      {setupVisible && !aiConfigured ? <AiSetupCard onConfigured={() => { setSetupVisible(false); void ask() }} /> : (
        <AiButton busy={loading} label={results.length === 0 ? "Trova simili con l'IA" : 'Altri simili'} busyLabel="Cerco titoli simili…" onClick={() => void ask()} height={54} />
      )}
    </motion.div>
  )
}

// --- AiSetupCard ---------------------------------------------------------------------------------

const CLOUDFLARE_SIGN_UP = 'https://dash.cloudflare.com/sign-up'
const CLOUDFLARE_WORKERS_AI = 'https://dash.cloudflare.com/?to=/:account/ai/workers-ai'
const CLOUDFLARE_API_TOKENS = 'https://dash.cloudflare.com/profile/api-tokens'

const SETUP_STEPS: [string, string | null, string | null][] = [
  ["Crea un account gratuito su Cloudflare, oppure accedi se ce l'hai già.", 'Apri Cloudflare', CLOUDFLARE_SIGN_UP],
  ['Apri Workers AI (menu AI › Workers AI) e tocca “Use REST API”.', 'Apri Workers AI', CLOUDFLARE_WORKERS_AI],
  ["Copia l'Account ID (32 caratteri) e incollalo qui sotto.", null, null],
  ['Tocca “Create a Workers AI API Token”, poi “Create API Token” e copia il token: Cloudflare lo mostra una sola volta. In alternativa: Profilo › API Tokens › Create Token › modello “Workers AI”.', 'Apri API Tokens', CLOUDFLARE_API_TOKENS],
  ['Incolla il token qui sotto e tocca “Verifica e salva”.', null, null],
]

/** Guide and form to connect the account's own Cloudflare Workers AI (Settings and the AI screens). */
export function AiSetupCard({ onConfigured }: { onConfigured?: () => void }) {
  const { aiConfigured: configured } = useData()
  const [accountId, setAccountId] = useState('')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showGuide, setShowGuide] = useState(!configured)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<[string, boolean] | null>(null)
  const verify = async () => {
    if (checking) return
    setChecking(true)
    setMessage(null)
    try {
      await setupAi(accountId, token)
      setShowGuide(false)
      setToken('')
      setMessage(["Fatto! L'IA è collegata al tuo account Cloudflare.", true])
      onConfigured?.()
    } catch (e) {
      setMessage([e instanceof Error && e.message ? e.message : 'Verifica non riuscita. Riprova.', false])
    }
    setChecking(false)
  }
  const ready = accountId.trim() !== '' && token.trim() !== '' && !checking
  return (
    <div style={{ background: C.panel, borderRadius: 24, border: `1px solid ${configured ? alpha(C.violet, 0.5) : C.outline}`, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Icon name="sparkles" size={22} color={C.violet} />
        <div className="t-title-large" style={{ color: C.ink, flex: 1, marginLeft: 10 }}>Intelligenza artificiale</div>
        <span style={{ borderRadius: 40, background: configured ? alpha(C.violet, 0.2) : C.raised, color: configured ? '#fff' : C.muted, fontSize: 12, fontWeight: 700, padding: '5px 10px', lineHeight: '16px' }}>{configured ? 'Attiva' : 'Da configurare'}</span>
      </div>
      <div style={{ color: C.muted, fontSize: 13, lineHeight: '18px', marginTop: 8 }}>
        “Chiedi all'IA” usa Workers AI di Cloudflare con il tuo account personale. Il piano gratuito include una quota giornaliera di richieste, più che sufficiente per l'uso quotidiano, senza carta di credito.
      </div>
      <div onClick={() => setShowGuide(!showGuide)} style={{ color: C.violet, fontWeight: 700, fontSize: 14, marginTop: 10, padding: '6px 0', cursor: 'pointer', display: 'inline-block' }}>
        {showGuide ? 'Nascondi la guida' : 'Come ottenere Account ID e token'}
      </div>
      <AnimatePresence initial={false}>
        {showGuide && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={tween(300)} style={{ overflow: 'hidden' }}>
            <div style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {SETUP_STEPS.map(([text, label, url], i) => (
                <div key={i} style={{ display: 'flex' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: alpha(C.violet, 0.2), color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{i + 1}</div>
                  <div style={{ flex: 1, marginLeft: 10 }}>
                    <div style={{ color: C.ink, fontSize: 14, lineHeight: '19px' }}>{text}</div>
                    {label && url && <a href={url} target="_blank" rel="noreferrer" style={{ color: C.violet, fontSize: 13, fontWeight: 700, marginTop: 4, padding: '4px 0', display: 'inline-block', textDecoration: 'none' }}>{label} ›</a>}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <OutlinedField value={accountId} onChange={(v) => { setAccountId(v.trim()); setMessage(null) }} label={configured && !accountId ? 'Account ID (già salvato)' : 'Account ID'} autoComplete="off" enterKeyHint="next" style={{ marginTop: 14 }} />
      <div style={{ position: 'relative', marginTop: 8 }}>
        <OutlinedField value={token} onChange={(v) => { setToken(v.trim()); setMessage(null) }} label={configured && !token ? 'Token API Workers AI (già salvato)' : 'Token API Workers AI'} type={showToken ? 'text' : 'password'} autoComplete="off" enterKeyHint="done" onSubmit={() => { if (ready) void verify() }} />
        <TextButton onClick={() => setShowToken(!showToken)} style={{ position: 'absolute', right: 4, top: 8 }}><span style={{ fontSize: 12 }}>{showToken ? 'Nascondi' : 'Mostra'}</span></TextButton>
      </div>
      {message && <div style={{ color: message[1] ? C.violet : C.dislike, fontSize: 13, lineHeight: '18px', marginTop: 10 }}>{message[0]}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        {configured && (
          <OutlinedButton onClick={() => { void clearAi().then(() => { setAccountId(''); setToken(''); setShowGuide(true); setMessage(['Credenziali rimosse dal tuo account StreamWise.', true]) }) }} style={{ flex: 1, height: 50, borderRadius: 18 }}>Rimuovi</OutlinedButton>
        )}
        <Pressable pressed={0.97} onClick={() => { if (ready) void verify() }}
          style={{ flex: 1, height: 50, borderRadius: 18, background: ready ? C.violet : alpha(C.ink, 0.12), color: ready ? '#fff' : alpha(C.ink, 0.38), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {checking ? <Spinner size={18} color="#fff" stroke={2} /> : <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 0.1 }}>Verifica e salva</span>}
        </Pressable>
      </div>
      <div style={{ color: C.muted, fontSize: 12, lineHeight: '16px', marginTop: 12 }}>
        Account ID e token restano sul tuo server StreamWise, legati al tuo account: vengono inviati unicamente a Cloudflare, non tornano mai al telefono e non finiscono nei backup JSON.
      </div>
    </div>
  )
}
