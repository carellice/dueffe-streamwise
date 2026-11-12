// "Assistente IA" as tabs (AiToolsScreen in MainActivity.kt): one tab per feature, each with its own form
// and results. The tabs stay mounted, so switching back keeps what was asked and found.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useBackHandler } from '../lib/back.ts'
import { useStore } from '../lib/store.ts'
import { ChipTabs, Icon, SegmentedPills } from '../components/ui.tsx'
import type { OpenMedia } from '../components/cards.tsx'
import type { IconName } from '../lib/icons.gen.ts'
import { AI_GRADIENT, AiButton, AiGlow, AiHeader, AiPage, AiResults, AiTextArea, Chip, ErrorText, FindTitleFlow, ResultSkeleton, aiCall, aiError, type AiAnswer } from './Ai.tsx'

type Tab = { label: string; icon: IconName; title: string; text: string }
const TABS: Tab[] = [
  { label: 'Consigli', icon: 'sparkles', title: 'Consigli su misura', text: 'Dimmi cosa ti va: scelgo tra titoli veri, sui tuoi abbonamenti, e ti spiego perché.' },
  { label: 'Cerca a parole', icon: 'compass', title: 'Cerca a parole', text: 'Descrivi cosa cerchi come lo diresti a un amico: genere, epoca, paese, durata.' },
  { label: 'Stasera in TV', icon: 'tvGuide', title: 'Stasera in TV', text: 'I film e le serie in onda stasera in chiaro che fanno per te.' },
  { label: 'In due', icon: 'person', title: 'Serata in due', text: 'Scrivi cosa piace all’altra persona: trovo titoli che vanno bene a entrambi.' },
  { label: 'Sorprendimi', icon: 'star', title: 'Sorprendimi', text: 'Tre titoli che non ti aspetti, ma che secondo me ti piaceranno.' },
  { label: 'Ritrova', icon: 'search', title: 'Ritrova un titolo', text: 'Non ricordi il nome? Rispondi a qualche domanda e lo trovo io.' },
]
const TYPES = ['all', 'movie', 'tv']
const IDEAS = ['Qualcosa di leggero', 'Un thriller che non mi aspetto', 'Una serie breve', 'Da vedere in coppia', 'Un classico da recuperare']
const REFINE = ['Più leggero', 'Più impegnativo', 'Più recente', 'Altre idee']

/** Runs one AI request at a time and keeps the last answer and error. */
function useAnswer() {
  const [answer, setAnswer] = useState<AiAnswer | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shown = useRef<string[]>([])
  const run = async (work: (exclude: string[]) => Promise<AiAnswer>, empty: string) => {
    if (loading) return
    ;(document.activeElement as HTMLElement | null)?.blur()
    setLoading(true)
    setError(null)
    try {
      const next = await work(shown.current)
      shown.current.push(...next.results.map((r) => r.media.id))
      setAnswer(next)
      if (next.results.length === 0 && (next.tv ?? []).length === 0) setError(empty)
    } catch (e) { setError(aiError(e)) }
    setLoading(false)
  }
  return { answer, loading, error, run }
}

function Results({ state, onOpen }: { state: ReturnType<typeof useAnswer>; onOpen: OpenMedia }) {
  if (state.loading) return <div className="col" style={{ gap: 12 }}>{[0, 1, 2].map((i) => <ResultSkeleton key={i} />)}</div>
  return (
    <>
      <ErrorText text={state.error} />
      {state.answer && state.answer.intro !== '' && <div style={{ color: 'var(--ink)', fontSize: 15, lineHeight: '21px', fontStyle: 'italic' }}>{state.answer.intro}</div>}
      {state.answer && <AiResults answer={state.answer} onOpen={onOpen} />}
    </>
  )
}

const TypePills = ({ type, onType }: { type: string; onType: (t: string) => void }) => (
  <SegmentedPills options={['Tutto', 'Film', 'Serie TV']} selected={TYPES.indexOf(type)} height={42} onSelect={(i) => onType(TYPES[i])} />
)

function RecommendTab({ onOpen }: { onOpen: OpenMedia }) {
  const [request, setRequest] = useState('')
  const [type, setType] = useState('all')
  const history = useRef<string[]>([])
  const state = useAnswer()
  const ask = (text: string) => {
    const past = [...history.current]
    history.current.push(text)
    void state.run((exclude) => aiCall<AiAnswer>('recommend', { request: text, history: past, type, exclude }), 'Nessun titolo adatto questa volta. Prova a riformulare la richiesta.')
  }
  return (
    <>
      <AiTextArea value={request} onChange={setRequest} onSubmit={() => { history.current = []; ask(request) }} placeholder="Cosa ti va stasera? Ad esempio: qualcosa di leggero, che duri meno di due ore" />
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>{IDEAS.map((idea) => <Chip key={idea} small label={idea} active={request === idea} onClick={() => setRequest(idea)} />)}</div>
      <TypePills type={type} onType={setType} />
      <AiButton busy={state.loading} label={state.loading ? 'Sto pensando ai tuoi gusti…' : 'Consigliami'} onClick={() => { history.current = []; ask(request) }} />
      <Results state={state} onOpen={onOpen} />
      {state.answer && !state.loading && state.answer.results.length > 0 && (
        <div className="col" style={{ gap: 8 }}>
          <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 700 }}>Affina la ricerca</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>{REFINE.map((r) => <Chip key={r} small label={r} onClick={() => ask(r === 'Altre idee' ? 'Altre idee, diverse dalle precedenti' : r)} />)}</div>
        </div>
      )}
    </>
  )
}

function SearchTab({ onOpen }: { onOpen: OpenMedia }) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const state = useAnswer()
  const go = () => { if (query.trim()) void state.run((exclude) => aiCall<AiAnswer>('search', { query, type, exclude }), 'Nel catalogo non c’è niente che corrisponda. Prova a descriverlo diversamente.') }
  return (
    <>
      <AiTextArea rows={2} value={query} onChange={setQuery} onSubmit={go} placeholder="Es. thriller coreani degli anni 2000 sotto le due ore" />
      <TypePills type={type} onType={setType} />
      <AiButton busy={state.loading} disabled={!query.trim()} label={state.loading ? 'Cerco nel catalogo…' : state.answer ? 'Altri risultati' : 'Cerca'} onClick={go} />
      <Results state={state} onOpen={onOpen} />
    </>
  )
}

function TonightTab({ onOpen, visible }: { onOpen: OpenMedia; visible: boolean }) {
  const state = useAnswer()
  const go = () => void state.run(() => aiCall<AiAnswer>('tonight', {}), 'Stasera in TV non vedo niente di adatto a te.')
  const started = useRef(false)
  useEffect(() => { if (visible && !started.current) { started.current = true; go() } })
  return (
    <>
      <Results state={state} onOpen={onOpen} />
      {!state.loading && <AiButton busy={false} height={50} label="Chiedi di nuovo" onClick={go} />}
    </>
  )
}

function DuoTab({ onOpen }: { onOpen: OpenMedia }) {
  const [titles, setTitles] = useState('')
  const [request, setRequest] = useState('')
  const [type, setType] = useState('all')
  const state = useAnswer()
  const list = titles.split(/,|\n/).map((t) => t.trim()).filter((t) => t !== '')
  const go = () => { if (list.length > 0) void state.run((exclude) => aiCall<AiAnswer>('duo', { titles: list, request, type, exclude }), 'Non ho trovato titoli che mettano d’accordo tutti e due. Prova con altri titoli.') }
  return (
    <>
      <AiTextArea rows={2} value={titles} onChange={setTitles} placeholder="Cosa piace all'altra persona? Es. Friends, La La Land, Stranger Things" />
      <AiTextArea rows={1} value={request} onChange={setRequest} onSubmit={go} placeholder="Facoltativo: com'è la serata? Es. qualcosa che faccia ridere" />
      <TypePills type={type} onType={setType} />
      <AiButton busy={state.loading} disabled={list.length === 0} label={state.loading ? 'Cerco un compromesso…' : state.answer ? 'Altre idee' : 'Trova per tutti e due'} onClick={go} />
      <Results state={state} onOpen={onOpen} />
    </>
  )
}

function SurpriseTab({ onOpen }: { onOpen: OpenMedia }) {
  const [type, setType] = useState('all')
  const state = useAnswer()
  return (
    <>
      <TypePills type={type} onType={setType} />
      <AiButton busy={state.loading} label={state.loading ? 'Preparo la sorpresa…' : state.answer ? 'Un’altra sorpresa' : 'Sorprendimi'}
        onClick={() => void state.run((exclude) => aiCall<AiAnswer>('surprise', { type, exclude }), 'Niente sorprese questa volta. Riprova tra poco.')} />
      <Results state={state} onOpen={onOpen} />
    </>
  )
}

export function AiToolsScreen({ onDismiss, onOpen, initialTab = 0 }: { onDismiss: () => void; onOpen: OpenMedia; initialTab?: number }) {
  const { data } = useStore()
  const [tab, setTab] = useState(initialTab)
  useBackHandler(true, onDismiss)
  if (data?.ai.configured !== true) {
    return <AiPage title="Assistente IA" intro="Consigli su misura, ricerca a parole, la TV di stasera, serate in due e titoli dimenticati." onDismiss={onDismiss}>{null}</AiPage>
  }
  const panels: ReactNode[] = [
    <RecommendTab onOpen={onOpen} />, <SearchTab onOpen={onOpen} />, <TonightTab onOpen={onOpen} visible={tab === 2} />,
    <DuoTab onOpen={onOpen} />, <SurpriseTab onOpen={onOpen} />, <FindTitleFlow onOpen={onOpen} />,
  ]
  const current = TABS[tab]
  return (
    <div className="fill" style={{ background: 'var(--page)', overflow: 'hidden' }}>
      <AiGlow />
      <div className="fill scroll status-pad">
        <div className="col" style={{ padding: '8px 0 40px', gap: 16 }}>
          <div style={{ padding: '0 20px' }}><AiHeader title="Assistente IA" onBack={onDismiss} /></div>
          <ChipTabs options={TABS.map((t) => [t.label, null])} selected={tab} onSelect={setTab} />
          <div className="row" style={{ margin: '0 20px', gap: 14, borderRadius: 24, padding: 16, background: 'linear-gradient(135deg, #26123F, #1A1426 55%, #3A0F1E)', boxShadow: 'inset 0 0 0 1px rgba(165,123,255,.4)' }}>
            <div className="center" style={{ width: 46, height: 46, borderRadius: '50%', background: AI_GRADIENT, flex: 'none' }}><Icon name={current.icon} size={23} color="#fff" /></div>
            <div className="grow col">
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>{current.title}</span>
              <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, lineHeight: '18px', marginTop: 2 }}>{current.text}</span>
            </div>
          </div>
          {panels.map((panel, index) => (
            <div key={index} className="col" style={{ display: index === tab ? 'flex' : 'none', padding: '0 20px', gap: 16 }}>{panel}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
