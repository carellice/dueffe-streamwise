import { useEffect, useRef, useState } from 'react'
import { GENRES } from '../../../shared/tmdb.ts'
import { BottomSheet, toast } from '../components/Overlay.tsx'
import { alpha, C, Icon, OutlinedButton, OutlinedField, Pressable, Spinner, Switch, TextButton, TonalIconButton } from '../components/ui.tsx'
import { api } from '../lib/api.ts'
import { close } from '../lib/nav.ts'
import { disablePush, enablePush, pushSupported } from '../lib/push.ts'
import { forgetUser, getStore, importBackup, loggedUser, savePrefs, toggleGenre, updateSettings, useData, useStore } from '../lib/store.ts'
import { AiSetupCard } from './Ai.tsx'

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: C.panel, borderRadius: 24, border: `1px solid ${C.outline}`, ...style }}>{children}</div>
}

export function SettingsPage({ pageKey }: { pageKey: number }) {
  const data = useData()
  const reminders = useStore((s) => s.settings.remindersEnabled)
  const [version, setVersion] = useState('')
  const [update, setUpdate] = useState<'idle' | 'checking' | 'ready' | 'latest'>('idle')
  const [account, setAccount] = useState<'password' | 'delete' | null>(null)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { void api<{ version: string }>('/api/session').then((s) => setVersion(s.version)).catch(() => {}) }, [])

  const exportBackup = async () => {
    try {
      const response = await fetch('/api/backup', { credentials: 'same-origin' })
      if (!response.ok) throw new Error()
      const blob = await response.blob()
      const name = 'streamwise-backup.json'
      const shareFile = new File([blob], name, { type: 'application/json' })
      if (navigator.canShare?.({ files: [shareFile] })) await navigator.share({ files: [shareFile] }).catch(() => {})
      else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      toast('Esportazione non riuscita')
    }
  }
  const restoreBackup = async (f: File) => {
    try {
      await importBackup(await f.text())
      toast('Backup ripristinato')
    } catch (e) {
      toast((e as Error).message || 'Ripristino non riuscito')
    }
  }
  const checkUpdates = async () => {
    setUpdate('checking')
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      await reg?.update()
      await new Promise((r) => setTimeout(r, 1200))
      setUpdate(reg?.waiting ? 'ready' : 'latest')
    } catch {
      setUpdate('latest')
    }
  }
  const applyUpdate = async () => {
    const reg = await navigator.serviceWorker?.getRegistration()
    navigator.serviceWorker?.addEventListener('controllerchange', () => location.reload())
    reg?.waiting?.postMessage('skipWaiting')
    if (!reg?.waiting) location.reload()
  }
  const logout = async () => {
    await disablePush()
    await api('/api/logout', { method: 'POST' }).catch(() => {})
    location.reload()
  }

  return (
    <div className="scroll" style={{ position: 'absolute', inset: 0, background: C.bg, padding: 'calc(var(--status-top) + 12px) 20px calc(var(--nav-bottom) + 32px)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <TonalIconButton icon="back" label="Chiudi" onClick={() => close(pageKey)} />
          <div style={{ marginLeft: 14 }}>
            <div className="t-headline-large" style={{ color: C.ink }}>Impostazioni</div>
            <div style={{ color: C.muted }}>Rendi StreamWise più tua</div>
          </div>
        </div>
        <div style={{ background: C.raised, borderRadius: 30, border: `1px solid ${C.outline}`, padding: 22 }}>
          <div className="brand-glow" style={{ width: 52, height: 52, borderRadius: 18, padding: 14, ['--glow-blur' as string]: '7px' }}><Icon name="sparkles" size={24} color="#fff" style={{ position: 'relative' }} /></div>
          <div className="t-headline-medium" style={{ color: C.ink, marginTop: 18 }}>I tuoi generi</div>
          <div style={{ color: C.muted, lineHeight: '21px', marginTop: 6 }}>Scegli cosa ami: i cataloghi daranno più spazio ai tuoi gusti.</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 8, rowGap: 7 }}>
          {GENRES.map((g) => {
            const checked = data.prefs.genres.includes(g.id)
            return (
              <div key={g.id} onClick={() => void toggleGenre(g.id)} className={checked ? 'brand-glow' : undefined}
                style={{ height: 32, borderRadius: 8, padding: checked ? '0 16px 0 8px' : '0 16px', display: 'flex', alignItems: 'center', cursor: 'pointer', background: checked ? undefined : C.raised, border: checked ? `1px solid ${C.primary}` : `1px solid ${C.outline}`, color: checked ? '#fff' : C.muted, ['--glow-blur' as string]: '5px' }}>
                {checked && <Icon name="check" size={18} color="#fff" style={{ marginRight: 8, position: 'relative' }} />}
                <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: 0.1, position: 'relative' }}>{g.label}</span>
              </div>
            )
          })}
        </div>
        <AiSetupCard />
        <Card>
          <div onClick={() => void savePrefs({ hideShowCredits: !data.prefs.hideShowCredits })} style={{ display: 'flex', alignItems: 'center', padding: 18, cursor: 'pointer' }}>
            <div style={{ flex: 1, paddingRight: 12 }}>
              <div className="t-title-large" style={{ color: C.ink }}>Filmografie senza talk show</div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: '18px', marginTop: 4 }}>Nasconde late show, talk show, reality, telegiornali e apparizioni come sé stessi nelle pagine di attori e registi.</div>
            </div>
            <Switch checked={data.prefs.hideShowCredits} onChange={(v) => void savePrefs({ hideShowCredits: v })} />
          </div>
        </Card>
        <Card>
          <div onClick={() => void (reminders ? disablePush() : enablePush().then((ok) => { if (!ok) toast(pushSupported() ? 'Consenti le notifiche nelle impostazioni del browser' : 'Apri StreamWise in HTTPS e installala come app per ricevere le notifiche') }))} style={{ display: 'flex', alignItems: 'center', padding: 18, cursor: 'pointer' }}>
            <div style={{ flex: 1, paddingRight: 12 }}>
              <div className="t-title-large" style={{ color: C.ink }}>Notifiche su questo dispositivo</div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: '18px', marginTop: 4 }}>
                {pushSupported() ? 'Nuovi episodi, uscite e arrivi in streaming dei titoli e delle persone che segui, e i promemoria della Guida TV.' : 'Apri StreamWise in HTTPS e installala come app (Aggiungi alla schermata Home) per ricevere le notifiche.'}
              </div>
            </div>
            <Switch checked={reminders} onChange={(v) => void (v ? enablePush() : disablePush())} />
          </div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div className="t-title-large" style={{ color: C.ink }}>Backup dati</div>
          <div style={{ color: C.muted, marginTop: 4, marginBottom: 14 }}>Salva la libreria e i progressi per trasferirli su un altro telefono.</div>
          <div style={{ display: 'flex', gap: 10, height: 52 }}>
            <Pressable pressed={0.97} className="brand-glow" onClick={() => file.current?.click()} style={{ flex: 1, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', color: '#fff', ['--glow-blur' as string]: '7px' }}>
              <Icon name="download" size={18} style={{ position: 'relative' }} /><span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, position: 'relative' }}>Ripristina JSON</span>
            </Pressable>
            <Pressable pressed={0.97} className="brand-glow" onClick={() => void exportBackup()} style={{ flex: 1, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', color: '#fff', ['--glow-blur' as string]: '7px' }}>
              <Icon name="upload" size={18} style={{ position: 'relative' }} /><span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, position: 'relative' }}>Esporta JSON</span>
            </Pressable>
          </div>
          <input ref={file} type="file" accept="application/json,text/json,text/plain,.json" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void restoreBackup(f); e.target.value = '' }} />
        </Card>
        <OutlinedButton onClick={() => { close(pageKey); window.setTimeout(() => updateSettings({ onboarded: false }), 300) }} style={{ height: 52, borderRadius: 18, width: '100%' }}>
          <Icon name="sparkles" size={24} />Rivedi l’onboarding
        </OutlinedButton>
        <Card style={{ padding: 18 }}>
          <div className="t-title-large" style={{ color: C.ink }}>Account</div>
          <div style={{ color: C.muted, marginTop: 4 }}>Sei entrato come <b style={{ color: C.ink }}>{loggedUser()}</b></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            <OutlinedButton onClick={() => setAccount('password')} style={{ height: 48, borderRadius: 16 }}>Cambia password</OutlinedButton>
            <OutlinedButton onClick={() => void logout()} style={{ height: 48, borderRadius: 16 }}>Esci</OutlinedButton>
            <TextButton onClick={() => setAccount('delete')} color={C.error}>Elimina account</TextButton>
          </div>
        </Card>
        <div>
          <div style={{ height: 1, background: C.outline }} />
          <div style={{ display: 'flex', alignItems: 'center', paddingTop: 18 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.ink, fontWeight: 700 }}>StreamWise</div>
              <div style={{ color: C.accent, fontSize: 13, marginTop: 3 }}>Catalogo pronto all’uso</div>
            </div>
            <div style={{ background: '#3B161B', borderRadius: 14, padding: '8px 12px', color: '#FFDAD2', fontWeight: 700 }}>v{version || '…'}</div>
          </div>
        </div>
        <Card style={{ padding: 18, display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.ink, fontWeight: 700 }}>Aggiornamenti</div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
              {update === 'ready' ? 'Nuova versione disponibile: tocca per aggiornare' : update === 'latest' ? 'Hai già l’ultima versione' : 'Il server si aggiorna da solo ogni notte'}
            </div>
          </div>
          {update === 'checking' ? <Spinner size={22} color={C.accent} stroke={2} /> : update === 'ready' ? (
            <TextButton onClick={() => void applyUpdate()}>Aggiorna</TextButton>
          ) : <TextButton onClick={() => void checkUpdates()}>Controlla</TextButton>}
        </Card>
      </div>
      <AccountSheet mode={account} onClose={() => setAccount(null)} />
    </div>
  )
}

function AccountSheet({ mode, onClose }: { mode: 'password' | 'delete' | null; onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setCurrent(''); setPassword(''); setRepeat(''); setError(null) }, [mode])
  const submit = async () => {
    if (busy) return
    setError(null)
    if (mode === 'password' && password !== repeat) { setError('Le due password non coincidono.'); return }
    setBusy(true)
    try {
      if (mode === 'password') {
        await api('/api/account/password', { method: 'POST', json: { current, password } })
        toast('Password cambiata')
        onClose()
      } else {
        await disablePush()
        await api('/api/account/delete', { method: 'POST', json: { password: current } })
        forgetUser(loggedUser())
        void getStore()
        location.reload()
      }
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }
  return (
    <BottomSheet open={mode != null} onDismiss={onClose}>
      <div style={{ padding: '0 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="t-headline-small" style={{ color: C.ink }}>{mode === 'delete' ? 'Elimina account' : 'Cambia password'}</div>
        {mode === 'delete' && <div style={{ color: C.muted, fontSize: 14, lineHeight: '20px' }}>Libreria, progressi, titoli e persone seguite di questo account verranno eliminati dal server. Esporta prima un backup se vuoi conservarli.</div>}
        <OutlinedField value={current} onChange={setCurrent} label={mode === 'delete' ? 'Password' : 'Password attuale'} type="password" autoComplete="current-password" />
        {mode === 'password' && (
          <>
            <OutlinedField value={password} onChange={setPassword} label="Nuova password" type="password" autoComplete="new-password" />
            <OutlinedField value={repeat} onChange={setRepeat} label="Ripeti la nuova password" type="password" autoComplete="new-password" onSubmit={() => void submit()} />
          </>
        )}
        {error && <div style={{ color: C.dislike, fontSize: 14 }}>{error}</div>}
        <Pressable pressed={0.97} onClick={() => void submit()}
          style={{ height: 52, borderRadius: 18, background: mode === 'delete' ? '#9B2D43' : C.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {busy ? <Spinner size={20} color="#fff" stroke={2} /> : <span className="t-label-large">{mode === 'delete' ? 'Elimina definitivamente' : 'Salva'}</span>}
        </Pressable>
      </div>
    </BottomSheet>
  )
}

export { alpha }
