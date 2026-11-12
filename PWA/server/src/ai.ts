// StreamWise's AI, ported to Kotlin in AiAdvisor.kt: Cloudflare Workers AI with the user's own account.
// The Account ID and API token are saved per account on the server and sent only to api.cloudflare.com.
//
// The model never invents what it suggests: TMDB builds a pool of real candidates (on the user's
// subscriptions when possible) and the model only picks from that numbered list and explains why.
// The only places where it names titles freely are the "seeds" of a request and "Ritrova un titolo",
// and those are matched against TMDB before they reach the user.
import { aiAccount, aiToken, currentUserId, libraryEntries, prefs, services } from './db.ts'
import { serverTmdb } from './tmdb.ts'
import { loadGuide } from './guide.ts'
import { recognize, searchTitle, type Programme } from '../../shared/guide.ts'
import { mapMedia } from '../../shared/tmdb.ts'
import type { LibraryEntry, Media, Provider } from '../../shared/model.ts'
import type { AiAnswer, AiResult, AiTvResult, AiVerdict } from '../../shared/ai.ts'
import { hourRome, plusDays, startOfDayRome, timeRome, todayRome } from '../../shared/dates.ts'

const MODEL = '@cf/openai/gpt-oss-120b'

export class AiError extends Error {}

export type { AiAnswer, AiResult, AiTvResult, AiVerdict }

const NOT_CONFIGURED = "Configura l'IA nelle Impostazioni con il tuo account Cloudflare."
const SYSTEM = 'Sei il consulente di cinema e serie TV di StreamWise: competente, diretto, mai banale. Scrivi in italiano naturale. Rispondi sempre e solo con un oggetto JSON valido, senza testo prima o dopo.'

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
type Json = Record<string, unknown>

function configured() {
  if (aiAccount() === '' || aiToken() === '') throw new AiError(NOT_CONFIGURED)
}

// --- the model ------------------------------------------------------------------------------------

function failure(code: number): AiError {
  return new AiError(
    code === 401 || code === 403 ? 'Il token non è valido o non ha il permesso Workers AI. Ricrealo con il modello “Workers AI”.'
      : code === 404 ? "Account non trovato. Controlla l'Account ID."
        : code === 429 ? 'Hai esaurito la quota gratuita di oggi di Workers AI. Riprova domani.'
          : code === 400 ? "Cloudflare ha rifiutato la richiesta. Controlla l'Account ID."
            : `Cloudflare non risponde (errore ${code}). Riprova tra poco.`,
  )
}

/** The text of a chat completion, whatever shape Workers AI answered with. */
function contentOf(body: any): string {
  const choice = body?.choices?.[0]?.message?.content ?? body?.result?.choices?.[0]?.message?.content
  if (typeof choice === 'string') return choice
  const response = body?.result?.response ?? body?.response
  if (typeof response === 'string') return response
  if (response && typeof response === 'object') return JSON.stringify(response)
  for (const item of body?.output ?? body?.result?.output ?? []) for (const part of item?.content ?? []) if (typeof part?.text === 'string') return part.text
  return ''
}

/** The first JSON object in the model's answer. */
export function jsonOf(text: string): Json | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(text.slice(start, end + 1))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

async function chat(accountId: string, apiToken: string, system: string, user: string, maxTokens: number, effort = 'low', temperature = 0.6): Promise<Json> {
  if (!/^[0-9a-fA-F]{32}$/.test(accountId)) throw new AiError("L'Account ID non è valido: sono 32 caratteri tra numeri e lettere a-f.")
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }]
  const send = (body: Json) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${apiToken}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(80000),
  })
  let response: Response
  try {
    // max_tokens also covers the reasoning; if an option is refused, the plain request is retried once.
    response = await send({ model: MODEL, messages, max_tokens: maxTokens, temperature, reasoning_effort: effort })
    if (response.status === 400) response = await send({ model: MODEL, messages, max_tokens: maxTokens })
  } catch {
    throw new AiError("Non riesco a contattare l'IA. Controlla la connessione e riprova.")
  }
  const text = await response.text().catch(() => '')
  if (!response.ok) throw failure(response.status)
  let body: unknown = null
  try { body = JSON.parse(text) } catch { /* not json */ }
  const data = jsonOf(contentOf(body))
  if (!data) throw new AiError("L'IA ha risposto in modo incomprensibile. Riprova.")
  return data
}

const ask = (user: string, maxTokens: number, effort = 'low', temperature = 0.6, system = SYSTEM) => {
  configured()
  return chat(aiAccount(), aiToken(), system, user, maxTokens, effort, temperature)
}

/** Checks that the credentials can run the model; throws AiError otherwise. */
export async function verify(accountId: string, apiToken: string) {
  await chat(accountId.trim(), apiToken.trim(), SYSTEM, 'Rispondi con {"ok":true}', 200)
}

// --- what we know about the user -------------------------------------------------------------------

const tmdb = serverTmdb()
const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])
const label = (m: Media) => `${m.title}${m.year && m.year !== 'S.D.' ? ` (${m.year})` : ''}`

/** Active subscriptions, with the alternate ids TMDB uses for the same service (Netflix with ads, Prime with ads). */
function subscriptionIds(): number[] {
  const ids = prefs().subscriptions
  return [...new Set(ids.flatMap((id) => (id === 8 ? [8, 1796] : id === 119 ? [119, 2100] : [id])))]
}

function counted(values: string[], limit: number): string[] {
  const counts = new Map<string, number>()
  for (const v of values) if (v !== '') counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([v]) => v)
}

const decadeOf = (year: string) => {
  if (!/^\d{4}$/.test(year)) return ''
  const d = Math.floor(Number(year) / 10) * 10
  return d >= 2000 ? `anni ${d}` : `anni '${String(d).slice(2)}`
}

/** A compact taste profile from the library, written for the model. */
export function profileText(entries: LibraryEntry[], subscriptionNames: string[]): string {
  const liked = entries.filter((e) => e.liked === true).map((e) => e.media)
  const disliked = entries.filter((e) => e.liked === false).map((e) => e.media)
  const watching = entries.filter((e) => e.state === 'progress').map((e) => e.media)
  const saved = entries.filter((e) => e.state === 'saved').map((e) => e.media)
  const decades = counted(liked.map((m) => decadeOf(m.year)), 3)
  const lines = [
    liked.length > 0 ? `Titoli che le sono piaciuti: ${liked.slice(-25).map(label).join('; ')}.` : 'Non ha ancora valutato titoli: non conosci i suoi gusti, basati sulla richiesta e sulla qualità.',
    liked.length > 0 ? `Generi preferiti: ${counted(liked.flatMap((m) => m.genres), 5).join(', ') || 'vari'}. Epoche preferite: ${decades.join(', ') || 'varie'}.` : '',
    disliked.length > 0 ? `Titoli che NON le sono piaciuti: ${disliked.slice(-12).map(label).join('; ')}.` : '',
    watching.length > 0 ? `Sta guardando: ${watching.slice(-10).map(label).join('; ')}.` : '',
    saved.length > 0 ? `Vuole vedere: ${saved.slice(-10).map(label).join('; ')}.` : '',
    subscriptionNames.length > 0 ? `Abbonamenti: ${subscriptionNames.join(', ')}.` : '',
  ]
  return lines.filter((l) => l !== '').join('\n')
}

function profile(): string {
  const active = new Set(prefs().subscriptions)
  return profileText(libraryEntries(), services().filter((s) => active.has(s.id)).map((s) => s.name))
}

const knownIds = () => new Set(libraryEntries().map((e) => e.media.id))

// --- candidates from TMDB --------------------------------------------------------------------------

async function discover(type: string, q: Record<string, string>): Promise<Media[]> {
  try {
    return list((await tmdb.get('/discover/' + type, { include_adult: 'false', watch_region: 'IT', region: 'IT', ...q })).results).map((o) => mapMedia(o ?? {}, type))
  } catch {
    return []
  }
}

const safe = async (work: () => Promise<Media[]>) => { try { return await work() } catch { return [] } }

/** Interleaves the lists, drops duplicates, known titles and media without a poster. */
function pool(lists: Media[][], exclude: Set<string>, limit: number): Media[] {
  const out: Media[] = []
  const seen = new Set<string>()
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const m = l[i]
      if (!m || seen.has(m.id) || exclude.has(m.id) || m.poster === '' || m.tmdbId <= 0) continue
      seen.add(m.id)
      out.push(m)
      if (out.length >= limit) break
    }
  }
  return out
}

const normalized = (v: string) => v.normalize('NFD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

/** Matches a title the model named to its TMDB entry, scoring both titles, the year and how complete it is. */
export async function resolveTitle(title: string, year: number | null, type: string | null): Promise<Media | null> {
  try {
    const wanted = normalized(title)
    const candidates = (await tmdb.searchTitles(title, null)).filter((m) => type == null || m.mediaType === type)
    const score = (m: Media) => {
      const titles = [m.title, m.originalTitle].map(normalized).filter((t) => t !== '')
      const titleScore = titles.some((t) => t === wanted) ? 0 : titles.some((t) => t.startsWith(wanted) || wanted.startsWith(t)) ? 1 : titles.some((t) => t.includes(wanted) || wanted.includes(t)) ? 2 : 4
      const y = Number.parseInt(m.year, 10)
      const gap = Number.isNaN(y) || year == null ? null : Math.abs(year - y)
      const yearScore = year == null ? 1 : gap == null ? 3 : gap === 0 ? 0 : gap === 1 ? 1 : 4
      return titleScore * 3 + yearScore * 2 + (m.poster === '' ? 3 : 0) + (m.overview === 'Trama non disponibile.' ? 1 : 0)
    }
    let best: Media | null = null
    for (const m of candidates) if (best == null || score(m) < score(best) || (score(m) === score(best) && m.rating > best.rating)) best = m
    return best != null && score(best) <= 9 ? best : null
  } catch {
    return null
  }
}

type Seed = { title: string; year: number | null; type: string | null }
const seedsOf = (v: unknown): Seed[] => list(v).map((o) => ({
  title: clean(o?.title, 120),
  year: Number(o?.year) > 1800 ? Math.trunc(Number(o.year)) : null,
  type: o?.type === 'movie' || o?.type === 'tv' ? o.type : null,
})).filter((s) => s.title !== '')

const resolveSeeds = async (seeds: Seed[]) => (await Promise.all(seeds.slice(0, 10).map((s) => resolveTitle(s.title, s.year, s.type)))).filter((m): m is Media => m != null)

const recommendationsOf = (media: Media[], perTitle = 1) => Promise.all(media.map((m) => safe(async () => {
  const out = await tmdb.recommendations(m, 1)
  return perTitle > 1 ? [...out, ...(await safe(() => tmdb.recommendations(m, 2)))] : out
})))

function randomItems<T>(items: T[], count: number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

const likedMedia = () => libraryEntries().filter((e) => e.liked === true).map((e) => e.media)

// --- asking the model to choose -----------------------------------------------------------------

const GENRE_IDS: Record<string, { movie: number; tv: number }> = {
  Azione: { movie: 28, tv: 10759 }, Avventura: { movie: 12, tv: 10759 }, Animazione: { movie: 16, tv: 16 }, Commedia: { movie: 35, tv: 35 },
  Crime: { movie: 80, tv: 80 }, Documentario: { movie: 99, tv: 99 }, Dramma: { movie: 18, tv: 18 }, Famiglia: { movie: 10751, tv: 10751 },
  Fantasy: { movie: 14, tv: 10765 }, Fantascienza: { movie: 878, tv: 10765 }, Guerra: { movie: 10752, tv: 10768 }, Horror: { movie: 27, tv: 9648 },
  Mistero: { movie: 9648, tv: 9648 }, Musica: { movie: 10402, tv: 0 }, Romance: { movie: 10749, tv: 18 }, Storia: { movie: 36, tv: 10768 },
  Thriller: { movie: 53, tv: 80 }, Western: { movie: 37, tv: 37 },
}

function poolText(items: Media[]): string {
  return items.map((m, i) => {
    const kind = m.mediaType === 'tv' ? 'serie' : 'film'
    const original = m.originalTitle !== '' && normalized(m.originalTitle) !== normalized(m.title) ? ` / ${m.originalTitle}` : ''
    const plot = m.overview === 'Trama non disponibile.' ? '' : ` — ${clean(m.overview, 170)}`
    return `${i + 1}. ${m.title}${original} (${kind}, ${m.year}; ${m.genres.join(', ') || 'genere n.d.'}; voto ${m.rating.toFixed(1)})${plot}`
  }).join('\n')
}

/** Asks the model to pick from a numbered pool. Picks outside the list are dropped. */
async function choose(items: Media[], task: string, count: number, temperature = 0.6): Promise<{ intro: string; picks: [Media, string][] }> {
  if (items.length === 0) return { intro: '', picks: [] }
  const prompt = [
    profile(),
    '',
    task,
    '',
    'Candidati (scegli solo da questa lista, usando il numero):',
    poolText(items),
    '',
    `Scegli i ${Math.min(count, items.length)} candidati migliori, dal più adatto. Varia generi e toni quando la richiesta lo permette.`,
    'Per ognuno scrivi "reason": una frase concreta in italiano (90-150 caratteri) sul perché fa per lei: cita un titolo che le è piaciuto o la sua richiesta, mai frasi generiche sul genere.',
    'Scrivi anche "intro": una frase breve e calda che introduce la selezione, come farebbe un amico esperto.',
    'Formato: {"intro":"...","items":[{"n":3,"reason":"..."}]}',
  ].join('\n')
  const data = await ask(prompt, 2200, 'low', temperature)
  const picks: [Media, string][] = []
  const used = new Set<number>()
  for (const o of list(data.items)) {
    const n = Math.trunc(Number(o?.n ?? o?.id))
    if (!(n >= 1 && n <= items.length) || used.has(n)) continue
    used.add(n)
    picks.push([items[n - 1], capital(clean(o?.reason, 220))])
    if (picks.length >= count) break
  }
  return { intro: clean(data.intro, 240), picks }
}

/** Adds the user's subscriptions that include each title (all flatrate services if none is set). */
async function withProviders(picks: [Media, string][]): Promise<AiResult[]> {
  const active = new Set(subscriptionIds())
  return Promise.all(picks.map(async ([media, reason]) => {
    let providers: Provider[] = []
    try {
      const all = await tmdb.subscriptionAvailability(media)
      providers = active.size === 0 ? all : all.filter((p) => active.has(p.id))
    } catch { /* availability is optional */ }
    return { media, reason, providers }
  }))
}

// --- request understanding ------------------------------------------------------------------------

type Plan = { types: string[]; q: Record<string, string>[]; seeds: Seed[]; intro: string }

/** Turns a free-text request into TMDB filters plus a few titles the model thinks fit (checked on TMDB later). */
async function plan(request: string, history: string[], type: string): Promise<Plan> {
  const forced = type === 'movie' || type === 'tv' ? type : null
  const now = new Date().getFullYear()
  const prompt = [
    profile(),
    '',
    history.length > 0 ? `Richieste precedenti in questa conversazione, dalla più vecchia: ${history.map((h) => `"${clean(h, 200)}"`).join('; ')}.` : '',
    `Richiesta attuale: "${clean(request, 400) || 'consigliami qualcosa che mi piacerà'}".`,
    forced ? `Vuole solo ${forced === 'movie' ? 'film' : 'serie TV'}.` : '',
    '',
    'Traduci la richiesta (combinata con quelle precedenti, se è un affinamento) in filtri per un catalogo:',
    '- "type": "movie", "tv" o "all".',
    `- "genres": generi da questa lista, solo se la richiesta li implica: ${Object.keys(GENRE_IDS).join(', ')}.`,
    `- "yearFrom", "yearTo": anni come numeri o null (oggi è il ${now}; "recente" vuol dire dal ${now - 3}).`,
    '- "maxMinutes": durata massima di un film in minuti o null.',
    '- "language": lingua originale ISO 639-1 (es. "ko", "it", "ja") solo se richiesta, altrimenti null.',
    '- "seeds": da 6 a 10 titoli reali e noti che rispondono esattamente alla richiesta, con titolo originale, anno e tipo. Evita quelli che conosce già.',
    '- "intro": una frase breve e naturale che dice cosa hai capito della richiesta.',
    'Formato: {"type":"all","genres":[],"yearFrom":null,"yearTo":null,"maxMinutes":null,"language":null,"seeds":[{"title":"...","year":2020,"type":"movie"}],"intro":"..."}',
  ].filter((l) => l !== '').join('\n')
  const data = await ask(prompt, 1800, 'low', 0.5)
  const types = forced ? [forced] : data.type === 'movie' || data.type === 'tv' ? [String(data.type)] : ['movie', 'tv']
  const genres = list(data.genres).map(String).filter((g) => g in GENRE_IDS)
  const yearFrom = Number(data.yearFrom) > 1900 ? Math.trunc(Number(data.yearFrom)) : null
  const yearTo = Number(data.yearTo) > 1900 ? Math.trunc(Number(data.yearTo)) : null
  const maxMinutes = Number(data.maxMinutes) > 30 ? Math.trunc(Number(data.maxMinutes)) : null
  const language = /^[a-z]{2}$/.test(String(data.language ?? '')) ? String(data.language) : null
  const q = types.map((t) => {
    const out: Record<string, string> = {}
    const ids = [...new Set(genres.map((g) => GENRE_IDS[g][t as 'movie' | 'tv']).filter((id) => id > 0))]
    if (ids.length > 0) out.with_genres = ids.join('|')
    const dateKey = t === 'tv' ? 'first_air_date' : 'primary_release_date'
    if (yearFrom) out[`${dateKey}.gte`] = `${yearFrom}-01-01`
    if (yearTo) out[`${dateKey}.lte`] = `${yearTo}-12-31`
    if (maxMinutes && t === 'movie') out['with_runtime.lte'] = String(maxMinutes)
    if (language) out.with_original_language = language
    return out
  })
  return { types, q, seeds: seedsOf(data.seeds), intro: clean(data.intro, 240) }
}

/** Real candidates for a plan: the model's seeds, then the catalog on the user's subscriptions. */
async function planPool(p: Plan, exclude: Set<string>, limit: number): Promise<Media[]> {
  const subs = subscriptionIds()
  const onSubs: Record<string, string> = subs.length > 0 ? { with_watch_providers: subs.join('|'), with_watch_monetization_types: 'flatrate' } : {}
  const catalog = (extra: Record<string, string>) => Promise.all(p.types.flatMap((t, i) => [
    discover(t, { ...p.q[i], ...extra, sort_by: 'popularity.desc', 'vote_count.gte': '80' }),
    discover(t, { ...p.q[i], ...extra, sort_by: 'vote_average.desc', 'vote_count.gte': '400' }),
  ]))
  const [seeds, lists] = await Promise.all([resolveSeeds(p.seeds), catalog(onSubs)])
  let candidates = pool([seeds, ...lists], exclude, limit)
  if (candidates.length < 12 && subs.length > 0) candidates = pool([candidates, ...(await catalog({}))], exclude, limit)
  return candidates
}

// --- features --------------------------------------------------------------------------------------

export type AskInput = { request: string; history: string[]; type: string; exclude: string[] }

/** "Chiedi all'IA": understands the request, gathers real candidates, lets the model pick and explain. */
export async function recommend(input: AskInput): Promise<AiAnswer> {
  configured()
  const p = await plan(input.request, input.history, input.type)
  const exclude = new Set([...knownIds(), ...input.exclude])
  const candidates = await planPool(p, exclude, 40)
  const request = [...input.history, input.request].filter((r) => r.trim() !== '').map((r) => `"${clean(r, 200)}"`).join(', poi ')
  const { intro, picks } = await choose(candidates, `Richiesta: ${request || 'consigliami qualcosa che mi piacerà'}.`, 6, 0.7)
  return { intro: intro || p.intro, results: await withProviders(picks) }
}

/** "Cerca a parole": the request becomes catalog filters; no ranking, so it is fast and literal. */
export async function search(input: { query: string; type: string; exclude: string[] }): Promise<AiAnswer> {
  configured()
  const p = await plan(input.query, [], input.type)
  const candidates = await planPool(p, new Set(input.exclude), 24)
  return { intro: p.intro, results: candidates.map((media) => ({ media, reason: '', providers: [] })) }
}

/** "Simili secondo l'IA": TMDB's recommendations and similar titles, ranked by what they share with [media]. */
export async function similar(input: { media: Media; exclude: string[] }): Promise<AiAnswer> {
  configured()
  const media = input.media
  const exclude = new Set([...libraryEntries().filter((e) => e.state === 'watched').map((e) => e.media.id), ...input.exclude, media.id])
  const [first, second, alike] = await Promise.all([
    safe(() => tmdb.recommendations(media, 1)),
    safe(() => tmdb.recommendations(media, 2)),
    safe(async () => list((await tmdb.get(`/${media.mediaType}/${media.tmdbId}/similar`, { page: '1' })).results).map((o) => mapMedia(o ?? {}, media.mediaType))),
  ])
  const sameSaga = media.collectionId > 0 ? new Set((await safe(() => tmdb.saga(media))).map((m) => m.id)) : new Set<string>()
  const candidates = pool([first, alike, second], new Set([...exclude, ...sameSaga]), 36)
  const source = `"${media.title}" (${media.mediaType === 'tv' ? 'serie' : 'film'}, ${media.year}; ${media.genres.join(', ')}) — ${clean(media.overview, 300)}`
  const { intro, picks } = await choose(candidates, `Cerca titoli simili a ${source} per atmosfera, temi, tono e stile, non solo per genere. Nella reason spiega cosa hanno in comune con "${media.title}".`, 8, 0.5)
  return { intro, results: await withProviders(picks) }
}

const verdicts = new Map<string, { at: number; value: AiVerdict }>()

/** "Ti piacerà?": how well [media] fits the user's taste, with honest pros and cons. Cached for a day. */
export async function why(input: { media: Media }): Promise<AiVerdict> {
  configured()
  const m = input.media
  const key = `${currentUserId()}|${m.id}|${libraryEntries().filter((e) => e.liked != null).length}`
  const hit = verdicts.get(key)
  if (hit && Date.now() - hit.at < 24 * 60 * 60 * 1000) return hit.value
  const prompt = [
    profile(),
    '',
    `Titolo da valutare: "${m.title}"${m.originalTitle && m.originalTitle !== m.title ? ` (${m.originalTitle})` : ''}, ${m.mediaType === 'tv' ? 'serie TV' : 'film'} del ${m.year}; generi ${m.genres.join(', ') || 'n.d.'}; voto TMDB ${m.rating.toFixed(1)}.`,
    `Trama: ${clean(m.overview, 600)}`,
    '',
    'Valuta con onestà quanto le piacerà, in base ai suoi gusti. Se non conosci i suoi gusti, valuta la qualità e a chi è adatto.',
    '- "score": da 0 a 100.',
    '- "verdict": una frase in italiano (massimo 150 caratteri) con il tuo giudizio, citando un titolo che le è piaciuto se pertinente.',
    '- "pros": da 1 a 3 punti brevi (massimo 60 caratteri) per cui le piacerà.',
    '- "cons": da 0 a 2 punti brevi (massimo 60 caratteri) che potrebbero non convincerla. Niente spoiler.',
    'Formato: {"score":80,"verdict":"...","pros":["..."],"cons":["..."]}',
  ].join('\n')
  const data = await ask(prompt, 1400, 'low', 0.4)
  const value: AiVerdict = {
    score: Math.max(0, Math.min(100, Math.round(Number(data.score) || 0))),
    verdict: capital(clean(data.verdict, 200)),
    pros: list(data.pros).map((p) => capital(clean(p, 80))).filter((p) => p !== '').slice(0, 3),
    cons: list(data.cons).map((p) => capital(clean(p, 80))).filter((p) => p !== '').slice(0, 2),
  }
  if (verdicts.size > 500) verdicts.delete(verdicts.keys().next().value as string)
  verdicts.set(key, { at: Date.now(), value })
  return value
}

/** "Stasera in TV": the evening's films and series on free TV that fit the user's taste. */
export async function tonight(): Promise<AiAnswer> {
  configured()
  const guide = await loadGuide(false)
  const now = Date.now()
  const today = todayRome(now)
  const evening = startOfDayRome(today) + 20 * 60 * 60 * 1000
  const from = hourRome(now) >= 20 || hourRome(now) < 3 ? now - 30 * 60 * 1000 : evening
  const until = Math.max(from + 4 * 60 * 60 * 1000, startOfDayRome(plusDays(today, 1)))
  const programmes = guide.programmes
    .filter((p) => p.start >= from && p.start < until && p.end > now && (p.type === 'movie' || p.type === 'tv') && p.end - p.start >= 40 * 60 * 1000)
    .sort((a, b) => a.start - b.start)
    .slice(0, 90)
  if (programmes.length === 0) return { intro: 'Stasera la guida TV non ha film o serie da proporti.', results: [], tv: [] }
  const lines = programmes.map((p, i) => `${i + 1}. ${timeRome(p.start)} ${p.channel} — ${searchTitle(p)} (${p.type === 'tv' ? 'serie' : 'film'})${p.description ? `: ${clean(p.description, 110)}` : ''}`).join('\n')
  const prompt = [
    profile(),
    '',
    'Ecco i film e le serie in onda stasera sulla TV in chiaro:',
    lines,
    '',
    'Scegli da 3 a 5 programmi che le piaceranno di più, solo da questa lista e usando il numero. Preferisci titoli di qualità rispetto a repliche qualunque.',
    'Per ognuno scrivi "reason" (90-150 caratteri, in italiano) sul perché fa per lei. Aggiungi "intro", una frase breve sulla serata.',
    'Formato: {"intro":"...","items":[{"n":4,"reason":"..."}]}',
  ].join('\n')
  const data = await ask(prompt, 1800, 'low', 0.5)
  const chosen: [Programme, string][] = []
  for (const o of list(data.items)) {
    const n = Math.trunc(Number(o?.n))
    if (n >= 1 && n <= programmes.length && !chosen.some(([p]) => p === programmes[n - 1])) chosen.push([programmes[n - 1], capital(clean(o?.reason, 220))])
  }
  const tv = await Promise.all(chosen.slice(0, 5).map(async ([programme, reason]) => {
    let media: Media | null = null
    try { media = recognize(programme, await tmdb.searchTitles(searchTitle(programme), null)) } catch { /* shown without artwork */ }
    return { programme, media, reason }
  }))
  return { intro: clean(data.intro, 240), results: [], tv }
}

/** "Serata in due": titles for the user and someone else, from what both of them like. */
export async function duo(input: { titles: string[]; request: string; type: string; exclude: string[] }): Promise<AiAnswer> {
  configured()
  const other = (await Promise.all(input.titles.slice(0, 6).map((t) => resolveTitle(t, null, null)))).filter((m): m is Media => m != null)
  if (other.length === 0) throw new AiError('Non ho riconosciuto i titoli della seconda persona. Scrivine almeno uno, separandoli con una virgola.')
  const mine = randomItems(likedMedia(), 3)
  const type = input.type === 'movie' || input.type === 'tv' ? input.type : null
  const lists = await recommendationsOf([...other, ...mine])
  const exclude = new Set([...knownIds(), ...input.exclude, ...other.map((m) => m.id)])
  const candidates = pool(lists.map((l) => l.filter((m) => type == null || m.mediaType === type)), exclude, 40)
  const task = [
    `Serata in due: all'altra persona piacciono ${other.map(label).join('; ')}.`,
    input.request.trim() !== '' ? `Richiesta per la serata: "${clean(input.request, 300)}".` : '',
    'Scegli titoli che possano piacere a entrambi; nella reason spiega perché funziona per tutti e due.',
  ].filter((l) => l !== '').join(' ')
  const { intro, picks } = await choose(candidates, task, 6, 0.6)
  return { intro, results: await withProviders(picks) }
}

/** "Sorprendimi": a few bold picks off the beaten track, still on the user's subscriptions. */
export async function surprise(input: { type: string; exclude: string[] }): Promise<AiAnswer> {
  configured()
  const types = input.type === 'movie' || input.type === 'tv' ? [input.type] : ['movie', 'tv']
  const subs = subscriptionIds()
  const onSubs: Record<string, string> = subs.length > 0 ? { with_watch_providers: subs.join('|'), with_watch_monetization_types: 'flatrate' } : {}
  const page = () => String(1 + Math.floor(Math.random() * 5))
  const lists = await Promise.all([
    ...types.map((t) => discover(t, { ...onSubs, sort_by: 'vote_average.desc', 'vote_count.gte': '300', page: page() })),
    ...types.map((t) => discover(t, { ...onSubs, sort_by: 'popularity.desc', 'vote_average.gte': '7', 'vote_count.gte': '150', page: page() })),
    ...(await recommendationsOf(randomItems(likedMedia(), 3))).map((l) => l.filter((m) => types.includes(m.mediaType))),
  ])
  const candidates = pool(lists, new Set([...knownIds(), ...input.exclude]), 40)
  const { intro, picks } = await choose(candidates, 'Sorprendimi: scegli titoli che non si aspetterebbe ma che le piaceranno, poco scontati. Nella reason spiega perché vale la pena rischiare.', 3, 0.9)
  return { intro, results: await withProviders(picks) }
}

/** "Scegli per me": the model picks one title from the advisor's candidates. */
export async function pick(input: { candidates: Media[] }): Promise<{ id: string; reason: string }> {
  configured()
  const items = input.candidates.slice(0, 30)
  const { picks } = await choose(items, 'Deve scegliere cosa guardare adesso: scegline uno solo, quello che le piacerà di più.', 1, 0.7)
  return picks.length > 0 ? { id: picks[0][0].id, reason: picks[0][1] } : { id: '', reason: '' }
}

/** "Ritrova un titolo": guesses a title from vague clues, checked on TMDB, with a follow-up question. */
export async function identify(input: { clues: [string, string][]; exclude: string[] }): Promise<AiAnswer> {
  configured()
  const prompt = [
    'Una persona cerca un film o una serie TV di cui non ricorda il nome. Ecco cosa ricorda:',
    input.clues.map(([q, a]) => `- ${clean(q, 160)}: ${clean(a, 400)}`).join('\n'),
    input.exclude.length > 0 ? `Ha già escluso questi titoli, non riproporli: ${input.exclude.slice(-40).join('; ')}.` : '',
    '',
    'Ragiona sugli indizi (i ricordi possono essere imprecisi) e individua da 1 a 6 titoli reali, dal più probabile.',
    'Per ognuno: titolo originale, anno, tipo (movie o tv) e "reason", una frase in italiano (massimo 150 caratteri) su quali indizi corrispondono.',
    'Aggiungi "question": una domanda semplice in italiano che distingue meglio tra i candidati, con "options": da 2 a 4 risposte brevi possibili.',
    'Aggiungi "intro": una frase breve, per esempio quanto sei sicuro.',
    'Formato: {"intro":"...","items":[{"title":"...","year":2020,"type":"movie","reason":"..."}],"question":"...","options":["...","..."]}',
  ].filter((l) => l !== '').join('\n')
  const data = await ask(prompt, 2600, 'medium', 0.3, 'Sei un esperto di cinema e serie TV bravissimo a riconoscere titoli da descrizioni vaghe. Rispondi sempre e solo con un oggetto JSON valido.')
  const items = list(data.items).slice(0, 6)
  const resolved = await Promise.all(items.map(async (o) => {
    const media = await resolveTitle(clean(o?.title, 120), Number(o?.year) > 1800 ? Math.trunc(Number(o.year)) : null, o?.type === 'movie' || o?.type === 'tv' ? o.type : null)
    return media ? ([media, capital(clean(o?.reason, 220))] as [Media, string]) : null
  }))
  const seen = new Set<string>()
  const picks = resolved.filter((r): r is [Media, string] => r != null && !seen.has(r[0].id) && (seen.add(r[0].id), true))
  return {
    intro: clean(data.intro, 240),
    results: picks.map(([media, reason]) => ({ media, reason, providers: [] })),
    question: clean(data.question, 160),
    options: list(data.options).map((o) => clean(o, 60)).filter((o) => o !== '').slice(0, 4),
  }
}
