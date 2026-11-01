import { gunzipSync } from 'node:zlib'
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { romeClock } from '../../shared/dates.ts'
import { programmeKey, type Programme } from '../../shared/model.ts'
import { dataDir } from './db.ts'

// TvGuideRepository.java: the public EPGShare01 schedules of the main Italian terrestrial channels,
// kept for 30 minutes. Downloaded by the server (the browser could not read it cross-origin).

export const SOURCE = 'https://epgshare01.online/epgshare01/epg_ripper_IT1.xml.gz'

const CHANNELS = new Map<string, string>([
  ['Rai.1.HD..101.it', 'Rai 1'], ['Rai.2.HD..102.it', 'Rai 2'], ['Rai.3.HD..103.it', 'Rai 3'],
  ['Rete.4.it', 'Rete 4'], ['Canale.5.it', 'Canale 5'], ['Italia.1.it', 'Italia 1'], ['LA7.HD.it', 'La7'],
  ['TV8.HD.it', 'TV8'], ['NOVE.HD..149.it', 'Nove'], ['20.it', '20'], ['Rai.4..5021.it', 'Rai 4'],
  ['Iris.it', 'Iris'], ['Rai.5..5023.it', 'Rai 5'], ['Rai.Movie..5024.it', 'Rai Movie'],
  ['Rai.Premium..5025.it', 'Rai Premium'], ['cielo.it', 'Cielo'], ['27.Twentyseven.it', 'Twentyseven'],
  ['La.5.it', 'La 5'], ['Real.Time.HD..160.it', 'Real Time'], ['Mediaset.Extra.it', 'Mediaset Extra'],
  ['Italia.2.it', 'Italia 2'], ['GIALLO.HD..167.it', 'Giallo'], ['Top.Crime.it', 'Top Crime'],
  ['Cine34.it', 'Cine34'], ['Warner.TV.it', 'Warner TV'], ['LA7.CINEMA.it', 'La7 Cinema'],
  ['Boing.it', 'Boing'], ['Cartoonito.it', 'Cartoonito'], ['Rai.Gulp..5042.it', 'Rai Gulp'],
  ['Rai.Yoyo..5043.it', 'Rai Yoyo'], ['K2.it', 'K2'], ['Frisbee.it', 'Frisbee'], ['Super!.it', 'Super!'],
])
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 20, 21, 22, 23, 24, 25, 26, 27, 30, 31, 55, 66, 38, 39, 34, 37, 29, 40, 46, 42, 43, 41, 44, 47]

export function channelNumber(name: string): number {
  const i = [...CHANNELS.values()].indexOf(name)
  return i >= 0 ? NUMBERS[i] : Number.MAX_SAFE_INTEGER
}

export type Guide = { programmes: Programme[]; dates: string[]; cached: boolean; updatedAt: number; logos: Record<string, string> }

const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag)
  return m ? decode(m[2] ?? m[3] ?? '') : null
}

/** "20251023193000 +0200" → epoch ms (OffsetDateTime with pattern "yyyyMMddHHmmss xx"). */
export function parseTime(text: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s+([+-])(\d{2})(\d{2})$/.exec(text.trim().replace(/\s+/g, ' '))
  if (!m) throw new Error('Bad time ' + text)
  const local = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  const offset = (m[7] === '-' ? -1 : 1) * (+m[8] * 60 + +m[9]) * 60_000
  return local - offset
}

const FILM_GENRES = ['azione', 'commedia', 'drammatico', 'thriller', 'horror', 'avventura', 'fantascienza', 'western', 'romantico', 'fantastico', 'animazione']

function classify(categories: string[], episode: string, director: boolean): string {
  for (const v of categories) if (v === 'film' || v === 'movie') return 'movie'
  for (const v of categories) if (v === 'fiction' || v.includes('serie') || v.includes('sitcom')) return 'tv'
  for (const v of categories) if (['show', 'intrattenimento', 'sport', 'informazione', 'documentario', 'reality', 'notiziario', 'quiz', 'varietà', 'attualit'].some((w) => v.includes(w))) return ''
  if (episode) return 'tv'
  if (director) for (const v of categories) if (FILM_GENRES.includes(v)) return 'movie'
  return ''
}

export function parse(xml: string): Omit<Guide, 'cached' | 'updatedAt'> {
  if (/<!DOCTYPE/i.test(xml.slice(0, 2000))) throw new Error('Unexpected document declaration')
  const programmes = new Map<string, Programme>()
  const dates = new Set<string>()
  const logos: Record<string, string> = {}
  for (const m of xml.matchAll(/<channel\b([^>]*)>([\s\S]*?)<\/channel>/g)) {
    const id = attr(m[1], 'id')
    const name = id === 'Nove.it' ? 'Nove' : id ? CHANNELS.get(id) : undefined
    if (!name) continue
    const icon = /<icon\b([^>]*)\/?>/.exec(m[2])
    const url = icon ? attr(icon[1], 'src') : null
    if (url && url.startsWith('https://')) logos[name] = url
  }
  for (const m of xml.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/g)) {
    const channel = CHANNELS.get(attr(m[1], 'channel') ?? '')
    if (!channel) continue
    let start: number, end: number
    try {
      start = parseTime(attr(m[1], 'start') ?? '')
      end = parseTime(attr(m[1], 'stop') ?? '')
    } catch { continue }
    if (!(end > start) || Math.floor((end - start) / 3_600_000) > 12) continue
    dates.add(romeClock(start).date)
    const body = m[2]
    const first = (tag: string) => {
      const t = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(body)
      return t ? decode(t[1]) : ''
    }
    const categories = [...body.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/g)].map((c) => decode(c[1]).toLowerCase())
    const icon = /<icon\b([^>]*)\/?>/.exec(body)
    const image = icon ? attr(icon[1], 'src') ?? '' : ''
    const p: Programme = {
      channel, start, end, title: first('title'), description: first('desc'), subtitle: first('sub-title'),
      episode: first('episode-num'), image: image.startsWith('https://') ? image : '', type: '',
    }
    p.type = classify(categories, p.episode, /<director\b/.test(body))
    if (p.type && p.title.trim()) {
      const key = programmeKey(p)
      if (!programmes.has(key)) programmes.set(key, p)
    }
  }
  logos.K2 ??= 'https://img-guidatv.org/loghi/b/k2.png'
  logos.Frisbee ??= 'https://img-guidatv.org/loghi/b/frisbee.png'
  if (!dates.size) throw new Error('No terrestrial schedules')
  const sorted = [...programmes.values()].sort((a, b) => a.start - b.start || cmp(a.channel, b.channel) || cmp(a.title, b.title))
  return { programmes: sorted, dates: [...dates].sort(), logos }
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const cacheFile = join(dataDir, 'digital-tv-guide.xml.gz')
let memory: { guide: Omit<Guide, 'cached' | 'updatedAt'>; at: number } | null = null
let loading: Promise<Guide> | null = null

function read(file: string): Omit<Guide, 'cached' | 'updatedAt'> {
  const raw = gunzipSync(readFileSync(file), { maxOutputLength: 40 * 1024 * 1024 })
  return parse(raw.toString('utf8'))
}

async function download(): Promise<Guide> {
  const response = await fetch(SOURCE, { signal: AbortSignal.timeout(25_000) })
  if (response.status !== 200) throw new Error('Guide unavailable')
  const body = Buffer.from(await response.arrayBuffer())
  if (body.length > 8 * 1024 * 1024) throw new Error('Guide too large')
  const temp = cacheFile + '.tmp'
  writeFileSync(temp, body)
  const fresh = read(temp)
  renameSync(temp, cacheFile)
  memory = { guide: fresh, at: Date.now() }
  return { ...fresh, cached: false, updatedAt: memory.at }
}

/** TvGuideRepository.load: the cached file while younger than 30 minutes, else a fresh download (old file as fallback). */
export function loadGuide(force: boolean): Promise<Guide> {
  if (loading) return loading
  loading = (async () => {
    try {
      const age = existsSync(cacheFile) ? Date.now() - statSync(cacheFile).mtimeMs : Infinity
      if (!force && age >= 0 && age < 30 * 60 * 1000) {
        if (memory && memory.at >= statSync(cacheFile).mtimeMs - 1000) return { ...memory.guide, cached: false, updatedAt: memory.at }
        try {
          memory = { guide: read(cacheFile), at: statSync(cacheFile).mtimeMs }
          return { ...memory.guide, cached: false, updatedAt: memory.at }
        } catch { /* download again */ }
      }
      try {
        return await download()
      } catch (error) {
        if (existsSync(cacheFile)) {
          try { return { ...read(cacheFile), cached: true, updatedAt: statSync(cacheFile).mtimeMs } } catch { /* fall through */ }
        }
        throw error
      }
    } finally {
      loading = null
    }
  })()
  return loading
}
