// "Assistente IA" as a conversation (AiChatScreen in MainActivity.kt): every feature starts from a chip or
// a message, the answers arrive as cards inside the chat, and follow-up chips refine the last answer.
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useBackHandler } from '../lib/back.ts'
import { useStore } from '../lib/store.ts'
import { spring } from '../components/motion.ts'
import { Icon, Press } from '../components/ui.tsx'
import type { OpenMedia } from '../components/cards.tsx'
import type { IconName } from '../lib/icons.gen.ts'
import { AI_GRADIENT, AiGlow, AiHeader, AiPage, AiResults, Chip, ResultSkeleton, aiCall, aiError, type AiAnswer } from './Ai.tsx'

type Mode = 'recommend' | 'search' | 'identify' | 'duo'
type Message = { id: number; mine: boolean; text: string; answer?: AiAnswer; chips?: string[] }

const MODE_LABEL: Record<Mode, string> = { recommend: '', search: 'Cerca nel catalogo', identify: 'Ritrova un titolo', duo: 'Serata in due' }
const PLACEHOLDER: Record<Mode, string> = {
  recommend: 'Cosa ti va di guardare?',
  search: 'Es. thriller coreani degli anni 2000',
  identify: 'Racconta cosa ricordi…',
  duo: "Titoli che piacciono all'altra persona",
}
const STARTERS: [string, IconName][] = [
  ['Cosa guardo stasera?', 'sparkles'], ['Stasera in TV', 'tvGuide'], ['Sorprendimi', 'star'],
  ['Serata in due', 'person'], ['Ritrova un titolo', 'search'], ['Cerca nel catalogo', 'compass'],
]
const REFINE = ['Più leggero', 'Più impegnativo', 'Più recente', 'Solo film', 'Solo serie', 'Altre idee']

let nextId = 1
const welcome = (): Message => ({ id: nextId++, mine: false, text: 'Ciao! Dimmi cosa ti va e ti propongo titoli veri, sui tuoi abbonamenti e spiegati uno per uno. Oppure parti da qui:' })

export function AiChatScreen({ onDismiss, onOpen }: { onDismiss: () => void; onOpen: OpenMedia }) {
  const { data } = useStore()
  const [messages, setMessages] = useState<Message[]>(() => [welcome()])
  const [mode, setMode] = useState<Mode>('recommend')
  const [type, setType] = useState('all')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  // Context of the conversation: earlier requests, titles already shown, clues, the other person's titles.
  const history = useRef<string[]>([])
  const shown = useRef<string[]>([])
  const clues = useRef<[string, string][]>([])
  const excludedTitles = useRef<string[]>([])
  const lastQuestion = useRef('')
  const duoTitles = useRef<string[]>([])
  const lastQuery = useRef('')
  const lastAction = useRef<(() => void) | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  useBackHandler(true, onDismiss)
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length, loading])

  if (data?.ai.configured !== true) {
    return <AiPage title="Assistente IA" intro="Chiedi consigli, cosa c'è stasera in TV, cosa guardare in due o ritrova un titolo di cui non ricordi il nome." onDismiss={onDismiss}>{null}</AiPage>
  }

  const say = (message: Omit<Message, 'id'>) => setMessages((m) => [...m, { ...message, id: nextId++ }])

  const run = async (work: () => Promise<AiAnswer>, chips: (a: AiAnswer) => string[], fallback: string) => {
    setLoading(true)
    lastAction.current = () => void run(work, chips, fallback)
    try {
      const answer = await work()
      shown.current.push(...answer.results.map((r) => r.media.id))
      const empty = answer.results.length === 0 && (answer.tv ?? []).length === 0
      say({ mine: false, text: answer.intro || (empty ? fallback : 'Ecco cosa ti propongo:'), answer, chips: chips(answer) })
    } catch (e) {
      say({ mine: false, text: aiError(e), chips: ['Riprova'] })
    }
    setLoading(false)
  }

  const recommend = (request: string, nextType = type) => {
    const past = [...history.current]
    history.current.push(request)
    return run(() => aiCall<AiAnswer>('recommend', { request, history: past, type: nextType, exclude: shown.current }), () => REFINE, 'Questa volta non ho trovato niente di adatto. Prova a dirmelo con altre parole.')
  }

  const send = (raw: string) => {
    const value = raw.trim()
    if (value === '' || loading) return
    ;(document.activeElement as HTMLElement | null)?.blur()
    setText('')
    say({ mine: true, text: value })
    if (value === 'Riprova') { lastAction.current?.(); return }
    if (mode === 'search') {
      lastQuery.current = value
      void run(() => aiCall<AiAnswer>('search', { query: value, type, exclude: shown.current }), () => ['Altri risultati'], 'Nel catalogo non c’è niente che corrisponda. Prova a descriverlo diversamente.')
    } else if (mode === 'identify') {
      clues.current.push([lastQuestion.current || 'Cosa ricorda', value])
      void run(async () => {
        const answer = await aiCall<AiAnswer>('identify', { clues: clues.current, exclude: excludedTitles.current })
        excludedTitles.current.push(...answer.results.map((r) => r.media.originalTitle || r.media.title))
        lastQuestion.current = answer.question ?? ''
        // The follow-up question is shown after the candidates, with its answers as chips.
        if (answer.question) answer.intro = [answer.intro, answer.results.length > 0 ? `Se non è nessuno di questi: ${answer.question}` : answer.question].filter(Boolean).join('\n\n')
        return answer
      }, (a) => a.options ?? [], 'Non riesco ancora a capire quale sia. Aggiungi un dettaglio: un attore, una scena, un luogo.')
    } else if (mode === 'duo') {
      const first = duoTitles.current.length === 0
      if (first) duoTitles.current = value.split(/,|\se\s|\n/).map((t) => t.trim()).filter((t) => t !== '')
      if (duoTitles.current.length === 0) { say({ mine: false, text: 'Scrivimi almeno un titolo, separando i titoli con una virgola.' }); return }
      void run(() => aiCall<AiAnswer>('duo', { titles: duoTitles.current, request: first ? '' : value, type, exclude: shown.current }), () => REFINE.filter((c) => c !== 'Solo film' && c !== 'Solo serie'), 'Non ho trovato titoli che mettano d’accordo tutti e due. Prova con altri titoli.')
    } else {
      let nextType = type
      if (value === 'Solo film') nextType = 'movie'
      else if (value === 'Solo serie') nextType = 'tv'
      if (nextType !== type) setType(nextType)
      void recommend(value === 'Altre idee' ? 'Altre idee, diverse dalle precedenti' : value, nextType)
    }
  }

  const start = (starter: string) => {
    if (loading) return
    if (starter === 'Cosa guardo stasera?') { setMode('recommend'); send(starter); return }
    say({ mine: true, text: starter })
    if (starter === 'Stasera in TV') {
      void run(() => aiCall<AiAnswer>('tonight', {}), () => [], 'Stasera in TV non vedo niente di adatto a te.')
    } else if (starter === 'Sorprendimi') {
      void run(() => aiCall<AiAnswer>('surprise', { type, exclude: shown.current }), () => ['Un’altra sorpresa'], 'Niente sorprese questa volta. Riprova tra poco.')
    } else if (starter === 'Serata in due') {
      setMode('duo'); duoTitles.current = []
      say({ mine: false, text: 'Bello! Scrivimi due o tre titoli che piacciono all’altra persona, separati da una virgola: trovo qualcosa che vada bene a tutti e due.' })
    } else if (starter === 'Ritrova un titolo') {
      setMode('identify'); clues.current = []; excludedTitles.current = []; lastQuestion.current = ''
      say({ mine: false, text: 'Proviamo! Raccontami cosa ricordi: la trama, una scena, un attore, più o meno l’anno o se era un film o una serie.' })
    } else if (starter === 'Cerca nel catalogo') {
      setMode('search')
      say({ mine: false, text: 'Descrivimi cosa cerchi, anche in modo preciso: genere, epoca, paese, durata. Lo cerco nel catalogo.' })
    }
  }

  const chip = (value: string) => {
    if (value === 'Un’altra sorpresa') { say({ mine: true, text: value }); void run(() => aiCall<AiAnswer>('surprise', { type, exclude: shown.current }), () => ['Un’altra sorpresa'], 'Niente sorprese questa volta.'); return }
    if (value === 'Altri risultati') { send(lastQuery.current); return }
    send(value)
  }

  const reset = () => {
    if (loading) return
    setMessages([welcome()]); setMode('recommend'); setType('all')
    history.current = []; shown.current = []; clues.current = []; excludedTitles.current = []; duoTitles.current = []; lastQuestion.current = ''
  }

  const last = messages[messages.length - 1]
  return (
    <div className="fill col" style={{ background: 'var(--page)', overflow: 'hidden' }}>
      <AiGlow />
      <div className="status-pad" style={{ padding: '8px 20px 10px', position: 'relative' }}>
        <AiHeader title="Assistente IA" onBack={onDismiss} trailing={messages.length > 1 ? (
          <span onClick={reset} style={{ color: 'var(--violet)', fontWeight: 700, fontSize: 14, padding: '8px 10px', cursor: 'pointer' }}>Nuova chat</span>
        ) : null} />
      </div>
      <div ref={scroller} className="grow scroll" style={{ position: 'relative' }}>
        <div className="col" style={{ padding: '6px 16px 20px', gap: 14 }}>
          {messages.map((m, index) => (
            <motion.div key={m.id} className="col" style={{ gap: 10, alignItems: m.mine ? 'flex-end' : 'stretch' }}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring(0.85, 500)}>
              {m.mine ? (
                <div style={{ maxWidth: '82%', background: AI_GRADIENT, color: '#fff', borderRadius: '20px 20px 6px 20px', padding: '10px 14px', fontSize: 15, lineHeight: '21px', fontWeight: 600 }}>{m.text}</div>
              ) : (
                <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <div className="center" style={{ width: 32, height: 32, borderRadius: '50%', background: AI_GRADIENT, flex: 'none' }}><Icon name="sparkles" size={17} color="#fff" /></div>
                  <div style={{ background: 'var(--surface)', borderRadius: '6px 20px 20px 20px', padding: '10px 14px', color: 'var(--ink)', fontSize: 15, lineHeight: '21px', whiteSpace: 'pre-line', boxShadow: 'inset 0 0 0 1px var(--outline)' }}>{m.text}</div>
                </div>
              )}
              {m.answer && <div style={{ paddingLeft: 42 }}><AiResults answer={m.answer} onOpen={onOpen} /></div>}
              {index === 0 && messages.length === 1 && (
                <div className="row" style={{ flexWrap: 'wrap', gap: 8, paddingLeft: 42 }}>
                  {STARTERS.map(([label, icon]) => <Chip key={label} small icon={icon} label={label} onClick={() => start(label)} />)}
                </div>
              )}
              {m === last && !loading && (m.chips ?? []).length > 0 && (
                <div className="row" style={{ flexWrap: 'wrap', gap: 8, paddingLeft: 42 }}>
                  {m.chips!.map((c) => <Chip key={c} small label={c} onClick={() => chip(c)} />)}
                </div>
              )}
            </motion.div>
          ))}
          {loading && (
            <div className="col" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 10 }}>
                <div className="center" style={{ width: 32, height: 32, borderRadius: '50%', background: AI_GRADIENT, flex: 'none' }}><Icon name="sparkles" size={17} color="#fff" /></div>
                <TypingDots />
              </div>
              <div className="col" style={{ paddingLeft: 42, gap: 12 }}>{[0, 1].map((i) => <ResultSkeleton key={i} lines={3} />)}</div>
            </div>
          )}
        </div>
      </div>
      <div className="col" style={{ padding: '8px 16px calc(12px + env(safe-area-inset-bottom))', gap: 8, borderTop: '1px solid var(--outline)', background: 'var(--page)', position: 'relative' }}>
        {messages.length > 1 && (
          <div className="row hscroll" style={{ gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {mode !== 'recommend' && <Chip small active label={`${MODE_LABEL[mode]}  ✕`} onClick={() => setMode('recommend')} />}
            {STARTERS.filter(([label]) => label !== MODE_LABEL[mode]).map(([label, icon]) => <Chip key={label} small icon={icon} label={label} onClick={() => start(label)} />)}
          </div>
        )}
        <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div className="grow" style={{ background: 'var(--surface)', borderRadius: 24, padding: '10px 16px', boxShadow: 'inset 0 0 0 1px rgba(165,123,255,.45)' }}>
            <textarea className="field" rows={1} value={text} maxLength={400} enterKeyHint="send" placeholder={PLACEHOLDER[mode]}
              style={{ caretColor: 'var(--violet)', maxHeight: 110, resize: 'none' }}
              onChange={(e) => { setText(e.target.value.slice(0, 400)); e.target.style.height = 'auto'; e.target.style.height = Math.min(110, e.target.scrollHeight) + 'px' }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }} />
          </div>
          <Press pressed={text.trim() && !loading ? 0.9 : 1} disabled={!text.trim() || loading} aria-label="Invia" onClick={() => send(text)} className="center"
            style={{ width: 48, height: 48, borderRadius: '50%', flex: 'none', background: text.trim() && !loading ? AI_GRADIENT : 'var(--raised)', color: '#fff' }}>
            <Icon name="arrowForward" size={22} />
          </Press>
        </div>
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div className="row" style={{ background: 'var(--surface)', borderRadius: '6px 20px 20px 20px', padding: '14px 16px', gap: 5, boxShadow: 'inset 0 0 0 1px var(--outline)' }}>
      {[0, 1, 2].map((i) => (
        <motion.span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--violet)', display: 'block' }}
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
      ))}
    </div>
  )
}
