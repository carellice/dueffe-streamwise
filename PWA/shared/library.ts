// Port of LibraryStore.java's library logic. Each function takes the current entry (or null) and
// returns the new one: the client saves it with POST /api/library, or removes it (null result
// from restore/remove). The server only stores whole entries, like the native SharedPreferences.
import { newEntry, isSeries, type Episode, type LibraryEntry, type Media, type Season } from './model.ts'

const copy = (e: LibraryEntry | null | undefined, media: Media): LibraryEntry => ({ ...(e ?? newEntry(media)), media })

export function flatten(seasons: Season[]): Episode[] {
  return seasons.flatMap((s) => s.episodes)
}

function indexOfEpisode(all: Episode[], season: number, number: number): number {
  return all.findIndex((e) => e.season === season && e.number === number)
}

export function save(e: LibraryEntry | null, media: Media): LibraryEntry {
  const out = copy(e, media)
  out.state = isSeries(media) ? 'progress' : 'saved'
  if (isSeries(media)) { out.nextSeason = 1; out.nextEpisode = 1; out.watchedSeason = null; out.watchedEpisode = null }
  return out
}

export function watched(e: LibraryEntry | null, media: Media, liked: boolean): LibraryEntry {
  return { ...copy(e, media), state: 'watched', liked }
}

export function markMovieUnwatched(e: LibraryEntry | null, media: Media): LibraryEntry {
  return { ...copy(e, media), state: 'saved', liked: null }
}

export function setLiked(e: LibraryEntry | null, liked: boolean): LibraryEntry | null {
  return e != null && e.state === 'watched' ? { ...e, liked } : null
}

export function hide(e: LibraryEntry | null, media: Media): LibraryEntry {
  return { ...copy(e, media), state: 'hidden' }
}

export function togglePinned(e: LibraryEntry | null): LibraryEntry | null {
  return e == null ? null : { ...e, pinned: !e.pinned }
}

export function restart(e: LibraryEntry | null, media: Media): LibraryEntry {
  return { ...copy(e, media), state: 'progress', nextSeason: 1, nextEpisode: 1, watchedSeason: null, watchedEpisode: null, completedEpisodeCount: 0 }
}

export class ReactionRequired extends Error {
  constructor() {
    super('A reaction is required to finish a series')
  }
}

export function markEpisode(e: LibraryEntry | null, media: Media, episode: Episode, seasons: Season[], liked: boolean | null): LibraryEntry | null {
  const out = copy(e, media)
  const all = flatten(seasons)
  const index = indexOfEpisode(all, episode.season, episode.number)
  if (index < 0) return null
  if (index === all.length - 1 && liked == null && out.liked == null) throw new ReactionRequired()
  out.watchedSeason = episode.season
  out.watchedEpisode = episode.number
  if (index + 1 < all.length) {
    const next = all[index + 1]
    out.state = 'progress'; out.nextSeason = next.season; out.nextEpisode = next.number
  } else {
    out.state = 'watched'; out.completedEpisodeCount = all.length
    if (liked != null) out.liked = liked
  }
  return out
}

export function unwatchEpisode(e: LibraryEntry | null, media: Media, episode: Episode, seasons: Season[]): LibraryEntry {
  const out = copy(e, media)
  const all = flatten(seasons)
  const index = indexOfEpisode(all, episode.season, episode.number)
  out.state = 'progress'; out.nextSeason = episode.season; out.nextEpisode = episode.number
  if (index > 0) {
    const prior = all[index - 1]
    out.watchedSeason = prior.season; out.watchedEpisode = prior.number
  } else { out.watchedSeason = null; out.watchedEpisode = null }
  out.completedEpisodeCount = Math.max(0, index)
  out.liked = null
  return out
}

export function unwatchSeason(e: LibraryEntry | null, media: Media, season: Season, seasons: Season[]): LibraryEntry | null {
  if (season.episodes.length === 0) return null
  return unwatchEpisode(e, media, season.episodes[0], seasons)
}

export function episodeWatched(e: LibraryEntry | null | undefined, ep: Episode, seasons: Season[]): boolean {
  if (e == null || e.watchedSeason == null) return false
  const all = flatten(seasons)
  const index = indexOfEpisode(all, ep.season, ep.number)
  return index <= indexOfEpisode(all, e.watchedSeason, e.watchedEpisode ?? 0) && index >= 0
}

export function completeSeries(e: LibraryEntry | null, media: Media, seasons: Season[], liked: boolean): LibraryEntry {
  const out = copy(e, media)
  const all = flatten(seasons)
  out.state = 'watched'; out.liked = liked; out.completedEpisodeCount = all.length
  if (all.length > 0) {
    const last = all[all.length - 1]
    out.watchedSeason = last.season; out.watchedEpisode = last.number
  }
  return out
}

export function completeSeason(e: LibraryEntry | null, media: Media, season: Season, seasons: Season[], liked: boolean | null): LibraryEntry | null {
  const out = copy(e, media)
  const all = flatten(seasons)
  if (season.episodes.length === 0) return null
  const last = season.episodes[season.episodes.length - 1]
  const index = indexOfEpisode(all, last.season, last.number)
  if (index < 0) return null
  if (index + 1 >= all.length && liked == null && out.liked == null) throw new ReactionRequired()
  out.watchedSeason = last.season; out.watchedEpisode = last.number
  out.completedEpisodeCount = Math.max(out.completedEpisodeCount, index + 1)
  if (index + 1 < all.length) {
    const next = all[index + 1]
    out.state = 'progress'; out.nextSeason = next.season; out.nextEpisode = next.number
  } else {
    out.state = 'watched'
    if (liked != null) out.liked = liked
  }
  return out
}

function episodeAt(seasons: Season[], index: number): Episode | null {
  for (const s of seasons) {
    if (index < s.episodeCount) return { season: s.number, number: index + 1, runtime: 0, name: '', overview: '', still: '' }
    index -= s.episodeCount
  }
  return null
}

/** A finished series with newly announced episodes goes back to "in corso". Null when nothing changes. */
export function reopenForNewEpisodes(e: LibraryEntry | null | undefined, seasons: Season[]): LibraryEntry | null {
  if (e == null || e.state !== 'watched' || e.completedEpisodeCount <= 0) return null
  const all = flatten(seasons)
  const total = all.length === 0 ? seasons.reduce((sum, s) => sum + s.episodeCount, 0) : all.length
  if (total <= e.completedEpisodeCount) return null
  const next = all.length === 0 ? episodeAt(seasons, e.completedEpisodeCount) : all[e.completedEpisodeCount]
  const previous = all.length === 0 ? episodeAt(seasons, e.completedEpisodeCount - 1) : all[e.completedEpisodeCount - 1]
  if (next == null || previous == null) return null
  return { ...e, state: 'progress', nextSeason: next.season, nextEpisode: next.number, watchedSeason: previous.season, watchedEpisode: previous.number }
}

export function advanceFallback(e: LibraryEntry | null, media: Media): LibraryEntry {
  const out = copy(e, media)
  out.state = 'progress'
  out.watchedSeason = out.nextSeason
  out.watchedEpisode = out.nextEpisode
  out.nextEpisode++
  return out
}
