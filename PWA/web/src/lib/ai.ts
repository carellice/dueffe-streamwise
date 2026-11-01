import type { AiIdentification, AiPick, Media } from '../../../shared/model.ts'
import { api } from './api.ts'
import { tmdb } from './tmdb.ts'

// AiAdvisor calls, run by the server with the account's own Cloudflare credentials.

export const FALLBACK_ERROR = "Non riesco a contattare l'IA. Controlla la connessione e riprova."

export const recommend = (body: { type: string; request: string; liked: string[]; disliked: string[]; watching: string[]; exclude: string[] }) =>
  api<AiPick[]>('/api/ai/recommend', { method: 'POST', json: body })

export const similar = (body: { title: string; year: string; type: string; genres: string[]; liked: string[]; exclude: string[] }) =>
  api<AiPick[]>('/api/ai/similar', { method: 'POST', json: body })

export const identify = (clues: [string, string][], exclude: string[]) =>
  api<AiIdentification>('/api/ai/identify', { method: 'POST', json: { clues, exclude } })

export const normalizedTitle = (value: string) => value.normalize('NFD').toLowerCase().replace(/[^\p{L}\p{Nd}]/gu, '')

/**
 * Matches an AI pick to its TMDB entry. The AI gives the original title, while search results are
 * sorted by their Italian title, so a lesser namesake without poster or plot could win: candidates
 * are scored on both titles, the year and how complete their data is.
 */
export async function resolveAiPick(pick: AiPick): Promise<Media | null> {
  try {
    const wanted = normalizedTitle(pick.title)
    const candidates = (await tmdb.searchTitles(pick.title, null)).filter((m) => m.mediaType === pick.type)
    const score = (media: Media) => {
      const titles = [media.title, media.originalTitle].map(normalizedTitle).filter(Boolean)
      const titleScore = titles.some((t) => t === wanted) ? 0
        : titles.some((t) => t.startsWith(wanted) || wanted.startsWith(t)) ? 1
          : titles.some((t) => t.includes(wanted) || wanted.includes(t)) ? 2 : 4
      const year = /^\d+$/.test(media.year) ? Number(media.year) : null
      const gap = year != null && pick.year != null ? Math.abs(pick.year - year) : null
      const yearScore = pick.year == null ? 1 : gap == null ? 3 : gap === 0 ? 0 : gap === 1 ? 1 : 4
      const missing = (media.poster ? 0 : 3) + (!media.overview || media.overview === 'Trama non disponibile.' ? 1 : 0)
      return titleScore * 3 + yearScore * 2 + missing
    }
    let best: Media | null = null
    let bestScore = Infinity
    for (const m of candidates) {
      const s = score(m)
      if (s < bestScore || (s === bestScore && best && (m.rating || 0) > (best.rating || 0))) { best = m; bestScore = s }
    }
    return best
  } catch {
    return null
  }
}

/** Resolves every pick at once and keeps the first of each TMDB id. */
export async function resolvePicks(picks: AiPick[]): Promise<[Media, string][]> {
  const resolved = await Promise.all(picks.map(async (pick) => {
    const media = await resolveAiPick(pick)
    return media ? ([media, pick.reason] as [Media, string]) : null
  }))
  const seen = new Set<string>()
  return resolved.filter((r): r is [Media, string] => !!r && !seen.has(r[0].id) && !!seen.add(r[0].id))
}
