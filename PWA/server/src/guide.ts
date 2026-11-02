// TvGuideRepository.load on the server: the XMLTV guide is downloaded at most every 30 minutes
// (8 MB compressed, 40 MB expanded at most), kept on disk, and served one day at a time.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { GUIDE_SOURCE, parseGuide, type GuideDay, type Programme } from '../../shared/guide.ts'
import { plusDays, startOfDayRome } from '../../shared/dates.ts'
import { dataDir } from './db.ts'

const dir = join(dataDir, 'cache')
mkdirSync(dir, { recursive: true })
const file = join(dir, 'digital-tv-guide.xml.gz')

type Guide = { programmes: Programme[]; dates: string[]; logos: Record<string, string>; cached: boolean; updatedAt: number }

let memory: (Guide & { mtime: number }) | null = null
let loading: Promise<Guide> | null = null

function read(path: string, cached: boolean): Guide {
  const xml = gunzipSync(readFileSync(path), { maxOutputLength: 40 * 1024 * 1024 }).toString('utf8')
  const mtime = statSync(path).mtimeMs
  return { ...parseGuide(xml), cached, updatedAt: Math.round(mtime) }
}

async function download(): Promise<Guide> {
  const temp = join(dir, 'digital-tv-guide.tmp')
  const response = await fetch(GUIDE_SOURCE, { signal: AbortSignal.timeout(25000) })
  if (response.status !== 200 || !response.body) throw new Error('Guide unavailable')
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.length
    if (total > 8 * 1024 * 1024) throw new Error('Guide too large')
    chunks.push(Buffer.from(chunk))
  }
  writeFileSync(temp, Buffer.concat(chunks))
  const fresh = read(temp, false)
  renameSync(temp, file)
  return { ...fresh, updatedAt: Math.round(statSync(file).mtimeMs) }
}

export async function loadGuide(force: boolean): Promise<Guide> {
  const age = existsSync(file) ? Date.now() - statSync(file).mtimeMs : Infinity
  if (!force && age >= 0 && age < 30 * 60 * 1000) {
    const mtime = statSync(file).mtimeMs
    if (memory && memory.mtime === mtime) return memory
    try {
      const guide = read(file, false)
      memory = { ...guide, mtime }
      return guide
    } catch { /* fall through to a fresh download */ }
  }
  loading ??= (async () => {
    try {
      const fresh = await download()
      memory = { ...fresh, mtime: statSync(file).mtimeMs }
      return fresh
    } catch (error) {
      if (existsSync(file)) {
        try { return { ...read(file, true), cached: true } } catch { /* the cache is unusable too */ }
      }
      throw error
    } finally {
      loading = null
    }
  })()
  return loading
}

/** Guide.forDate: programmes starting on [date] in Rome. */
export async function guideDay(date: string, force: boolean): Promise<GuideDay> {
  const guide = await loadGuide(force)
  const from = startOfDayRome(date)
  const until = startOfDayRome(plusDays(date, 1))
  return {
    date,
    dates: guide.dates,
    programmes: guide.programmes.filter((p) => p.start >= from && p.start < until),
    logos: guide.logos,
    cached: guide.cached,
    updatedAt: guide.updatedAt,
  }
}
