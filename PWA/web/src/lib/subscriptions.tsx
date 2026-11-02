// rememberSubscriptionData and the subscription UI of MainActivity.kt: availability snapshots
// (cached 24 h, kept on the server per account), the filter bar, the service picker and the
// "I tuoi abbonamenti" panel with its ranking.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LibraryEntry, Media, Provider } from '../../../shared/model.ts'
import { PLATFORMS } from '../../../shared/tmdb.ts'
import {
  availabilityFresh, cachedAvailability, defaults, included, rank, rankTotal, serviceId, services as serviceList, type Availability, type Rank,
} from '../../../shared/subscriptions.ts'
import { entries, prefs, saveAvailability, setPrefs, useStore } from './store.ts'
import { tmdb } from './tmdb.ts'
import { Dialog, DialogButton } from '../components/overlay.tsx'
import { Icon, LinearProgress, Press, RemoteImage } from '../components/ui.tsx'
import { OutlinedField } from '../screens/Ai.tsx'

export type SubscriptionData = {
  availability: Map<string, Availability>
  directory: Provider[]
  updating: boolean
  completed: number
  total: number
  reload: () => void
  services: Provider[]
  uncertain: number
}

const Context = createContext<SubscriptionData | null>(null)

export function useSubscriptionData(): SubscriptionData {
  return useContext(Context)!
}

export const activeSubscriptions = () => new Set(prefs().subscriptions)
export const setActiveSubscriptions = (ids: Set<number>) => setPrefs({ subscriptions: [...ids] })

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { data, version } = useStore()
  const media = useMemo(() => {
    const seen = new Map<string, Media>()
    for (const e of entries()) if (e.state === 'saved' || e.state === 'progress') if (!seen.has(e.media.id)) seen.set(e.media.id, e.media)
    return [...seen.values()]
  }, [version])
  const signature = media.map((m) => m.id).sort().join('|')
  const [fresh, setFresh] = useState(new Map<string, Availability>())
  const [directory, setDirectory] = useState<Provider[]>([])
  const [updating, setUpdating] = useState(false)
  const [completed, setCompleted] = useState(0)
  const [reload, setReload] = useState(0)
  const lastReload = useRef(0)
  useEffect(() => {
    tmdb.subscriptionDirectory(new Set(defaults().map((p) => p.id))).then(setDirectory, () => {})
  }, [reload])
  useEffect(() => {
    if (!data) return
    let alive = true
    const force = reload > lastReload.current
    lastReload.current = reload
    const stored = data.availability
    const current = new Map(media.map((m) => [m.id, cachedAvailability(stored[m.id], m.flatrate)]))
    const pending = media.filter((m) => force || !availabilityFresh(current.get(m.id)!))
    setCompleted(media.length - pending.length)
    setUpdating(pending.length > 0)
    let cursor = 0
    const worker = async () => {
      while (alive && cursor < pending.length) {
        const item = pending[cursor++]
        try {
          const providers = await tmdb.subscriptionAvailability(item)
          if (!alive) return
          setFresh((f) => new Map(f).set(item.id, { providers, checkedAt: Date.now(), failed: false, verified: true }))
          void saveAvailability(item.id, providers)
        } catch {
          const cache = current.get(item.id)!
          setFresh((f) => new Map(f).set(item.id, { ...cache, failed: true }))
        }
        setCompleted((c) => c + 1)
      }
    }
    void Promise.all([worker(), worker(), worker(), worker()]).then(() => { if (alive) setUpdating(false) })
    return () => { alive = false }
  }, [signature, reload, data != null])
  const value = useMemo<SubscriptionData>(() => {
    const availability = new Map<string, Availability>()
    for (const m of media) availability.set(m.id, fresh.get(m.id) ?? cachedAvailability(data?.availability[m.id], m.flatrate))
    const saved = data?.services ?? []
    const merged = new Map<number, Provider>()
    for (const p of [...saved, ...directory]) merged.set(p.id, p)
    return {
      availability, directory: [...merged.values()], updating, completed, total: media.length, reload: () => setReload((r) => r + 1),
      services: serviceList([...merged.values()], availability.values()),
      uncertain: [...availability.values()].filter((a) => !a.verified || a.failed).length,
    }
  }, [media, fresh, directory, updating, completed, data])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

// --- filter ------------------------------------------------------------------------------------

export type SubscriptionFilter = { activeOnly: boolean; services: number[] }

export function parseFilter(raw: string | undefined): SubscriptionFilter {
  try {
    const json = JSON.parse(raw ?? '{}')
    const ids = Array.isArray(json.services) ? json.services.map((v: unknown) => serviceId(Math.trunc(Number(v) || 0))).filter((v: number) => v > 0) : []
    return { activeOnly: json.active === true, services: [...new Set<number>(ids)] }
  } catch {
    return { activeOnly: false, services: [] }
  }
}

export const filterJson = (f: SubscriptionFilter) => JSON.stringify({ active: f.activeOnly, services: f.services })

export function filterIncludes(f: SubscriptionFilter, media: Media, data: SubscriptionData, active: Set<number>): boolean {
  if (!f.activeOnly && f.services.length === 0) return true
  return included(data.availability.get(media.id), f.activeOnly ? active : new Set(f.services))
}

/** rememberSubscriptionFilter: the filter of one library section, saved per account. */
export function useSubscriptionFilter(section: string): [SubscriptionFilter, (f: SubscriptionFilter) => void] {
  const { data } = useStore()
  const filter = parseFilter(data?.prefs.subscriptionFilters[section])
  return [filter, (chosen) => void setPrefs({ subscriptionFilters: { ...prefs().subscriptionFilters, [section]: filterJson(chosen) } })]
}

const platformLogo: Record<string, string> = {
  netflix: '/onboarding/service_netflix.webp', 'prime-video': '/onboarding/service_prime.webp', 'apple-tv-plus': '/onboarding/service_apple.webp',
  'disney-plus': '/onboarding/service_disney.webp', 'paramount-plus': '/onboarding/service_paramount.webp', max: '/onboarding/service_max.webp',
}
export const advisorPlatformLogo = (id: string) => platformLogo[id] ?? '/onboarding/service_max.webp'

export function SubscriptionLogo({ provider, size = 38 }: { provider: Provider; size?: number }) {
  const platform = PLATFORMS.find((p) => p.providerId === serviceId(provider.id))
  if (provider.logo.trim() !== '') return <RemoteImage url={provider.logo} fit="contain" style={{ width: size, height: size, borderRadius: 10, flex: 'none' }} />
  if (platform) return <img src={advisorPlatformLogo(platform.id)} alt="" style={{ width: size, height: size, flex: 'none', borderRadius: 10 }} />
  return <div className="center" style={{ width: size, height: size, borderRadius: 10, background: 'var(--raised)', color: 'var(--secondary)', fontWeight: 700, flex: 'none', fontSize: 14 }}>{provider.name.slice(0, 2).toUpperCase()}</div>
}

/** Material 3 FilterChip. */
export function FilterChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Press pressed={0.96} onClick={onClick} className="row" style={{
      height: 32, borderRadius: 8, padding: '0 16px', flex: 'none', gap: 8, whiteSpace: 'nowrap',
      background: selected ? '#331D20' : 'transparent', boxShadow: selected ? undefined : 'inset 0 0 0 1px var(--outline)',
      color: selected ? '#FFDAD2' : 'var(--muted)', fontSize: 14, fontWeight: 700, letterSpacing: 0.1,
    }}>{children}</Press>
  )
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div className="center" style={{ width: 40, height: 40, flex: 'none' }}>
      <div className="center" style={{ width: 18, height: 18, borderRadius: 2, background: checked ? 'var(--primary)' : 'transparent', boxShadow: checked ? undefined : 'inset 0 0 0 2px var(--muted)' }}>
        {checked && <Icon name="check" size={16} color="#fff" />}
      </div>
    </div>
  )
}

export function ProviderSelectionDialog({ open, title, selected, onDismiss, fullScreen = false, onConfirm }: {
  open: boolean; title: string; selected: number[]; onDismiss: () => void; fullScreen?: boolean; onConfirm: (ids: number[]) => void
}) {
  const data = useSubscriptionData()
  const [chosen, setChosen] = useState(selected)
  const [query, setQuery] = useState('')
  useEffect(() => { if (open) { setChosen(selected); setQuery('') } }, [open])
  const list = data.services.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
  const body = (
    <div className="col" style={{ background: 'var(--surface)', borderRadius: fullScreen ? 0 : 28, padding: 20, gap: 12, height: fullScreen ? '100%' : undefined, paddingTop: fullScreen ? 'calc(20px + var(--safe-top))' : 20, paddingBottom: fullScreen ? 'calc(20px + var(--safe-bottom))' : 20 }}>
      <span style={{ color: 'var(--ink)', fontSize: 23, fontWeight: 700, lineHeight: '30px' }}>{title}</span>
      <span style={{ color: 'var(--muted)' }}>Puoi scegliere più servizi</span>
      <OutlinedField label="" value={query} onChange={setQuery} style={{ height: 56 }} />
      <div className="scroll col" style={{ gap: 6, flex: fullScreen ? 1 : undefined, maxHeight: fullScreen ? undefined : 350, minHeight: 0 }}>
        {list.map((provider) => {
          const id = serviceId(provider.id)
          const on = chosen.includes(id)
          return (
            <Press key={provider.id} pressed={0.98} onClick={() => setChosen(on ? chosen.filter((c) => c !== id) : [...chosen, id])} className="row"
              style={{ borderRadius: 16, padding: 10, background: on ? 'rgba(229,36,58,.18)' : 'var(--raised)', flex: 'none' }}>
              <SubscriptionLogo provider={provider} />
              <span className="grow" style={{ color: 'var(--ink)', paddingLeft: 12, fontWeight: 600 }}>{provider.name}</span>
              <Checkbox checked={on} />
            </Press>
          )
        })}
      </div>
      <div className="row">
        {chosen.length > 0 && <DialogButton onClick={() => setChosen([])}>Nessuno</DialogButton>}
        <div className="grow" />
        <DialogButton onClick={onDismiss}>Annulla</DialogButton>
        <Press pressed={0.96} onClick={() => onConfirm(chosen)} className="center" style={{ height: 40, borderRadius: 20, padding: '0 24px', background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 700, marginLeft: 8 }}>Salva</Press>
      </div>
    </div>
  )
  return (
    <Dialog open={open} onDismiss={onDismiss} fullScreen={fullScreen}>{body}</Dialog>
  )
}

export function SubscriptionFilterBar({ filter, onChange, style }: { filter: SubscriptionFilter; onChange: (f: SubscriptionFilter) => void; style?: React.CSSProperties }) {
  const { data: store } = useStore()
  const data = useSubscriptionData()
  const [dialog, setDialog] = useState(false)
  const active = store?.prefs.subscriptions ?? []
  return (
    <div className="col" style={style}>
      <div className="hscroll row" style={{ gap: 7 }}>
        <FilterChip selected={!filter.activeOnly && filter.services.length === 0} onClick={() => onChange({ activeOnly: false, services: [] })}>Tutti</FilterChip>
        <FilterChip selected={filter.activeOnly} onClick={() => onChange({ activeOnly: true, services: [] })}>I miei abbonamenti</FilterChip>
        <FilterChip selected={filter.services.length > 0} onClick={() => setDialog(true)}>{filter.services.length === 0 ? 'Scegli servizi' : `${filter.services.length} servizi`}</FilterChip>
      </div>
      {filter.activeOnly && active.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>Nessun abbonamento attivo. Impostali nella Home.</span>}
      {(filter.activeOnly || filter.services.length > 0) && (data.updating || data.uncertain > 0) && (
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{data.updating ? `Verifica disponibilità ${data.completed}/${data.total}…` : 'Disponibilità incompleta: alcuni titoli non sono stati verificati.'}</span>
      )}
      <ProviderSelectionDialog open={dialog} title="Filtra per servizi" selected={filter.services} onDismiss={() => setDialog(false)}
        onConfirm={(chosen) => { onChange({ activeOnly: false, services: chosen }); setDialog(false) }} />
    </div>
  )
}

function RankRow({ r, place, active, compareActive, onClick }: { r: Rank; place: number; active: boolean; compareActive: boolean; onClick: () => void }) {
  return (
    <Press pressed={0.98} onClick={onClick} className="row" style={{ background: 'var(--raised)', borderRadius: 18, padding: 12, flex: 'none' }}>
      <span style={{ color: 'var(--secondary)', fontWeight: 900, width: 24, flex: 'none' }}>{place}</span>
      <SubscriptionLogo provider={r.provider} size={32} />
      <div className="grow col" style={{ paddingLeft: 10, gap: 3 }}>
        <span style={{ color: 'var(--ink)', fontSize: 14, lineHeight: '18px', fontWeight: 700 }}>{r.provider.name}</span>
        <span style={{ color: 'var(--muted)', fontSize: 11, lineHeight: '15px' }}>{r.saved} in lista · {r.progress} in corso</span>
        {active ? <span style={{ color: 'var(--like)', fontSize: 10, lineHeight: '14px' }}>Attivo</span>
          : compareActive ? <span style={{ color: 'var(--secondary)', fontSize: 10, lineHeight: '14px' }}>{r.additional} {r.additional === 1 ? 'titolo' : 'titoli'} in più per te</span> : null}
      </div>
      <span style={{ color: 'var(--ink)', fontWeight: 900, fontSize: 22 }}>{rankTotal(r)}</span>
    </Press>
  )
}

export function SubscriptionsPanel({ onOpen }: { onOpen: (m: Media) => void }) {
  const { data: store, version } = useStore()
  const data = useSubscriptionData()
  const active = new Set(store?.prefs.subscriptions ?? [])
  const list = useMemo<LibraryEntry[]>(() => entries().filter((e) => e.state === 'saved' || e.state === 'progress'), [version])
  const ranks = useMemo(() => rank(list, data.availability, data.services, active), [list, data.availability, data.services, store?.prefs.subscriptions])
  const [editing, setEditing] = useState(false)
  const [ranking, setRanking] = useState(false)
  const [selected, setSelected] = useState<Rank | null>(null)
  const placeOf = (r: Rank) => ranks.filter((x) => rankTotal(x) > rankTotal(r)).length + 1
  const titles = selected ? [...new Map(list.filter((e) => included(data.availability.get(e.media.id), new Set([serviceId(selected.provider.id)]))).map((e) => [e.media.id, e])).values()] : []
  return (
    <div style={{ margin: '0 20px', background: 'var(--surface)', borderRadius: 28, boxShadow: 'inset 0 0 0 1px rgba(255,89,100,.25)' }}>
      <div className="col" style={{ padding: 18, gap: 8 }}>
        <div className="row">
          <span className="grow" style={{ color: 'var(--ink)', fontSize: 21, lineHeight: '26px', fontWeight: 700 }}>I tuoi abbonamenti</span>
          <DialogButton onClick={() => setEditing(true)}>{active.size === 0 ? 'Imposta' : 'Modifica'}</DialogButton>
        </div>
        {active.size === 0 ? <span style={{ color: 'var(--muted)' }}>Scegli i servizi a cui sei abbonato. Puoi modificarli quando vuoi.</span> : (
          <div className="hscroll row" style={{ gap: 8 }}>
            {data.services.filter((p) => active.has(serviceId(p.id))).map((p) => (
              <div key={p.id} className="row" style={{ background: 'var(--raised)', borderRadius: 14, padding: 8, flex: 'none' }}>
                <SubscriptionLogo provider={p} size={24} />
                <span style={{ color: 'var(--ink)', fontSize: 12, marginLeft: 6, whiteSpace: 'nowrap' }}>{p.name}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 1, background: 'rgba(164,168,181,.15)' }} />
        <span style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 18 }}>Quale servizio ti conviene?</span>
        <span style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '18px' }}>Più titoli inclusi dalla tua lista e da Continua a guardare. Ogni film o serie conta una volta.</span>
        {list.length === 0 ? <span style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '18px' }}>Aggiungi titoli alla tua lista per ottenere una classifica personale.</span>
          : ranks.every((r) => rankTotal(r) === 0) && !data.updating && data.uncertain === 0 ? <span style={{ color: 'var(--muted)' }}>Nessun servizio include i tuoi titoli al momento.</span>
            : (
              <>
                {ranks.filter((r) => rankTotal(r) > 0).slice(0, 2).map((r) => <RankRow key={r.provider.id} r={r} place={placeOf(r)} active={active.has(r.provider.id)} compareActive={active.size > 0} onClick={() => setSelected(r)} />)}
                {data.updating && <LinearProgress value={data.total === 0 ? 0 : data.completed / data.total} color="var(--primary)" height={4} />}
                <div className="row">
                  <span className="grow" style={{ color: 'var(--muted)', fontSize: 12 }}>{data.updating ? `Verifica titoli ${data.completed}/${data.total}` : data.uncertain > 0 ? `${data.uncertain} titoli da verificare` : `${list.length} titoli confrontati`}</span>
                  <DialogButton onClick={() => setRanking(true)}>Classifica</DialogButton>
                  <button aria-label="Aggiorna disponibilità" disabled={data.updating} onClick={data.reload} className="center" style={{ width: 40, height: 40, opacity: data.updating ? 0.38 : 1 }}><Icon name="refresh" color="var(--secondary)" /></button>
                </div>
                <span style={{ color: 'var(--muted)', fontSize: 10, lineHeight: '14px' }}>Ordine per numero di titoli, senza confrontare i prezzi. {data.updating || data.uncertain > 0 ? 'Classifica provvisoria. ' : ''}Disponibilità in Italia · JustWatch</span>
              </>
            )}
      </div>
      <ProviderSelectionDialog open={editing} title="I tuoi abbonamenti" selected={[...active]} fullScreen onDismiss={() => setEditing(false)}
        onConfirm={(chosen) => { void setActiveSubscriptions(new Set(chosen)); setEditing(false) }} />
      <Dialog open={ranking} onDismiss={() => setRanking(false)}>
        <div className="col" style={{ background: 'var(--surface)', borderRadius: 28, padding: 18, gap: 12 }}>
          <span style={{ color: 'var(--ink)', fontSize: 23, fontWeight: 700, lineHeight: '30px' }}>La tua classifica</span>
          <span style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '18px' }}>Dal maggior numero di titoli inclusi al minore. Solo abbonamenti, senza noleggi o acquisti.</span>
          {(data.updating || data.uncertain > 0) && <span style={{ color: 'var(--secondary)', fontSize: 12 }}>Dati in aggiornamento o incompleti: la classifica può cambiare.</span>}
          <div className="scroll col" style={{ maxHeight: 430, gap: 8 }}>
            {ranks.map((r) => <RankRow key={r.provider.id} r={r} place={placeOf(r)} active={active.has(r.provider.id)} compareActive={active.size > 0} onClick={() => setSelected(r)} />)}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}><DialogButton onClick={() => setRanking(false)}>Chiudi</DialogButton></div>
        </div>
      </Dialog>
      <Dialog open={selected != null} onDismiss={() => setSelected(null)}>
        <div className="col" style={{ background: 'var(--surface)', borderRadius: 28, padding: 18, gap: 12 }}>
          <span style={{ color: 'var(--ink)', fontSize: 23, fontWeight: 700, lineHeight: '30px' }}>Su {selected?.provider.name}</span>
          <div className="scroll col" style={{ maxHeight: 430, gap: 8 }}>
            {titles.map((e) => (
              <Press key={e.media.id} pressed={0.98} onClick={() => { setSelected(null); setRanking(false); onOpen(e.media) }} className="row" style={{ background: 'var(--raised)', borderRadius: 18, padding: 12, flex: 'none' }}>
                <RemoteImage url={e.media.poster} style={{ width: 42, height: 60, borderRadius: 8, flex: 'none' }} />
                <div className="grow col" style={{ paddingLeft: 12 }}>
                  <span style={{ color: 'var(--ink)', fontWeight: 700 }}>{e.media.title}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{e.state === 'saved' ? 'La mia lista' : 'Continua a guardare'}</span>
                </div>
              </Press>
            ))}
            {titles.length === 0 && <span style={{ color: 'var(--muted)' }}>Nessun titolo incluso nelle tue liste.</span>}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}><DialogButton onClick={() => setSelected(null)}>Chiudi</DialogButton></div>
        </div>
      </Dialog>
    </div>
  )
}
