// LibraryStore.java: how each action changes a library entry. Every function takes the current
// entry (or undefined) and returns the entry to save, or null to remove it from the library.

import { emptyEntry, isSeries, type Episode, type LibraryEntry, type Media, type Season } from './model.ts'

export type Library = Map<string, LibraryEntry>

const clone = (e: LibraryEntry): LibraryEntry => ({ ...e })

/** LibraryStore.entry(m): existing entry with fresh media, or a new one. */
function entry(current: LibraryEntry | undefined, m: Media): LibraryEntry {
  const e = current ? clone(current) : emptyEntry(m)
  e.media = m
  return e
}

export const flatten = (seasons: Season[]): Episode[] => seasons.flatMap((s) => s.episodes)

function indexOf(all: Episode[], s: number, n: number): number {
  for (let i = 0; i < all.length; i++) if (all[i].season === s && all[i].number === n) return i
  return -1
}

function episodeAt(seasons: Season[], index: number): Episode | null {
  for (const s of seasons) {
    if (index < s.episodeCount) return { season: s.number, number: index + 1, runtime: 0, name: '', overview: '', still: '' }
    index -= s.episodeCount
  }
  return null
}

export class ReactionRequired extends Error {
  constructor() {
    super('A reaction is required to finish a series')
  }
}

export function save(current: LibraryEntry | undefined, media: Media): LibraryEntry {
  const e = entry(current, media)
  e.state = isSeries(media) ? 'progress' : 'saved'
  if (isSeries(media)) { e.nextSeason = 1; e.nextEpisode = 1; e.watchedSeason = null; e.watchedEpisode = null }
  return e
}

export function watched(current: LibraryEntry | undefined, media: Media, liked: boolean): LibraryEntry {
  const e = entry(current, media)
  e.state = 'watched'
  e.liked = liked
  return e
}

export function markMovieUnwatched(current: LibraryEntry | undefined, media: Media): LibraryEntry {
  const e = entry(current, media)
  e.state = 'saved'
  e.liked = null
  return e
}

export function setLiked(current: LibraryEntry | undefined, liked: boolean): LibraryEntry | undefined {
  if (!current || current.state !== 'watched') return undefined
  return { ...current, liked }
}

export function hide(current: LibraryEntry | undefined, media: Media): LibraryEntry {
  const e = entry(current, media)
  e.state = 'hidden'
  return e
}

export function togglePinned(current: LibraryEntry | undefined): LibraryEntry | undefined {
  return current ? { ...current, pinned: !current.pinned } : undefined
}

export function mergeDetails(current: LibraryEntry | undefined, media: Media): LibraryEntry | undefined {
  return current ? { ...current, media } : undefined
}

export function restart(current: LibraryEntry | undefined, media: Media): LibraryEntry {
  const e = entry(current, media)
  e.state = 'progress'
  e.nextSeason = 1
  e.nextEpisode = 1
  e.watchedSeason = null
  e.watchedEpisode = null
  e.completedEpisodeCount = 0
  return e
}

export function markEpisode(current: LibraryEntry | undefined, media: Media, episode: Episode, seasons: Season[], liked: boolean | null): LibraryEntry | undefined {
  const e = entry(current, media)
  const all = flatten(seasons)
  const index = indexOf(all, episode.season, episode.number)
  if (index < 0) return undefined
  if (index === all.length - 1 && liked == null && e.liked == null) throw new ReactionRequired()
  e.watchedSeason = episode.season
  e.watchedEpisode = episode.number
  if (index + 1 < all.length) {
    const next = all[index + 1]
    e.state = 'progress'
    e.nextSeason = next.season
    e.nextEpisode = next.number
  } else {
    e.state = 'watched'
    e.completedEpisodeCount = all.length
    if (liked != null) e.liked = liked
  }
  return e
}

export function unwatchEpisode(current: LibraryEntry | undefined, media: Media, episode: Episode, seasons: Season[]): LibraryEntry {
  const e = entry(current, media)
  const all = flatten(seasons)
  const index = indexOf(all, episode.season, episode.number)
  e.state = 'progress'
  e.nextSeason = episode.season
  e.nextEpisode = episode.number
  if (index > 0) {
    const prior = all[index - 1]
    e.watchedSeason = prior.season
    e.watchedEpisode = prior.number
  } else {
    e.watchedSeason = null
    e.watchedEpisode = null
  }
  e.completedEpisodeCount = Math.max(0, index)
  e.liked = null
  return e
}

export function unwatchSeason(current: LibraryEntry | undefined, media: Media, season: Season, seasons: Season[]): LibraryEntry | undefined {
  if (!season.episodes.length) return undefined
  return unwatchEpisode(current, media, season.episodes[0], seasons)
}

export function episodeWatched(e: LibraryEntry | undefined, ep: Episode, seasons: Season[]): boolean {
  if (!e || e.watchedSeason == null) return false
  const all = flatten(seasons)
  const at = indexOf(all, ep.season, ep.number)
  return at <= indexOf(all, e.watchedSeason, e.watchedEpisode ?? 0) && at >= 0
}

export function completeSeries(current: LibraryEntry | undefined, media: Media, seasons: Season[], liked: boolean): LibraryEntry {
  const e = entry(current, media)
  const all = flatten(seasons)
  e.state = 'watched'
  e.liked = liked
  e.completedEpisodeCount = all.length
  if (all.length) {
    const last = all[all.length - 1]
    e.watchedSeason = last.season
    e.watchedEpisode = last.number
  }
  return e
}

export function completeSeason(current: LibraryEntry | undefined, media: Media, season: Season, seasons: Season[], liked: boolean | null): LibraryEntry | undefined {
  const e = entry(current, media)
  const all = flatten(seasons)
  if (!season.episodes.length) return undefined
  const last = season.episodes[season.episodes.length - 1]
  const index = indexOf(all, last.season, last.number)
  if (index < 0) return undefined
  if (index + 1 >= all.length && liked == null && e.liked == null) throw new ReactionRequired()
  e.watchedSeason = last.season
  e.watchedEpisode = last.number
  e.completedEpisodeCount = Math.max(e.completedEpisodeCount, index + 1)
  if (index + 1 < all.length) {
    const next = all[index + 1]
    e.state = 'progress'
    e.nextSeason = next.season
    e.nextEpisode = next.number
  } else {
    e.state = 'watched'
    if (liked != null) e.liked = liked
  }
  return e
}

/** A finished series with new episodes goes back to "in corso". Returns the entry to save, or undefined. */
export function reopenForNewEpisodes(current: LibraryEntry | undefined, seasons: Season[]): LibraryEntry | undefined {
  const e = current
  if (!e || e.state !== 'watched' || e.completedEpisodeCount <= 0) return undefined
  const all = flatten(seasons)
  const total = all.length === 0 ? seasons.reduce((sum, s) => sum + s.episodeCount, 0) : all.length
  if (total <= e.completedEpisodeCount) return undefined
  const next = all.length === 0 ? episodeAt(seasons, e.completedEpisodeCount) : all[e.completedEpisodeCount]
  const previous = all.length === 0 ? episodeAt(seasons, e.completedEpisodeCount - 1) : all[e.completedEpisodeCount - 1]
  if (!next || !previous) return undefined
  return { ...e, state: 'progress', nextSeason: next.season, nextEpisode: next.number, watchedSeason: previous.season, watchedEpisode: previous.number }
}

export function advanceFallback(current: LibraryEntry | undefined, media: Media): LibraryEntry {
  const e = entry(current, media)
  e.state = 'progress'
  e.watchedSeason = e.nextSeason
  e.watchedEpisode = e.nextEpisode
  e.nextEpisode++
  return e
}

export const byState = (library: Library, state: string) => [...library.values()].filter((e) => e.state === state)
