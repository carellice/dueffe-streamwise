import { TmdbApi, type Params } from '../../shared/tmdb.ts'

// TMDB with the server's key (TMDB_API_KEY, asked by the installer). The phone app had the key
// built into the APK; here it never leaves the server: the browser calls /api/tmdb/<path>.

const KEY = (process.env.TMDB_API_KEY ?? '').trim()
const BASE = 'https://api.themoviedb.org/3'

export const tmdbConfigured = () => KEY !== ''

export class TmdbError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Short memory of recent answers: many phones open the same catalog pages. */
const cache = new Map<string, { at: number; body: Record<string, unknown> }>()
const TTL = 10 * 60 * 1000
const MAX = 800

function remember(url: string, body: Record<string, unknown>) {
  cache.set(url, { at: Date.now(), body })
  if (cache.size > MAX) cache.delete(cache.keys().next().value!)
}

/** Paths the web app may ask for (everything TmdbApi uses), so the proxy is not an open door to the key. */
const allowed = [
  /^\/discover\/(movie|tv)$/, /^\/trending\/(movie|tv)\/week$/, /^\/movie\/now_playing$/, /^\/tv\/on_the_air$/,
  /^\/(movie|tv)\/\d+$/, /^\/(movie|tv)\/\d+\/(recommendations|similar|images|watch\/providers|release_dates)$/,
  /^\/tv\/\d+\/season\/\d+$/, /^\/collection\/\d+$/, /^\/search\/(movie|tv|person|keyword)$/,
  /^\/person\/\d+\/combined_credits$/, /^\/watch\/providers\/(movie|tv)$/,
]

export const pathAllowed = (path: string) => allowed.some((r) => r.test(path))

export async function tmdbGet(path: string, params: Params | null, timeout = 12000): Promise<Record<string, unknown>> {
  if (!KEY) throw new TmdbError(503, 'Chiave TMDB mancante: reinstalla StreamWise indicando la tua API Key TMDB.')
  const url = new URL(BASE + path)
  url.searchParams.set('api_key', KEY)
  url.searchParams.set('language', 'it-IT')
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v)
  const key = url.toString()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.body
  let response: Response
  try {
    response = await fetch(url, { headers: { 'Accept-Language': 'it-IT,it;q=0.9', Accept: 'application/json' }, signal: AbortSignal.timeout(timeout) })
  } catch {
    throw new TmdbError(502, 'TMDB non risponde. Riprova tra poco.')
  }
  if (!response.ok) throw new TmdbError(response.status === 404 ? 404 : 502, `TMDB ${response.status}`)
  const body = await response.json() as Record<string, unknown>
  remember(key, body)
  return body
}

/** The same client the app uses, for the background checks (15 s timeout, like ReleaseCheckWorker). */
export const serverTmdb = new TmdbApi((path, params) => tmdbGet(path, params, 15000))
