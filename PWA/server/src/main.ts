import { createServer as createHttp, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createHttps } from 'node:https'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import * as data from './db.ts'
import * as accounts from './accounts.ts'
import * as ai from './ai.ts'
import { AiError } from './ai.ts'
import { loadGuide } from './guide.ts'
import { checkOnLaunch, checkReleases, remindersForAll, runJobsForAll, subscribe, unsubscribe, vapidPublicKey } from './push.ts'
import { pathAllowed, tmdbConfigured, tmdbGet, TmdbError } from './tmdb.ts'
import { today } from '../../shared/dates.ts'
import { initializeFollow } from '../../shared/follows.ts'
import { entryFrom, mediaFrom, newReleaseFollow, personFrom, programmeKey, type Programme } from '../../shared/model.ts'
import type { ReleaseInfo } from '../../shared/tmdb.ts'

const PORT = Number(process.env.PORT ?? 8080)
const HTTPS_PORT = Number(process.env.HTTPS_PORT ?? 8443)
const publicDir = process.env.PUBLIC_DIR ?? join(import.meta.dirname, '..', 'public')
const certDir = join(data.dataDir, 'certs')
// The version the updater compares with GitHub: bump it in package.json to release.
const VERSION = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')).version as string

// Node runs this file with type stripping: no enums, namespaces or parameter properties.
class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// --- helpers ---------------------------------------------------------------------------------

function json(res: ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(text)
}

async function readBody(req: IncomingMessage, limit = 25 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) throw new HttpError(413, 'File troppo grande')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const body = await readBody(req)
  try {
    return JSON.parse(body.toString('utf8')) as T
  } catch {
    throw new HttpError(400, 'Richiesta non valida')
  }
}

function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k) out[k] = decodeURIComponent(v.join('='))
  }
  return out
}

const secure = (req: IncomingMessage) =>
  (req.socket as { encrypted?: boolean }).encrypted === true || req.headers['x-forwarded-proto'] === 'https'

// --- auth: one account per person, each with its own data -----------------------------------

const SESSION = 'streamwise_session'

const sessionUser = (req: IncomingMessage) => accounts.sessionUser(cookies(req)[SESSION])

function startSession(req: IncomingMessage, res: ServerResponse, userId: number) {
  const token = accounts.startSession(userId)
  const flags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 400}${secure(req) ? '; Secure' : ''}`
  res.setHeader('Set-Cookie', `${SESSION}=${token}; ${flags}`)
}

function clearSession(res: ServerResponse) {
  res.setHeader('Set-Cookie', `${SESSION}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

/** Account mistakes (name taken, short password...) reach the user as they are. */
function accountCall(work: () => void) {
  try {
    work()
  } catch (e) {
    if (e instanceof accounts.AccountError) throw new HttpError(400, e.message)
    throw e
  }
}

// --- static files ----------------------------------------------------------------------------

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.crt': 'application/x-x509-ca-cert', '.txt': 'text/plain; charset=utf-8',
}

function sendFile(req: IncomingMessage, res: ServerResponse, file: string, cache: string) {
  const stat = statSync(file)
  const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304)
    res.end()
    return
  }
  res.writeHead(200, {
    'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': cache,
    ETag: etag,
  })
  if (req.method === 'HEAD') res.end()
  else createReadStream(file).pipe(res)
}

function serveStatic(req: IncomingMessage, res: ServerResponse, path: string) {
  const clean = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, '')
  const file = join(publicDir, clean)
  if (file.startsWith(publicDir) && clean && existsSync(file) && statSync(file).isFile()) {
    const immutable = clean.startsWith('assets')
    sendFile(req, res, file, immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
    return
  }
  // Single page app: every other path gets the shell.
  sendFile(req, res, join(publicDir, 'index.html'), 'no-cache')
}

// --- API -------------------------------------------------------------------------------------

type Handler = (req: IncomingMessage, res: ServerResponse, params: string[], url: URL, user: accounts.User) => Promise<void> | void
const routes: [string, RegExp, Handler][] = []
const route = (method: string, pattern: string, handler: Handler) =>
  routes.push([method, new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '$'), handler])

route('GET', '/api/session', (req, res) => {
  const user = sessionUser(req)
  json(res, 200, { loggedIn: user != null, username: user?.username ?? null, version: VERSION, inviteRequired: accounts.inviteRequired(), tmdb: tmdbConfigured() })
})

route('POST', '/api/register', async (req, res) => {
  const { username, password, code } = await readJson<{ username?: string; password?: string; code?: string }>(req)
  accountCall(() => {
    const user = accounts.register(String(username ?? ''), String(password ?? ''), String(code ?? ''))
    startSession(req, res, user.id)
    json(res, 200, { username: user.username })
  })
})

route('POST', '/api/login', async (req, res) => {
  const { username, password } = await readJson<{ username?: string; password?: string }>(req)
  const user = accounts.login(String(username ?? ''), String(password ?? ''))
  if (!user) {
    await new Promise((r) => setTimeout(r, 800))
    throw new HttpError(401, 'Nome utente o password sbagliati')
  }
  startSession(req, res, user.id)
  json(res, 200, { username: user.username })
})

route('POST', '/api/logout', (req, res) => {
  const token = cookies(req)[SESSION]
  if (token) accounts.endSession(token)
  clearSession(res)
  json(res, 200, { ok: true })
})

route('POST', '/api/account/password', async (req, res, _p, _u, user) => {
  const { current, password } = await readJson<{ current?: string; password?: string }>(req)
  accountCall(() => accounts.changePassword(user.id, String(current ?? ''), String(password ?? '')))
  json(res, 200, { ok: true })
})

route('POST', '/api/account/delete', async (req, res, _p, _u, user) => {
  const { password } = await readJson<{ password?: string }>(req)
  accountCall(() => accounts.deleteAccount(user.id, String(password ?? '')))
  clearSession(res)
  json(res, 200, { ok: true })
})

/** Everything the app shows; "unchanged" when the client already has this revision (polling every 30 s). */
route('GET', '/api/state', (_req, res, _p, url) => {
  const rev = data.revision()
  if (url.searchParams.get('since') === String(rev)) {
    json(res, 200, { revision: rev, unchanged: true })
    return
  }
  json(res, 200, { revision: rev, ...data.state() })
})


// --- library: the client sends whole entries, computed with shared/library.ts like LibraryStore --

route('POST', '/api/library', async (req, res) => {
  const { entries, removed } = await readJson<{ entries?: unknown[]; removed?: string[] }>(req)
  data.saveEntries((entries ?? []).map(entryFrom), (removed ?? []).map(String))
  json(res, 200, { ok: true, revision: data.revision() })
})

route('POST', '/api/prefs', async (req, res) => {
  data.savePrefs(await readJson<Partial<data.Prefs>>(req))
  json(res, 200, { ok: true, revision: data.revision() })
})

// --- followed titles and people (ReleaseFollows / PersonFollows) ------------------------------

route('POST', '/api/follows', async (req, res) => {
  const { media, info } = await readJson<{ media?: unknown; info?: ReleaseInfo | null }>(req)
  const follow = newReleaseFollow(mediaFrom(media))
  if (!follow.media.id) throw new HttpError(400, 'Titolo non valido')
  // With fresh release data the baseline is fixed now; otherwise the check below sets it.
  if (info) initializeFollow(follow, info, today())
  data.saveFollow(follow)
  if (!info) void checkReleases(true).catch((e) => console.error(e))
  json(res, 200, { ok: true, revision: data.revision() })
})

route('DELETE', '/api/follows/:id', (_req, res, params) => {
  data.unfollow(decodeURIComponent(params[0]))
  json(res, 200, { ok: true, revision: data.revision() })
})

route('POST', '/api/people', async (req, res) => {
  const { person } = await readJson<{ person?: unknown }>(req)
  const p = personFrom(person)
  if (p.id <= 0) throw new HttpError(400, 'Persona non valida')
  // The first check records the current filmography silently.
  data.savePerson({ person: p, followedAt: Date.now(), initialized: false, known: [] })
  void checkReleases(true).catch((e) => console.error(e))
  json(res, 200, { ok: true, revision: data.revision() })
})

route('DELETE', '/api/people/:key', (_req, res, params) => {
  data.unfollowPerson(decodeURIComponent(params[0]))
  json(res, 200, { ok: true, revision: data.revision() })
})

/** The app was opened: ReleaseCheckWorker.refreshOnLaunch. */
route('POST', '/api/follows/check', (_req, res) => {
  checkOnLaunch()
  json(res, 200, { ok: true })
})

// --- TV guide and reminders (TvGuideRepository / TvReminderReceiver) --------------------------

route('GET', '/api/guide', async (_req, res, _p, url) => {
  try {
    json(res, 200, await loadGuide(url.searchParams.get('force') === '1'))
  } catch {
    throw new HttpError(502, 'Guida TV non disponibile')
  }
})

route('POST', '/api/reminders', async (req, res) => {
  const { programme, minutes } = await readJson<{ programme?: Programme; minutes?: number }>(req)
  if (!programme?.start || !programme.end || !programme.title) throw new HttpError(400, 'Programma non valido')
  const m = Math.trunc(Number(minutes))
  const trigger = programme.start - m * 60_000
  if (!(m >= 1 && m <= 1440) || trigger <= Date.now()) throw new HttpError(400, 'Scegli un anticipo più breve: l’orario del promemoria è già passato.')
  data.saveReminder({ key: programmeKey(programme), title: programme.title, channel: programme.channel, start: programme.start, end: programme.end, minutes: m, trigger })
  json(res, 200, { ok: true, revision: data.revision() })
})

route('DELETE', '/api/reminders', (_req, res, _p, url) => {
  data.deleteReminder(url.searchParams.get('key') ?? '')
  json(res, 200, { ok: true, revision: data.revision() })
})

// --- TMDB proxy: the API key stays on the server ------------------------------------------------

route('GET', '/api/tmdb/.+', async (_req, res, _p, url) => {
  const path = url.pathname.slice('/api/tmdb'.length)
  if (!pathAllowed(path)) throw new HttpError(404, 'Non trovato')
  const params: Record<string, string> = {}
  for (const [k, v] of url.searchParams) if (k !== 'api_key' && k !== 'language') params[k] = v
  try {
    const body = await tmdbGet(path, params)
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=300' })
    res.end(JSON.stringify(body))
  } catch (e) {
    if (e instanceof TmdbError) throw new HttpError(e.status, e.message)
    throw e
  }
})

// --- AI (AiAdvisor): credentials of each account, never sent back -----------------------------

const aiCall = async <T>(work: () => Promise<T>): Promise<T> => {
  try {
    return await work()
  } catch (e) {
    if (e instanceof AiError) throw new HttpError(502, e.message)
    throw e
  }
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? '')).filter(Boolean).slice(0, 120) : [])

route('GET', '/api/ai', (_req, res) => json(res, 200, { configured: ai.aiConfigured(), accountId: data.getMeta('ai-account-id') ?? '' }))

route('POST', '/api/ai/setup', async (req, res) => {
  const { accountId, apiToken } = await readJson<{ accountId?: string; apiToken?: string }>(req)
  const id = String(accountId ?? '').trim(), token = String(apiToken ?? '').trim()
  await aiCall(() => ai.verify(id, token))
  ai.saveAi(id, token)
  json(res, 200, { ok: true, revision: data.revision() })
})

route('DELETE', '/api/ai/setup', (_req, res) => {
  ai.clearAi()
  json(res, 200, { ok: true, revision: data.revision() })
})

route('POST', '/api/ai/recommend', async (req, res) => {
  const b = await readJson<{ type?: string; request?: string; liked?: string[]; disliked?: string[]; watching?: string[]; exclude?: string[] }>(req)
  json(res, 200, await aiCall(() => ai.recommend(String(b.type ?? 'all'), String(b.request ?? ''), strings(b.liked), strings(b.disliked), strings(b.watching), strings(b.exclude))))
})

route('POST', '/api/ai/similar', async (req, res) => {
  const b = await readJson<{ title?: string; year?: string; type?: string; genres?: string[]; liked?: string[]; exclude?: string[] }>(req)
  json(res, 200, await aiCall(() => ai.similar(String(b.title ?? ''), String(b.year ?? ''), String(b.type ?? 'movie'), strings(b.genres), strings(b.liked), strings(b.exclude))))
})

route('POST', '/api/ai/identify', async (req, res) => {
  const b = await readJson<{ clues?: [string, string][]; exclude?: string[] }>(req)
  const clues = (Array.isArray(b.clues) ? b.clues : []).filter((c) => Array.isArray(c)).map((c) => [String(c[0] ?? ''), String(c[1] ?? '')] as [string, string])
  json(res, 200, await aiCall(() => ai.identify(clues, strings(b.exclude))))
})

// --- backup: the same JSON file as the phone (streamwise-backup) -------------------------------

route('GET', '/api/backup', (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="streamwise-backup.json"' })
  res.end(JSON.stringify(data.exportBackup(), null, 2))
})

route('POST', '/api/backup', async (req, res) => {
  let parsed: unknown
  try { parsed = JSON.parse((await readBody(req)).toString('utf8')) } catch { throw new HttpError(400, 'Il file non è un backup di StreamWise.') }
  if (!data.importBackup(parsed)) throw new HttpError(400, 'Il file non è un backup di StreamWise.')
  void checkReleases(true).catch((e) => console.error(e))
  json(res, 200, { ok: true, revision: data.revision() })
})

// Push
route('GET', '/api/push/key', (_req, res) => json(res, 200, { key: vapidPublicKey }))
route('POST', '/api/push/subscribe', async (req, res, _p, _u, user) => {
  const { subscription, reminders } = await readJson<{ subscription: Parameters<typeof subscribe>[0]; reminders: boolean }>(req)
  if (!subscription?.endpoint) throw new HttpError(400, 'Iscrizione non valida')
  subscribe(subscription, reminders !== false, user.id)
  json(res, 200, { ok: true })
})
route('POST', '/api/push/unsubscribe', async (req, res) => {
  const { endpoint } = await readJson<{ endpoint: string }>(req)
  if (endpoint) unsubscribe(endpoint)
  json(res, 200, { ok: true })
})

// --- server ----------------------------------------------------------------------------------

const open = new Set(['/api/session', '/api/register', '/api/login', '/api/logout'])

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname
  try {
    if (path === '/certificato' || path === '/streamwise-ca.crt') {
      const ca = join(certDir, 'streamwise-ca.crt')
      if (!existsSync(ca)) throw new HttpError(404, 'HTTPS locale non attivo')
      if (path === '/streamwise-ca.crt') sendFile(req, res, ca, 'no-cache')
      else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(certificatePage(req))
      }
      return
    }
    if (path.startsWith('/api/')) {
      const user = sessionUser(req)
      if (!open.has(path) && !user) throw new HttpError(401, 'Accesso richiesto')
      for (const [method, pattern, handler] of routes) {
        const match = pattern.exec(path)
        if (match && method === req.method) {
          // Everything the handler reads or writes belongs to the logged in account.
          if (user) await data.withUser(user.id, () => handler(req, res, match.slice(1), url, user))
          else await handler(req, res, match.slice(1), url, { id: 0, username: '' })
          return
        }
      }
      throw new HttpError(404, 'Non trovato')
    }
    serveStatic(req, res, path)
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    if (status === 500) console.error(e)
    if (!res.headersSent) json(res, status, { error: e instanceof HttpError ? e.message : 'Errore del server' })
    else res.end()
  }
}

/** How to trust the local certificate authority, for the "HTTPS in casa" mode. */
function certificatePage(req: IncomingMessage): string {
  const host = (req.headers.host ?? '').split(':')[0]
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>StreamWise · certificato</title><style>body{font-family:system-ui,sans-serif;background:#0A0B10;color:#15121F;max-width:560px;margin:auto;padding:24px;line-height:1.5}
a.b{display:inline-block;background:#B8A6FF;color:#15121F;padding:14px 22px;border-radius:99px;text-decoration:none;font-weight:600}li{margin:6px 0}</style></head><body>
<h1>Installa il certificato di StreamWise</h1><p>Serve una volta sola per telefono: dopo, StreamWise si apre in HTTPS e si può installare come app.</p>
<p><a class="b" href="/streamwise-ca.crt">Scarica il certificato</a></p>
<h3>Android</h3><ol><li>Scarica il file qui sopra.</li><li>Impostazioni → Sicurezza e privacy → Altre impostazioni di sicurezza → Installa da memoria → <b>Certificato CA</b>.</li><li>Scegli <i>streamwise-ca.crt</i> e conferma.</li></ol>
<h3>iPhone</h3><ol><li>Apri questa pagina con Safari e scarica il file.</li><li>Impostazioni → Profilo scaricato → Installa.</li><li>Impostazioni → Generali → Info → Impostazioni attendibilità certificati → attiva <i>StreamWise CA</i>.</li></ol>
<p>Poi apri <b>https://${host}:${HTTPS_PORT}</b></p></body></html>`
}

void runJobsForAll()
// Like WorkManager's periodic job (every 2 hours, looked at every 10 minutes so restarts catch up).
setInterval(runJobsForAll, 10 * 60 * 1000)
// Like the exact alarms of the TV reminders.
setInterval(remindersForAll, 30 * 1000)

createHttp(handle).listen(PORT, () => console.log(`StreamWise ${VERSION} su http://0.0.0.0:${PORT}`))

const cert = join(certDir, 'server.crt')
const key = join(certDir, 'server.key')
if (existsSync(cert) && existsSync(key)) {
  createHttps({ cert: readFileSync(cert), key: readFileSync(key) }, handle)
    .listen(HTTPS_PORT, () => console.log(`StreamWise in HTTPS su https://0.0.0.0:${HTTPS_PORT}`))
}
