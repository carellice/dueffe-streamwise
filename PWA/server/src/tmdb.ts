// TMDB on the server: the API key (TMDB_API_KEY, set at install) never reaches the browser. The
// app's TmdbApi calls GET /api/tmdb/<path>, answered from here; the release checks use it too.
import { TmdbApi } from '../../shared/tmdb.ts'

const BASE = 'https://api.themoviedb.org/3'
const key = (process.env.TMDB_API_KEY ?? '').trim()

export const tmdbConfigured = () => key !== ''

export class TmdbError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Short-lived cache: many phones and screens ask for the same catalog pages.
const cache = new Map<string, { at: number; body: unknown }>()
const TTL = 10 * 60 * 1000
const MAX = 2000

/** Only TMDB v3 read paths the app uses, no traversal or full URLs. */
export const allowedPath = (path: string) => /^\/[a-z_]+(\/[\w.-]+)*$/i.test(path) && !path.includes('..')

export async function tmdbGet(path: string, params?: Record<string, string> | null, timeout = 12000): Promise<any> {
  if (!tmdbConfigured()) throw new TmdbError(503, 'Manca la chiave TMDB del server: reinstalla StreamWise e inseriscila.')
  if (!allowedPath(path)) throw new TmdbError(400, 'Richiesta TMDB non valida')
  const url = new URL(BASE + path)
  url.searchParams.set('api_key', key)
  url.searchParams.set('language', 'it-IT')
  for (const [k, v] of Object.entries(params ?? {})) if (k !== 'api_key' && k !== 'language') url.searchParams.set(k, v)
  const cacheKey = url.toString()
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < TTL) return hit.body
  let response: Response
  try {
    response = await fetch(url, { headers: { Accept: 'application/json', 'Accept-Language': 'it-IT,it;q=0.9' }, signal: AbortSignal.timeout(timeout) })
  } catch {
    throw new TmdbError(502, 'TMDB non risponde')
  }
  if (!response.ok) throw new TmdbError(response.status === 404 ? 404 : 502, 'TMDB ' + response.status)
  const body = await response.json()
  if (cache.size >= MAX) cache.delete(cache.keys().next().value as string)
  cache.set(cacheKey, { at: Date.now(), body })
  return body
}

/** The same client the app uses, talking to TMDB directly (15 s timeout like ReleaseCheckWorker). */
export const serverTmdb = () => new TmdbApi((path, params) => tmdbGet(path, params, 15000))
