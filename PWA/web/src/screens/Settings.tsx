// SettingsScreen of MainActivity.kt, plus what the web version needs: the account (password,
// logout, deletion), notifications on this device and app updates (instead of the APK updater).
import { useEffect, useRef, useState } from 'react'
import { GENRES } from '../../../shared/tmdb.ts'
import { api, ApiError } from '../lib/api.ts'
import { useBackHandler } from '../lib/back.ts'
import { exportBackup, forgetUser, importBackup, prefs, setPrefs, showToast, useStore } from '../lib/store.ts'
import { disablePush, enablePush, notificationsAllowed, pushSupported } from '../lib/push.ts'
import { todayRome } from '../../../shared/dates.ts'
import { Dialog, DialogButton } from '../components/overlay.tsx'
import { Icon, Press, SegmentedPills, Spinner, Switch } from '../components/ui.tsx'
import { setSkin, useSkin, type SkinName } from '../lib/skin.ts'
import { AiSetupCard, OutlinedField, setAiHubStyle, useAiHubStyle } from './Ai.tsx'

const SKINS: SkinName[] = ['modern', 'skeu', 'metro']

/** Downloads the native-format backup as streamwise-backup-YYYY-MM-DD.json. */
export async function downloadBackup() {
  try {
    const text = await exportBackup()
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `streamwise-backup-${todayRome()}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  } catch {
    showToast('Esportazione non riuscita')
  }
}

/** Opens the file picker for a JSON backup and restores it. */
export function pickBackup(onRestored: () => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,text/json,text/plain,.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const restored = await importBackup(await file.text())
    if (restored) onRestored()
    else showToast('Questo file non è un backup di StreamWise.')
  }
  input.click()
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: 'var(--surface)', borderRadius: 24, boxShadow: 'inset 0 0 0 1px var(--outline)', ...style }}>{children}</div>
}

function GlowButton({ icon, label, onClick }: { icon: 'download' | 'upload'; label: string; onClick: () => void }) {
  return (
    <Press pressed={0.97} onClick={onClick} className="grow brand-glow row center" style={{ height: '100%', borderRadius: 18, padding: '0 8px', gap: 6, color: '#fff', ['--glow' as string]: '7px' }}>
      <Icon name={icon} size={18} /><span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>
    </Press>
  )
}

function AccountSheet({ mode, onDismiss, username }: { mode: 'password' | 'delete' | null; onDismiss: () => void; username: string }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setCurrent(''); setNext(''); setRepeat(''); setError(null) }, [mode])
  const submit = async () => {
    if (busy) return
    setError(null)
    if (mode === 'password' && next !== repeat) { setError('Le due password non coincidono.'); return }
    setBusy(true)
    try {
      if (mode === 'password') {
        await api('/api/account/password', { method: 'POST', json: { current, password: next } })
        showToast('Password cambiata')
        onDismiss()
      } else {
        await disablePush()
        await api('/api/account/delete', { method: 'POST', json: { password: current } })
        forgetUser(username)
        location.replace('/')
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Operazione non riuscita')
    }
    setBusy(false)
  }
  return (
    <Dialog open={mode != null} onDismiss={onDismiss} style={{ maxWidth: 380 }}>
      <form onSubmit={(e) => { e.preventDefault(); void submit() }} style={{ background: 'var(--surface)', borderRadius: 28, padding: 24 }}>
        <div className="t-headline-small" style={{ color: 'var(--ink)' }}>{mode === 'password' ? 'Cambia password' : 'Elimina account'}</div>
        <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: '20px', marginTop: 8 }}>
          {mode === 'password' ? 'Scegli una nuova password di almeno 6 caratteri.' : `Libreria, progressi, uscite seguite e promemoria di “${username}” verranno cancellati dal server. Non si può annullare.`}
        </div>
        <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
        <OutlinedField label={mode === 'password' ? 'Password attuale' : 'Password'} type="password" autoComplete="current-password" value={current} onChange={setCurrent} style={{ marginTop: 18 }} />
        {mode === 'password' && (
          <>
            <OutlinedField label="Nuova password" type="password" autoComplete="new-password" value={next} onChange={setNext} style={{ marginTop: 10 }} />
            <OutlinedField label="Ripeti la nuova password" type="password" autoComplete="new-password" value={repeat} onChange={setRepeat} style={{ marginTop: 10 }} onEnter={() => void submit()} />
          </>
        )}
        {error && <div style={{ color: 'var(--dislike)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20, gap: 8 }}>
          <DialogButton onClick={onDismiss}>Annulla</DialogButton>
          <button type="submit" disabled={busy || current === '' || (mode === 'password' && next === '')} className="center"
            style={{ height: 40, borderRadius: 20, padding: '0 24px', background: mode === 'delete' ? '#B3261E' : 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 700, opacity: busy || current === '' ? 0.5 : 1 }}>
            {busy ? <Spinner size={18} stroke={2} color="#fff" /> : mode === 'password' ? 'Salva' : 'Elimina'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function SettingsScreen({ onDismiss, onRestored, onReplayOnboarding, version }: { onDismiss: () => void; onRestored: () => void; onReplayOnboarding: () => void; version: string }) {
  const { data, username } = useStore()
  const selected = new Set(data?.prefs.genres ?? [])
  const hideShows = data?.prefs.hideShowCredits ?? true
  const skin = useSkin()
  const hubStyle = useAiHubStyle()
  const [account, setAccount] = useState<'password' | 'delete' | null>(null)
  const [push, setPush] = useState<boolean | null>(null)
  const [update, setUpdate] = useState<'idle' | 'checking' | 'ready' | 'latest'>('idle')
  const waiting = useRef<ServiceWorker | null>(null)
  useBackHandler(true, onDismiss)
  useEffect(() => { void notificationsAllowed().then(setPush) }, [])
  const toggleGenre = (id: string) => {
    const g = prefs().genres
    void setPrefs({ genres: g.includes(id) ? g.filter((x) => x !== id) : [...g, id] })
  }
  const checkUpdate = async () => {
    if (update === 'ready' && waiting.current) {
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
      waiting.current.postMessage('skipWaiting')
      return
    }
    setUpdate('checking')
    try {
      const registration = await navigator.serviceWorker?.getRegistration()
      await registration?.update()
      await new Promise((r) => setTimeout(r, 1500))
      const worker = registration?.waiting ?? registration?.installing ?? null
      waiting.current = worker
      setUpdate(worker ? 'ready' : 'latest')
    } catch {
      setUpdate('latest')
    }
  }
  const logout = async () => {
    await disablePush()
    await api('/api/logout', { method: 'POST' }).catch(() => {})
    location.replace('/')
  }
  return (
    <div className="fill scroll status-pad nav-pad" style={{ background: 'var(--page)' }}>
      <div className="col" style={{ padding: '12px 20px 32px', gap: 18 }}>
        <div className="row">
          <Press pressed={0.9} aria-label="Chiudi" onClick={onDismiss} className="center" style={{ width: 40, height: 40, borderRadius: 20, background: '#3B161B', flex: 'none' }}><Icon name="back" color="#FFDAD2" /></Press>
          <div className="col" style={{ paddingLeft: 14 }}>
            <span className="t-headline-large" style={{ color: 'var(--ink)' }}>Impostazioni</span>
            <span style={{ color: 'var(--muted)' }}>Rendi StreamWise più tua</span>
          </div>
        </div>
        <div style={{ background: 'var(--raised)', borderRadius: 30, boxShadow: 'inset 0 0 0 1px var(--outline)', padding: 22 }}>
          <div className="brand-glow center" style={{ width: 52, height: 52, borderRadius: 18, ['--glow' as string]: '7px' }}><Icon name="sparkles" size={24} color="#fff" /></div>
          <div className="t-headline-medium" style={{ color: 'var(--ink)', marginTop: 18 }}>I tuoi generi</div>
          <div style={{ color: 'var(--muted)', lineHeight: '21px', marginTop: 6 }}>Scegli cosa ami: i cataloghi daranno più spazio ai tuoi gusti.</div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', columnGap: 8, rowGap: 7 }}>
          {GENRES.map((genre) => {
            const checked = selected.has(genre.id)
            return (
              <Press key={genre.id} pressed={0.96} onClick={() => toggleGenre(genre.id)} className={'row ' + (checked ? 'brand-glow' : '')}
                style={{ height: 32, borderRadius: 8, padding: checked ? '0 16px 0 8px' : '0 16px', gap: 8, ['--glow' as string]: '5px', background: checked ? undefined : 'var(--raised)', boxShadow: checked ? 'inset 0 0 0 1px var(--primary)' : 'inset 0 0 0 1px var(--outline)', color: checked ? '#fff' : 'var(--muted)', fontSize: 14, fontWeight: 700 }}>
                {checked && <Icon name="check" size={18} />}
                {genre.label}
              </Press>
            )
          })}
        </div>
        <Card style={{ padding: 18 }}>
          <div className="t-title-large" style={{ color: 'var(--ink)' }}>Stile grafico</div>
          <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '18px', margin: '4px 0 14px' }}>Moderno; skeuomorfico, con pelle cucita, ottone e bottoni lucidi; oppure Modern UI, il look a tessere di Windows Phone.</div>
          <SegmentedPills options={['Moderno', 'Skeuomorfico', 'Modern UI']} selected={SKINS.indexOf(skin)} onSelect={(i) => setSkin(SKINS[i])} />
        </Card>
        <AiSetupCard />
        <Card style={{ padding: 18 }}>
          <div className="t-title-large" style={{ color: 'var(--ink)' }}>Assistente IA</div>
          <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '18px', margin: '4px 0 14px' }}>Come si apre l'assistente: una chat in cui chiedi e affini a parole, oppure schede separate, una per funzione.</div>
          <SegmentedPills options={['Chat', 'Schede']} selected={hubStyle === 'tabs' ? 1 : 0} onSelect={(i) => setAiHubStyle(i === 1 ? 'tabs' : 'chat')} />
        </Card>
        <Card>
          <div className="row" style={{ padding: 18, cursor: 'pointer' }} onClick={() => void setPrefs({ hideShowCredits: !hideShows })}>
            <div className="grow col" style={{ paddingRight: 12 }}>
              <span className="t-title-large" style={{ color: 'var(--ink)' }}>Filmografie senza talk show</span>
              <span style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '18px', marginTop: 4 }}>Nasconde late show, talk show, reality, telegiornali e apparizioni come sé stessi nelle pagine di attori e registi.</span>
            </div>
            <Switch checked={hideShows} onChange={(v) => void setPrefs({ hideShowCredits: v })} />
          </div>
        </Card>
        <Card>
          <div className="row" style={{ padding: 18 }}>
            <div className="grow col" style={{ paddingRight: 12 }}>
              <span className="t-title-large" style={{ color: 'var(--ink)' }}>Notifiche</span>
              <span style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '18px', marginTop: 4 }}>
                {pushSupported() ? 'Nuovi episodi, uscite seguite e promemoria della Guida TV su questo dispositivo.' : 'Per ricevere le notifiche apri StreamWise in HTTPS e installala come app.'}
              </span>
            </div>
            {pushSupported() && (push == null ? <Spinner size={22} stroke={2} /> : (
              <Switch checked={push} onChange={async (v) => {
                if (v) { const ok = await enablePush(); setPush(ok); if (!ok) showToast('Notifiche non attive: consentile nelle impostazioni del browser.') }
                else { await disablePush(); setPush(false) }
              }} />
            ))}
          </div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div className="t-title-large" style={{ color: 'var(--ink)' }}>Backup dati</div>
          <div style={{ color: 'var(--muted)', marginTop: 4, marginBottom: 14 }}>Salva la libreria e i progressi per trasferirli su un altro telefono o nell’app Android.</div>
          <div className="row" style={{ height: 52, gap: 10 }}>
            <GlowButton icon="download" label="Ripristina JSON" onClick={() => pickBackup(onRestored)} />
            <GlowButton icon="upload" label="Esporta JSON" onClick={() => void downloadBackup()} />
          </div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div className="t-title-large" style={{ color: 'var(--ink)' }}>Account</div>
          <div style={{ color: 'var(--muted)', marginTop: 4, marginBottom: 14 }}>Sei entrato come <b style={{ color: 'var(--ink)' }}>{username}</b>. Ogni account ha la sua libreria.</div>
          <div className="col" style={{ gap: 10 }}>
            <Press pressed={0.97} onClick={() => setAccount('password')} className="center" style={{ height: 50, borderRadius: 18, boxShadow: 'inset 0 0 0 1px var(--outline-strong)', color: 'var(--primary)', fontSize: 14, fontWeight: 700 }}>Cambia password</Press>
            <Press pressed={0.97} onClick={() => void logout()} className="center" style={{ height: 50, borderRadius: 18, boxShadow: 'inset 0 0 0 1px var(--outline-strong)', color: 'var(--primary)', fontSize: 14, fontWeight: 700 }}>Esci</Press>
            <Press pressed={0.97} onClick={() => setAccount('delete')} className="center" style={{ height: 50, borderRadius: 18, background: '#621322', boxShadow: 'inset 0 0 0 1px #9B2D43', color: '#FFB5C2', fontSize: 14, fontWeight: 700 }}>Elimina account</Press>
          </div>
        </Card>
        <Press pressed={0.97} onClick={() => { onDismiss(); onReplayOnboarding() }} className="row center" style={{ height: 52, borderRadius: 18, boxShadow: 'inset 0 0 0 1px var(--outline-strong)', color: 'var(--primary)', gap: 8, fontSize: 14, fontWeight: 700 }}>
          <Icon name="sparkles" />Rivedi l’onboarding
        </Press>
        <div>
          <div style={{ height: 1, background: 'var(--outline)' }} />
          <div className="row" style={{ paddingTop: 18 }}>
            <div className="grow col">
              <span style={{ color: 'var(--ink)', fontWeight: 700 }}>StreamWise</span>
              <span style={{ color: 'var(--secondary)', fontSize: 13, marginTop: 3 }}>Catalogo pronto all’uso</span>
            </div>
            <span style={{ background: '#3B161B', color: '#FFDAD2', fontWeight: 700, borderRadius: 14, padding: '8px 12px', lineHeight: '20px' }}>v{version}</span>
          </div>
        </div>
        {'serviceWorker' in navigator && (
          <Press pressed={0.97} onClick={() => void checkUpdate()} className="row" style={{ background: 'var(--surface)', borderRadius: 24, boxShadow: 'inset 0 0 0 1px var(--outline)', padding: 18, gap: 14 }}>
            <div className="center" style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,89,100,.15)', flex: 'none' }}>
              {update === 'checking' ? <Spinner size={20} stroke={2} /> : <Icon name={update === 'ready' ? 'download' : 'refresh'} color="var(--secondary)" />}
            </div>
            <div className="grow col">
              <span style={{ color: 'var(--ink)', fontWeight: 700 }}>{update === 'ready' ? 'Nuova versione disponibile' : 'Controlla aggiornamenti'}</span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                {update === 'ready' ? 'Tocca per aggiornare' : update === 'latest' ? 'Stai usando l’ultima versione' : update === 'checking' ? 'Controllo in corso…' : 'Il server si aggiorna da solo ogni notte'}
              </span>
            </div>
          </Press>
        )}
      </div>
      <AccountSheet mode={account} onDismiss={() => setAccount(null)} username={username ?? ''} />
    </div>
  )
}
