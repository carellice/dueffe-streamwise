import { TmdbApi, type Params } from '../../../shared/tmdb.ts'
import { api } from './api.ts'

// The same TmdbApi as the phone; requests go through the server, which adds the API key.
export const tmdb = new TmdbApi(async (path: string, params: Params | null) => {
  const query = new URLSearchParams(params ?? {}).toString()
  return api<Record<string, any>>(`/api/tmdb${path}${query ? '?' + query : ''}`)
})

/** runCatching { ... }.getOrDefault(fallback) */
export async function attempt<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try { return await work() } catch { return fallback }
}

/** Interleaves two lists: m0, s0, m1, s1... (the native Home rails mix films and series). */
export function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i])
    if (i < b.length) out.push(b[i])
  }
  return out
}
