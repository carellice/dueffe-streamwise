// Port of AiAdvisor.kt: recommendations on Cloudflare Workers AI with the user's own account.
// The Account ID and API token are saved per account on the server and sent only to
// api.cloudflare.com; the browser only learns whether the AI is configured.
import { aiAccount, aiToken } from './db.ts'

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

export class AiError extends Error {}

export type AiPick = { title: string; year: number | null; type: string; reason: string }
export type AiIdentification = { picks: AiPick[]; question: string; options: string[] }

const SYSTEM = 'Sei un esperto di cinema e serie TV che dà consigli personali, concreti e motivati in italiano. Rispondi sempre e solo con JSON valido.'
const NOT_CONFIGURED = "Configura l'IA nelle Impostazioni con il tuo account Cloudflare."
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const joined = (list: string[]) => list.join('; ')

function configured() {
  if (aiAccount() === '' || aiToken() === '') throw new AiError(NOT_CONFIGURED)
}

/** Returns the model's result.response, a string or an already parsed object. */
async function run(accountId: string, apiToken: string, messages: { role: string; content: string }[], maxTokens: number, temperature = 0.2): Promise<unknown> {
  if (!/^[0-9a-fA-F]{32}$/.test(accountId)) throw new AiError("L'Account ID non è valido: sono 32 caratteri tra numeri e lettere a-f.")
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${MODEL}`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({ messages, max_tokens: maxTokens, temperature }),
      signal: AbortSignal.timeout(55000),
    })
  } catch {
    throw new AiError("Non riesco a contattare l'IA. Controlla la connessione e riprova.")
  }
  const text = await response.text().catch(() => '')
  if (!response.ok) {
    const code = response.status
    throw new AiError(
      code === 400 ? "Cloudflare ha rifiutato la richiesta. Controlla l'Account ID."
        : code === 401 || code === 403 ? 'Il token non è valido o non ha il permesso Workers AI. Ricrealo con il modello “Workers AI”.'
          : code === 404 ? "Account non trovato. Controlla l'Account ID."
            : code === 429 ? 'Hai esaurito la quota gratuita di oggi di Workers AI. Riprova domani.'
              : `Cloudflare non risponde (errore ${code}). Riprova tra poco.`,
    )
  }
  try {
    return (JSON.parse(text) as { result?: { response?: unknown } }).result?.response ?? null
  } catch {
    return null
  }
}

function toJson(response: unknown): Record<string, unknown> | null {
  if (response && typeof response === 'object' && !Array.isArray(response)) return response as Record<string, unknown>
  if (typeof response === 'string') {
    const start = response.indexOf('{')
    const end = response.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try { return JSON.parse(response.slice(start, end + 1)) } catch { return null }
  }
  return null
}

function parseItems(response: unknown): AiPick[] {
  const items = toJson(response)?.items
  if (!Array.isArray(items)) return []
  const out: AiPick[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const title = String(o.title ?? '').trim().slice(0, 120)
    const kind = String(o.type ?? '')
    if (title === '' || (kind !== 'movie' && kind !== 'tv')) continue
    const year = Math.trunc(Number(o.year) || 0)
    out.push({ title, year: year > 1800 ? year : null, type: kind, reason: String(o.reason ?? '').trim().slice(0, 200) })
  }
  return out
}

/** Checks that the credentials can run the model; throws AiError otherwise. */
export async function verify(accountId: string, apiToken: string) {
  await run(accountId.trim(), apiToken.trim(), [{ role: 'user', content: 'Rispondi solo: ok' }], 5)
}

export type RecommendInput = { type: string; request: string; liked: string[]; disliked: string[]; watching: string[]; exclude: string[]; count?: number }

export async function recommend(input: RecommendInput): Promise<AiPick[]> {
  configured()
  const count = clamp(input.count ?? 8, 3, 10)
  const kind = input.type === 'movie' ? 'solo film' : input.type === 'tv' ? 'solo serie TV' : 'film o serie TV'
  const prompt = [
    `Consiglia ${count} titoli (${kind}) per una persona con questi gusti.`,
    input.liked.length > 0 ? `Le sono piaciuti: ${joined(input.liked)}.` : 'Non conosci ancora i suoi gusti: motiva i titoli con la richiesta e con le loro qualità, senza inventare titoli che le sarebbero piaciuti.',
    input.disliked.length > 0 ? `Non le sono piaciuti: ${joined(input.disliked)}.` : '',
    input.watching.length > 0 ? `Sta guardando: ${joined(input.watching)}.` : '',
    input.request.trim() !== '' ? `Richiesta per stasera: "${input.request.slice(0, 300)}".` : '',
    input.exclude.length > 0 ? `Non proporre questi titoli, li conosce già: ${joined(input.exclude)}.` : '',
    'Proponi titoli reali e noti, preferibilmente disponibili in Italia, vari tra loro e non scontati.',
    "Per ogni titolo indica il titolo originale, l'anno di uscita e il tipo (movie o tv).",
    'La motivazione (reason) deve essere una frase completa e naturale in italiano, tra 80 e 140 caratteri, che spieghi perché le piacerà: cita un titolo che le è piaciuto o la sua richiesta, non limitarti al genere.',
    'Rispondi solo con JSON nel formato {"items":[{"title":"...","year":2020,"type":"movie","reason":"..."}]}.',
  ].filter((x) => x !== '').join('\n')
  return parseItems(await run(aiAccount(), aiToken(), [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], 900, 0.8))
}

export type SimilarInput = { title: string; year: string; type: string; genres: string[]; liked: string[]; exclude: string[]; count?: number }

export async function similar(input: SimilarInput): Promise<AiPick[]> {
  configured()
  const kind = input.type === 'tv' ? 'serie TV' : 'film'
  const source = `"${input.title}"` + (input.year.trim() !== '' ? ` (${kind}, ${input.year})` : ` (${kind})`) + (input.genres.length > 0 ? `, genere ${input.genres.join(', ')}` : '')
  const prompt = [
    `Consiglia ${clamp(input.count ?? 8, 3, 10)} titoli tra film e serie TV simili a ${source} per atmosfera, temi, tono e stile, non solo per genere.`,
    input.liked.length > 0 ? `Per variare la scelta, tieni conto che alla persona sono piaciuti anche: ${joined(input.liked)}.` : '',
    `Non proporre "${input.title}" né suoi sequel, prequel o spin-off.` + (input.exclude.length > 0 ? ` Evita anche questi titoli, li conosce già: ${joined(input.exclude)}.` : ''),
    'Proponi titoli reali e noti, preferibilmente disponibili in Italia, vari tra loro e non scontati.',
    "Per ogni titolo indica il titolo originale, l'anno di uscita e il tipo (movie o tv).",
    `La motivazione (reason) deve essere una frase completa e naturale in italiano, tra 80 e 140 caratteri, che spieghi cosa ha in comune con "${input.title}".`,
    'Rispondi solo con JSON nel formato {"items":[{"title":"...","year":2020,"type":"movie","reason":"..."}]}.',
  ].filter((x) => x !== '').join('\n')
  return parseItems(await run(aiAccount(), aiToken(), [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], 900, 0.7))
}

/** Guesses a title the user cannot name from their answers; also returns a follow-up question. */
export async function identify(clues: [string, string][], exclude: string[]): Promise<AiIdentification> {
  configured()
  const prompt = [
    'Una persona cerca un film o una serie TV di cui non ricorda il nome. Ecco cosa ricorda, domanda per domanda:',
    clues.map(([question, answer]) => `- ${question}: ${answer.slice(0, 400)}`).join('\n'),
    exclude.length > 0 ? `Ha già escluso questi titoli, non riproporli: ${joined(exclude)}.` : '',
    'Individua da 1 a 5 titoli reali che corrispondono meglio agli indizi, dal più probabile al meno probabile. Considera che i ricordi possono essere imprecisi.',
    "Per ogni titolo indica il titolo originale, l'anno di uscita, il tipo (movie o tv) e, nel campo reason, una frase in italiano di massimo 140 caratteri che spieghi quali indizi corrispondono.",
    'Aggiungi una domanda semplice in italiano (question) che aiuterebbe a distinguere tra i candidati o a trovare quello giusto se nessuno lo è, con da 2 a 4 risposte brevi possibili (options).',
    'Rispondi solo con JSON nel formato {"items":[{"title":"...","year":2020,"type":"movie","reason":"..."}],"question":"...","options":["...","..."]}.',
  ].filter((x) => x !== '').join('\n')
  const system = 'Sei un esperto di cinema e serie TV bravissimo a riconoscere titoli da descrizioni vaghe. Rispondi sempre e solo con JSON valido.'
  const response = await run(aiAccount(), aiToken(), [{ role: 'system', content: system }, { role: 'user', content: prompt }], 900, 0.3)
  const data = toJson(response)
  const options = Array.isArray(data?.options) ? (data.options as unknown[]) : []
  return {
    picks: parseItems(response).slice(0, 5),
    question: String(data?.question ?? '').trim().slice(0, 160),
    options: options.map((o) => String(o ?? '').trim().slice(0, 60)).filter((o) => o !== '').slice(0, 4),
  }
}
