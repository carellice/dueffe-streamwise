import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { tween } from '../components/motion.ts'
import { AuroraBackground, C, OutlinedField, Pressable, Spinner } from '../components/ui.tsx'
import { api } from '../lib/api.ts'

// Account access in the app's own style: the onboarding logo on the ember aurora, "Bentornato"
// to sign in, "Crea il tuo StreamWise" to register (with the family code chosen at install time).

export function LoginScreen({ inviteRequired, onDone }: { inviteRequired: boolean; onDone: (username: string) => void }) {
  const [register, setRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (busy) return
    if (register && password !== repeat) { setError('Le due password non coincidono.'); return }
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ username: string }>(register ? '/api/register' : '/api/login', { method: 'POST', json: { username, password, code } })
      onDone(result.username)
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <AuroraBackground />
      <div className="scroll" style={{ position: 'absolute', inset: 0, padding: 'calc(var(--status-top) + 48px) 24px 40px' }}>
        <img src="/onboarding/app_logo.webp" alt="" style={{ width: 96, height: 96, borderRadius: 26, margin: '0 auto' }} />
        <div style={{ color: C.accent, fontSize: 12, fontWeight: 900, letterSpacing: 2, textAlign: 'center', marginTop: 24 }}>STREAMWISE</div>
        <div className="t-display-small" style={{ color: C.ink, textAlign: 'center', marginTop: 4 }}>{register ? 'Crea il tuo StreamWise' : 'Bentornato'}</div>
        <div style={{ color: C.muted, fontSize: 15, lineHeight: '21px', textAlign: 'center', marginTop: 8 }}>
          {register ? 'Ogni account ha la sua libreria, i suoi progressi e i titoli che segue.' : 'Entra per ritrovare la tua libreria e i tuoi progressi.'}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void submit() }} className="glass" style={{ borderRadius: 30, padding: 20, marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <OutlinedField value={username} onChange={setUsername} label="Nome utente" autoComplete="username" enterKeyHint="next" />
          <OutlinedField value={password} onChange={setPassword} label="Password" type="password" autoComplete={register ? 'new-password' : 'current-password'} enterKeyHint={register ? 'next' : 'go'} onSubmit={register ? undefined : () => void submit()} />
          <AnimatePresence initial={false}>
            {register && (
              <motion.div key="register" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={tween(260)} style={{ overflow: 'hidden' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 2 }}>
                  <OutlinedField value={repeat} onChange={setRepeat} label="Ripeti la password" type="password" autoComplete="new-password" enterKeyHint={inviteRequired ? 'next' : 'go'} onSubmit={inviteRequired ? undefined : () => void submit()} />
                  {inviteRequired && <OutlinedField value={code} onChange={setCode} label="Codice famiglia" autoComplete="off" enterKeyHint="go" onSubmit={() => void submit()} />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {error && <div style={{ color: C.dislike, fontSize: 14, lineHeight: '20px' }}>{error}</div>}
          <Pressable pressed={0.97} onClick={() => void submit()} className="brand-glow" style={{ height: 54, borderRadius: 54, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            {busy ? <Spinner size={22} color="#fff" stroke={2} /> : <span style={{ fontWeight: 700, fontSize: 16, position: 'relative' }}>{register ? 'Crea account' : 'Entra'}</span>}
          </Pressable>
          <button type="submit" style={{ display: 'none' }} />
        </form>
        <div onClick={() => { setRegister(!register); setError(null) }} style={{ color: C.accent, fontWeight: 700, fontSize: 14, textAlign: 'center', marginTop: 20, cursor: 'pointer' }}>
          {register ? 'Hai già un account? Entra' : 'Non hai un account? Creane uno'}
        </div>
      </div>
    </div>
  )
}
