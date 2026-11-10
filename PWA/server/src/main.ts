import { createServer as createHttp, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createHttps } from 'node:https'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import * as data from './db.ts'
import * as accounts from './accounts.ts'
import { checkNowFor, pushDevices, runJobsForAll, runReleaseChecksForAll, subscribe, unsubscribe, vapidPublicKey } from './push.ts'
import { tmdbGet, TmdbError } from './tmdb.ts'
import { guideDay } from './guide.ts'
import { AiError, identify, recommend, similar, verify, type RecommendInput, type SimilarInput } from './ai.ts'
import { entryFromJson, personFollowFromJson, providerFromJson, releaseFollowFromJson, type Prefs, type TvReminder } from '../../shared/model.ts'
import { isIsoDate, todayRome } from '../../shared/dates.ts'

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
    // Un cookie malformato di un'altra app sullo stesso indirizzo (porte diverse di Tailscale) non deve far fallire la richiesta.
    if (k) try { out[k] = decodeURIComponent(v.join('=')) } catch { out[k] = v.join('=') }
  }
  return out
}

const secure = (req: IncomingMessage) =>
  (req.socket as { encrypted?: boolean }).encrypted === true || req.headers['x-forwarded-proto'] === 'https'

// --- auth: one account per person, each with its own data -----------------------------------

const SESSION = 'streamwise_session'

/**
 * Il token della sessione: dall'header X-Session, che il browser manda sempre, o dal cookie. Dietro il
 * proxy HTTPS di Tailscale il cookie poteva non tornare indietro e ogni richiesta finiva in 401.
 */
const token = (req: IncomingMessage) => (req.headers['x-session'] as string | undefined) || cookies(req)[SESSION]

const sessionUser = (req: IncomingMessage) => accounts.sessionUser(token(req)) ?? accounts.sessionUser(cookies(req)[SESSION])

/** Apre la sessione: il token va nel cookie e torna anche nella risposta, per l'header X-Session. */
function startSession(req: IncomingMessage, res: ServerResponse, userId: number): string {
  const value = accounts.startSession(userId)
  const flags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 400}${secure(req) ? '; Secure' : ''}`
  res.setHeader('Set-Cookie', `${SESSION}=${value}; ${flags}`)
  return value
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
  json(res, 200, { loggedIn: user != null, username: user?.username ?? null, version: VERSION })
})

route('POST', '/api/register', async (req, res) => {
  const { username, password } = await readJson<{ username?: string; password?: string }>(req)
  accountCall(() => {
    const user = accounts.register(String(username ?? ''), String(password ?? ''))
    json(res, 200, { username: user.username, token: startSession(req, res, user.id) })
  })
})

route('POST', '/api/login', async (req, res) => {
  const { username, password } = await readJson<{ username?: string; password?: string }>(req)
  const user = accounts.login(String(username ?? ''), String(password ?? ''))
  if (!user) {
    await new Promise((r) => setTimeout(r, 800))
    throw new HttpError(401, 'Nome utente o password sbagliati')
  }
  json(res, 200, { username: user.username, token: startSession(req, res, user.id) })
})

route('POST', '/api/logout', (req, res) => {
  const value = token(req)
  if (value) accounts.endSession(value)
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

// --- library, follows, preferences: whole objects, like the native SharedPreferences ---------

route('POST', '/api/library', async (req, res) => {
  const entry = entryFromJson(await readJson(req))
  if (!entry.media.id) throw new HttpError(400, 'Titolo non valido')
  data.saveEntry(entry)
  json(res, 200, { ok: true })
})
route('DELETE', '/api/library', (_req, res, _p, url) => {
  data.deleteEntry(url.searchParams.get('id') ?? '')
  json(res, 200, { ok: true })
})

route('POST', '/api/follows', async (req, res, _p, _u, user) => {
  const follow = releaseFollowFromJson(await readJson(req))
  if (!follow.media.id) throw new HttpError(400, 'Titolo non valido')
  data.saveFollow(follow)
  // Without fresh release data the first check fixes the baseline (ReleaseFollows.follow).
  if (!follow.initialized) checkNowFor(user.id)
  json(res, 200, { ok: true })
})
route('DELETE', '/api/follows', (_req, res, _p, url) => {
  data.deleteFollow(url.searchParams.get('id') ?? '')
  json(res, 200, { ok: true })
})

route('POST', '/api/people', async (req, res, _p, _u, user) => {
  const follow = personFollowFromJson(await readJson(req))
  if (!(follow.person.id > 0)) throw new HttpError(400, 'Persona non valida')
  data.savePerson(follow)
  // The first check records the current filmography silently.
  checkNowFor(user.id)
  json(res, 200, { ok: true })
})
route('DELETE', '/api/people', (_req, res, _p, url) => {
  data.deletePerson(url.searchParams.get('key') ?? '')
  json(res, 200, { ok: true })
})

route('POST', '/api/prefs', async (req, res) => {
  const body = await readJson<Partial<Prefs>>(req)
  const allowed: (keyof Prefs)[] = ['genres', 'subscriptions', 'subscriptionFilters', 'librarySort', 'libraryGrid', 'hideShowCredits', 'onboardingDone']
  const changes: Partial<Prefs> = {}
  for (const key of allowed) if (key in body) (changes as Record<string, unknown>)[key] = body[key]
  data.setPrefs(changes)
  json(res, 200, { ok: true })
})

route('POST', '/api/availability', async (req, res) => {
  const body = await readJson<{ id?: string; providers?: unknown[] }>(req)
  if (!body.id) throw new HttpError(400, 'Titolo non valido')
  const providers = (body.providers ?? []).map(providerFromJson)
  data.saveAvailability(body.id, { checkedAt: Date.now(), providers }, providers)
  json(res, 200, { ok: true })
})

// TV reminders (TvReminderReceiver.save): delivered by Web Push at the chosen time.
route('POST', '/api/reminders', async (req, res) => {
  const r = await readJson<Partial<TvReminder>>(req)
  const minutes = Math.trunc(Number(r.minutes))
  const start = Number(r.start)
  const end = Number(r.end)
  if (!r.key || !r.title || !r.channel || !Number.isFinite(start) || !Number.isFinite(end)) throw new HttpError(400, 'Promemoria non valido')
  const trigger = start - minutes * 60000
  if (!(minutes >= 1 && minutes <= 1440) || trigger <= Date.now()) throw new HttpError(400, 'Scegli un anticipo più breve: l’orario del promemoria è già passato.')
  data.saveReminder({ key: r.key, title: r.title, channel: r.channel, start, end, minutes, trigger })
  json(res, 200, { ok: true })
})
route('DELETE', '/api/reminders', (_req, res, _p, url) => {
  data.deleteReminder(url.searchParams.get('key') ?? '')
  json(res, 200, { ok: true })
})

/** ReleaseCheckWorker.refreshOnLaunch / checkNow: force=1 from "Ricontrolla", else at most every 30 minutes. */
route('POST', '/api/check', (_req, res, _p, url, user) => {
  const last = Number(data.getMeta('last_check') ?? '0')
  if (url.searchParams.get('force') === '1' || Date.now() - last > 30 * 60 * 1000) checkNowFor(user.id)
  json(res, 200, { ok: true })
})

// --- TMDB proxy: the key stays here ----------------------------------------------------------

route('GET', '/api/tmdb/.+', async (_req, res, _p, url) => {
  const path = url.pathname.slice('/api/tmdb'.length)
  const params: Record<string, string> = {}
  for (const [k, v] of url.searchParams) params[k] = v
  try {
    const body = await tmdbGet(path, params)
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=300' })
    res.end(JSON.stringify(body))
  } catch (e) {
    if (e instanceof TmdbError) throw new HttpError(e.status, e.message)
    throw e
  }
})

route('GET', '/api/guide', async (_req, res, _p, url) => {
  const date = url.searchParams.get('date') ?? todayRome()
  if (!isIsoDate(date)) throw new HttpError(400, 'Data non valida')
  let day
  try {
    day = await guideDay(date, url.searchParams.get('force') === '1')
  } catch (e) {
    console.warn('Guida TV non disponibile:', (e as Error).message)
    throw new HttpError(502, 'Guida TV non disponibile')
  }
  json(res, 200, day)
})

// --- AI (Cloudflare Workers AI with the user's own account) -----------------------------------

async function aiCall<T>(res: ServerResponse, work: () => Promise<T>) {
  let result: T
  try {
    result = await work()
  } catch (e) {
    if (e instanceof AiError) throw new HttpError(502, e.message)
    throw e
  }
  json(res, 200, result)
}
const strings = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 200) : [])

route('POST', '/api/ai/config', async (req, res) => {
  const { accountId, token } = await readJson<{ accountId?: string; token?: string }>(req)
  const id = String(accountId ?? '').trim()
  const secret = String(token ?? '').trim()
  await aiCall(res, async () => {
    await verify(id, secret)
    data.setAi(id, secret)
    return { ok: true }
  })
})
route('DELETE', '/api/ai/config', (_req, res) => {
  data.setAi('', '')
  json(res, 200, { ok: true })
})
route('POST', '/api/ai/recommend', async (req, res) => {
  const body = await readJson<Partial<RecommendInput>>(req)
  await aiCall(res, () => recommend({ type: String(body.type ?? ''), request: String(body.request ?? ''), liked: strings(body.liked), disliked: strings(body.disliked), watching: strings(body.watching), exclude: strings(body.exclude), count: Number(body.count) || 8 }))
})
route('POST', '/api/ai/similar', async (req, res) => {
  const body = await readJson<Partial<SimilarInput>>(req)
  await aiCall(res, () => similar({ title: String(body.title ?? ''), year: String(body.year ?? ''), type: String(body.type ?? ''), genres: strings(body.genres), liked: strings(body.liked), exclude: strings(body.exclude), count: Number(body.count) || 8 }))
})
route('POST', '/api/ai/identify', async (req, res) => {
  const body = await readJson<{ clues?: unknown[]; exclude?: unknown }>(req)
  const clues = (Array.isArray(body.clues) ? body.clues : []).filter(Array.isArray).map((c) => [String((c as unknown[])[0] ?? ''), String((c as unknown[])[1] ?? '')] as [string, string])
  await aiCall(res, () => identify(clues, strings(body.exclude)))
})

// --- backup: the same streamwise-backup.json as the Android app -------------------------------

route('GET', '/api/backup', (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data.exportBackup(), null, 2))
})
route('POST', '/api/backup', async (req, res, _p, _u, user) => {
  const root = await readJson<Record<string, unknown>>(req)
  if (!root || typeof root !== 'object' || !data.importBackup(root)) throw new HttpError(400, 'Questo file non è un backup di StreamWise.')
  checkNowFor(user.id)
  json(res, 200, { ok: true })
})

// Push
route('GET', '/api/push/key', (_req, res) => json(res, 200, { key: vapidPublicKey }))
route('POST', '/api/push/subscribe', async (req, res, _p, _u, user) => {
  const { subscription, reminders } = await readJson<{ subscription: Parameters<typeof subscribe>[0]; reminders: boolean }>(req)
  if (!subscription?.endpoint) throw new HttpError(400, 'Iscrizione non valida')
  subscribe(subscription, reminders !== false, user.id)
  json(res, 200, { ok: true })
})
route('GET', '/api/push/devices', (_req, res) => json(res, 200, { devices: pushDevices() }))
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

await runJobsForAll()
// TV reminders on time, like the exact alarms of the phone.
setInterval(() => { runJobsForAll().catch((e) => console.error(e)) }, 30 * 1000)
// Like WorkManager's periodic release check, for every account, every hour.
setTimeout(() => { runReleaseChecksForAll().catch((e) => console.error(e)) }, 60 * 1000)
setInterval(() => { runReleaseChecksForAll().catch((e) => console.error(e)) }, 60 * 60 * 1000)

createHttp(handle).listen(PORT, () => console.log(`StreamWise ${VERSION} su http://0.0.0.0:${PORT}`))

const cert = join(certDir, 'server.crt')
const key = join(certDir, 'server.key')
if (existsSync(cert) && existsSync(key)) {
  createHttps({ cert: readFileSync(cert), key: readFileSync(key) }, handle)
    .listen(HTTPS_PORT, () => console.log(`StreamWise in HTTPS su https://0.0.0.0:${HTTPS_PORT}`))
}
