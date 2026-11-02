// Login and registration in the app's own style (aurora, brand glow, the STREAMWISE wordmark).
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { api, ApiError } from '../lib/api.ts'
import { spring, tween } from '../components/motion.ts'
import { AuroraBackground, Icon, Press, Spinner } from '../components/ui.tsx'
import { OutlinedField } from './Ai.tsx'

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (username: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const register = mode === 'register'
  const submit = async () => {
    if (busy) return
    setError(null)
    if (register && password !== repeat) { setError('Le due password non coincidono.'); return }
    setBusy(true)
    try {
      const result = await api<{ username: string }>(register ? '/api/register' : '/api/login', { method: 'POST', json: { username: username.trim(), password } })
      onLoggedIn(result.username)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Accesso non riuscito')
    }
    setBusy(false)
  }
  return (
    <div className="fill" style={{ background: 'var(--bg)', zIndex: 80 }}>
      <AuroraBackground />
      <form className="fill col scroll status-pad nav-pad" onSubmit={(e) => { e.preventDefault(); void submit() }}
        style={{ padding: '0 24px', justifyContent: 'center' }}>
        <div className="col" style={{ alignItems: 'center' }}>
          <img src="/onboarding/app_logo.webp" alt="" style={{ width: 120, height: 120, objectFit: 'contain' }} />
          <div style={{ fontSize: 29, fontWeight: 900, letterSpacing: 1.1, lineHeight: '36px', marginTop: 8 }}>
            <span style={{ color: '#F9F5F7' }}>STREAM</span><span style={{ color: 'var(--coral)' }}>WISE</span>
          </div>
          <div className="t-headline-small" style={{ color: 'var(--ink)', marginTop: 24, textAlign: 'center' }}>{register ? 'Crea il tuo StreamWise' : 'Bentornato'}</div>
          <div style={{ color: 'var(--muted)', fontSize: 15, lineHeight: '21px', textAlign: 'center', marginTop: 6 }}>
            {register ? 'Ogni account ha la sua libreria, i suoi progressi e le sue notifiche.' : 'Entra per ritrovare la tua libreria.'}
          </div>
        </div>
        <div className="col" style={{ marginTop: 26, gap: 10 }}>
          <OutlinedField label="Nome utente" value={username} onChange={setUsername} autoComplete="username" style={{ background: 'transparent' }} />
          <OutlinedField label="Password" type="password" value={password} onChange={setPassword} autoComplete={register ? 'new-password' : 'current-password'} onEnter={register ? undefined : () => void submit()} />
          <AnimatePresence initial={false}>
            {register && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring(1, 1500)} style={{ overflow: 'visible' }}>
                <OutlinedField label="Ripeti la password" type="password" value={repeat} onChange={setRepeat} autoComplete="new-password" onEnter={() => void submit()} style={{ marginTop: 0 }} />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {error && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween(200)} style={{ color: 'var(--dislike)', fontSize: 14, lineHeight: '20px' }}>{error}</motion.div>}
          </AnimatePresence>
          <button type="submit" style={{ display: 'none' }} />
          <Press pressed={busy ? 1 : 0.97} disabled={busy || username.trim() === '' || password === ''} onClick={() => void submit()} className="brand-glow row center"
            style={{ marginTop: 8, height: 56, borderRadius: 28, ['--glow' as string]: '12px', color: '#fff', gap: 10, opacity: username.trim() === '' || password === '' ? 0.6 : 1 }}>
            {busy ? <Spinner size={22} stroke={2.5} color="#fff" /> : <><span style={{ fontWeight: 700, fontSize: 16 }}>{register ? 'Crea account' : 'Entra'}</span><Icon name="arrowForward" size={20} /></>}
          </Press>
          <button type="button" onClick={() => { setMode(register ? 'login' : 'register'); setError(null) }} style={{ marginTop: 6, height: 44, color: 'var(--accent)', fontSize: 14, fontWeight: 700 }}>
            {register ? 'Hai già un account? Entra' : 'Non hai un account? Creane uno'}
          </button>
        </div>
      </form>
    </div>
  )
}
