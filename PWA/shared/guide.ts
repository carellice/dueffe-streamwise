// Port of TvGuideRepository.java: the Italian terrestrial channels of the XMLTV guide, film/series
// classification and title matching with TMDB. The server downloads and parses the guide.
import type { Media } from './model.ts'

export const GUIDE_SOURCE = 'https://epgshare01.online/epgshare01/epg_ripper_IT1.xml.gz'

const CHANNEL_LIST: [string, string][] = [['Rai.1.HD..101.it', 'Rai 1'], ['Rai.2.HD..102.it', 'Rai 2'], ['Rai.3.HD..103.it', 'Rai 3'],
  ['Rete.4.it', 'Rete 4'], ['Canale.5.it', 'Canale 5'], ['Italia.1.it', 'Italia 1'], ['LA7.HD.it', 'La7'],
  ['TV8.HD.it', 'TV8'], ['NOVE.HD..149.it', 'Nove'], ['20.it', '20'], ['Rai.4..5021.it', 'Rai 4'],
  ['Iris.it', 'Iris'], ['Rai.5..5023.it', 'Rai 5'], ['Rai.Movie..5024.it', 'Rai Movie'],
  ['Rai.Premium..5025.it', 'Rai Premium'], ['cielo.it', 'Cielo'], ['27.Twentyseven.it', 'Twentyseven'],
  ['La.5.it', 'La 5'], ['Real.Time.HD..160.it', 'Real Time'], ['Mediaset.Extra.it', 'Mediaset Extra'],
  ['Italia.2.it', 'Italia 2'], ['GIALLO.HD..167.it', 'Giallo'], ['Top.Crime.it', 'Top Crime'],
  ['Cine34.it', 'Cine34'], ['Warner.TV.it', 'Warner TV'], ['LA7.CINEMA.it', 'La7 Cinema'],
  ['Boing.it', 'Boing'], ['Cartoonito.it', 'Cartoonito'], ['Rai.Gulp..5042.it', 'Rai Gulp'],
  ['Rai.Yoyo..5043.it', 'Rai Yoyo'], ['K2.it', 'K2'], ['Frisbee.it', 'Frisbee'], ['Super!.it', 'Super!']]
export const CHANNELS = new Map(CHANNEL_LIST)
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 20, 21, 22, 23, 24, 25, 26, 27, 30, 31, 55, 66, 38, 39, 34, 37, 29, 40, 46, 42, 43, 41, 44, 47]

export function channelNumber(name: string): number {
  const i = CHANNEL_LIST.findIndex(([, value]) => value === name)
  return i < 0 ? Number.MAX_SAFE_INTEGER : NUMBERS[i]
}

export type Programme = {
  channel: string
  title: string
  description: string
  image: string
  episode: string
  subtitle: string
  type: string
  /** Epoch milliseconds. */
  start: number
  end: number
}

export const programmeKey = (p: Programme) => `${p.channel}|${new Date(p.start).toISOString().replace('.000Z', 'Z')}|${p.title}`
export const onAir = (p: Programme, now: number) => now >= p.start && now < p.end
export const searchTitle = (p: Programme) => p.title.replace(/\s*-\s*(stag\.|s\d+\s*e\d+).*/i, '').replace(/\s*\(\d{4}\)\s*$/, '').trim()

export function normalizedTitle(title: string): string {
  return title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** The TMDB result that is unambiguously this programme, or null. */
export function recognize(programme: Programme, results: Media[]): Media | null {
  const title = normalizedTitle(searchTitle(programme))
  let found: Media | null = null
  for (const m of results) {
    if (m.mediaType === programme.type && (normalizedTitle(m.title) === title || normalizedTitle(m.originalTitle) === title)) {
      if (found != null && found.id !== m.id) return null
      found = m
    }
  }
  return found
}

export type GuideDay = { date: string; dates: string[]; programmes: Programme[]; logos: Record<string, string>; cached: boolean; updatedAt: number }

function classify(categories: string[], episode: string, director: boolean): string {
  for (const value of categories) if (value === 'film' || value === 'movie') return 'movie'
  for (const value of categories) if (value === 'fiction' || value.includes('serie') || value.includes('sitcom')) return 'tv'
  for (const value of categories) {
    if (['show', 'intrattenimento', 'sport', 'informazione', 'documentario', 'reality', 'notiziario', 'quiz', 'varietà', 'attualit'].some((w) => value.includes(w))) return ''
  }
  if (episode !== '') return 'tv'
  if (director) for (const value of categories) if (['azione', 'commedia', 'drammatico', 'thriller', 'horror', 'avventura', 'fantascienza', 'western', 'romantico', 'fantastico', 'animazione'].includes(value)) return 'movie'
  return ''
}

/** "20241023203000 +0200" → epoch ms (TvGuideRepository.parseTime). */
export function parseTime(text: string): number {
  const t = text.trim().replace(/\s+/g, ' ')
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(t)
  if (!m) throw new Error('bad time')
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  const offset = (m[7] === '-' ? -1 : 1) * (+m[8] * 60 + +m[9]) * 60000
  return utc - offset
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function decode(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, code: string) => {
    if (code[0] === '#') {
      const value = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(value) ? String.fromCodePoint(value) : all
    }
    return entities[code.toLowerCase()] ?? all
  })
}

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m ? decode(m[1]) : null
}

/** Parses the XMLTV text: programmes of the known channels, sorted by start, channel, title. */
export function parseGuide(xml: string): { programmes: Programme[]; dates: string[]; logos: Record<string, string> } {
  if (/<!DOCTYPE/i.test(xml)) throw new Error('Unexpected document declaration')
  const logos: Record<string, string> = {}
  for (const m of xml.matchAll(/<channel\b([^>]*)>([\s\S]*?)<\/channel>/g)) {
    const id = attr(m[1], 'id')
    const name = id === 'Nove.it' ? 'Nove' : id ? CHANNELS.get(id) : undefined
    if (!name) continue
    for (const icon of m[2].matchAll(/<icon\b[^>]*>/g)) {
      const url = attr(icon[0], 'src')
      if (url && url.startsWith('https://')) logos[name] = url
    }
  }
  const programmes = new Map<string, Programme>()
  const dates = new Set<string>()
  for (const m of xml.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/g)) {
    const channel = CHANNELS.get(attr(m[1], 'channel') ?? '')
    if (!channel) continue
    let start: number, end: number
    try {
      start = parseTime(attr(m[1], 'start') ?? '')
      end = parseTime(attr(m[1], 'stop') ?? '')
    } catch { continue }
    if (!(end > start) || Math.floor((end - start) / 3600000) > 12) continue
    dates.add(romeDate(start))
    const body = m[2]
    const first = (tag: string) => {
      const x = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(body)
      return x ? decode(x[1]) : ''
    }
    const lastOf = (tag: string) => {
      let value = ''
      for (const x of body.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))) value = decode(x[1])
      return value
    }
    const categories = [...body.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/g)].map((x) => decode(x[1]).toLowerCase())
    let image = ''
    for (const icon of body.matchAll(/<icon\b[^>]*>/g)) {
      const url = attr(icon[0], 'src')
      if (url && url.startsWith('https://')) { image = url; break }
    }
    const p: Programme = {
      channel, start, end, title: first('title'), description: first('desc'), subtitle: lastOf('sub-title'),
      episode: first('episode-num'), image, type: '',
    }
    p.type = classify(categories, p.episode, /<director\b/.test(body))
    if (p.type !== '' && p.title.trim() !== '') {
      const key = programmeKey(p)
      if (!programmes.has(key)) programmes.set(key, p)
    }
  }
  logos.K2 ??= 'https://img-guidatv.org/loghi/b/k2.png'
  logos.Frisbee ??= 'https://img-guidatv.org/loghi/b/frisbee.png'
  if (dates.size === 0) throw new Error('No terrestrial schedules')
  const sorted = [...programmes.values()].sort((a, b) => a.start - b.start || cmp(a.channel, b.channel) || cmp(a.title, b.title))
  return { programmes: sorted, dates: [...dates].sort(), logos }
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function romeDate(time: number): string {
  const p: Record<string, string> = {}
  for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time))) p[x.type] = x.value
  return `${p.year}-${p.month}-${p.day}`
}
