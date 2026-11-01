import type { AiIdentification, AiPick } from '../../shared/model.ts'
import { getMeta, setMeta, transaction } from './db.ts'

// AiAdvisor.kt: recommendations on Cloudflare Workers AI with each account's own Cloudflare
// account. Account ID and token are stored on the server for that account and only sent to
// api.cloudflare.com: the browser never gets them back.

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const SYSTEM = 'Sei un esperto di cinema e serie TV che dà consigli personali, concreti e motivati in italiano. Rispondi sempre e solo con JSON valido.'
const NOT_CONFIGURED = "Configura l'IA nelle Impostazioni con il tuo account Cloudflare."

export class AiError extends Error {}

type Message = { role: 'system' | 'user'; content: string }

const accountId = () => getMeta('ai-account-id') ?? ''
const apiToken = () => getMeta('ai-api-token') ?? ''
export const aiConfigured = () => !!accountId().trim() && !!apiToken().trim()

export function saveAi(id: string, token: string) {
  transaction(() => { setMeta('ai-account-id', id.trim()); setMeta('ai-api-token', token.trim()) })
}

export function clearAi() {
  transaction(() => { setMeta('ai-account-id', null); setMeta('ai-api-token', null) })
}

const coerce = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** Blocking check that the credentials can run the model; throws AiError otherwise. */
export async function verify(id: string, token: string) {
  await run(id.trim(), token.trim(), [{ role: 'user', content: 'Rispondi solo: ok' }], 5)
}

export async function recommend(type: string, request: string, liked: string[], disliked: string[], watching: string[], exclude: string[], count = 8): Promise<AiPick[]> {
  if (!aiConfigured()) throw new AiError(NOT_CONFIGURED)
  const kind = type === 'movie' ? 'solo film' : type === 'tv' ? 'solo serie TV' : 'film o serie TV'
  const prompt = [
    `Consiglia ${coerce(count, 3, 10)} titoli (${kind}) per una persona con questi gusti.`,
    liked.length ? `Le sono piaciuti: ${liked.join('; ')}.` : 'Non conosci ancora i suoi gusti: motiva i titoli con la richiesta e con le loro qualità, senza inventare titoli che le sarebbero piaciuti.',
    disliked.length ? `Non le sono piaciuti: ${disliked.join('; ')}.` : '',
    watching.length ? `Sta guardando: ${watching.join('; ')}.` : '',
    request.trim() ? `Richiesta per stasera: "${request.slice(0, 300)}".` : '',
    exclude.length ? `Non proporre questi titoli, li conosce già: ${exclude.join('; ')}.` : '',
    'Proponi titoli reali e noti, preferibilmente disponibili in Italia, vari tra loro e non scontati.',
    "Per ogni titolo indica il titolo originale, l'anno di uscita e il tipo (movie o tv).",
    'La motivazione (reason) deve essere una frase completa e naturale in italiano, tra 80 e 140 caratteri, che spieghi perché le piacerà: cita un titolo che le è piaciuto o la sua richiesta, non limitarti al genere.',
    'Rispondi solo con JSON nel formato {"items":[{"title":"...","year":2020,"type":"movie","reason":"..."}]}.',
  ].filter(Boolean).join('\n')
  return parseItems(await run(accountId(), apiToken(), [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], 900, 0.8))
}

/** Films and series similar to one title, motivated by what they share with it. */
export async function similar(title: string, year: string, type: string, genres: string[], liked: string[], exclude: string[], count = 8): Promise<AiPick[]> {
  if (!aiConfigured()) throw new AiError(NOT_CONFIGURED)
  const kind = type === 'tv' ? 'serie TV' : 'film'
  const source = `"${title}"` + (year.trim() ? ` (${kind}, ${year})` : ` (${kind})`) + (genres.length ? `, genere ${genres.join(', ')}` : '')
  const prompt = [
    `Consiglia ${coerce(count, 3, 10)} titoli tra film e serie TV simili a ${source} per atmosfera, temi, tono e stile, non solo per genere.`,
    liked.length ? `Per variare la scelta, tieni conto che alla persona sono piaciuti anche: ${liked.join('; ')}.` : '',
    `Non proporre "${title}" né suoi sequel, prequel o spin-off.` + (exclude.length ? ` Evita anche questi titoli, li conosce già: ${exclude.join('; ')}.` : ''),
    'Proponi titoli reali e noti, preferibilmente disponibili in Italia, vari tra loro e non scontati.',
    "Per ogni titolo indica il titolo originale, l'anno di uscita e il tipo (movie o tv).",
    `La motivazione (reason) deve essere una frase completa e naturale in italiano, tra 80 e 140 caratteri, che spieghi cosa ha in comune con "${title}".`,
    'Rispondi solo con JSON nel formato {"items":[{"title":"...","year":2020,"type":"movie","reason":"..."}]}.',
  ].filter(Boolean).join('\n')
  return parseItems(await run(accountId(), apiToken(), [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], 900, 0.7))
}

/** Guesses a title the user cannot name; also returns a follow-up question for when no candidate is right. */
export async function identify(clues: [string, string][], exclude: string[]): Promise<AiIdentification> {
  if (!aiConfigured()) throw new AiError(NOT_CONFIGURED)
  const prompt = [
    'Una persona cerca un film o una serie TV di cui non ricorda il nome. Ecco cosa ricorda, domanda per domanda:',
    clues.map(([question, answer]) => `- ${question}: ${answer.slice(0, 400)}`).join('\n'),
    exclude.length ? `Ha già escluso questi titoli, non riproporli: ${exclude.join('; ')}.` : '',
    'Individua da 1 a 5 titoli reali che corrispondono meglio agli indizi, dal più probabile al meno probabile. Considera che i ricordi possono essere imprecisi.',
    "Per ogni titolo indica il titolo originale, l'anno di uscita, il tipo (movie o tv) e, nel campo reason, una frase in italiano di massimo 140 caratteri che spieghi quali indizi corrispondono.",
    'Aggiungi una domanda semplice in italiano (question) che aiuterebbe a distinguere tra i candidati o a trovare quello giusto se nessuno lo è, con da 2 a 4 risposte brevi possibili (options).',
    'Rispondi solo con JSON nel formato {"items":[{"title":"...","year":2020,"type":"movie","reason":"..."}],"question":"...","options":["...","..."]}.',
  ].filter(Boolean).join('\n')
  const system = 'Sei un esperto di cinema e serie TV bravissimo a riconoscere titoli da descrizioni vaghe. Rispondi sempre e solo con JSON valido.'
  const response = await run(accountId(), apiToken(), [{ role: 'system', content: system }, { role: 'user', content: prompt }], 900, 0.3)
  const data = toJson(response)
  const options = Array.isArray(data?.options) ? data!.options as unknown[] : []
  return {
    picks: parseItems(response).slice(0, 5),
    question: String(data?.question ?? '').trim().slice(0, 160),
    options: options.map((o) => String(o ?? '').trim().slice(0, 60)).filter(Boolean).slice(0, 4),
  }
}

/** Returns the model's result.response, a string or an already parsed object. */
async function run(id: string, token: string, messages: Message[], maxTokens: number, temperature = 0.2): Promise<unknown> {
  if (!/^[0-9a-fA-F]{32}$/.test(id)) throw new AiError("L'Account ID non è valido: sono 32 caratteri tra numeri e lettere a-f.")
  let response: Response
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(id)}/ai/run/${MODEL}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages, max_tokens: maxTokens, temperature }),
      signal: AbortSignal.timeout(55_000),
    })
  } catch {
    throw new AiError("Non riesco a contattare l'IA. Controlla la connessione e riprova.")
  }
  const text = await response.text()
  if (!response.ok) {
    const code = response.status
    throw new AiError(
      code === 400 ? "Cloudflare ha rifiutato la richiesta. Controlla l'Account ID." :
      code === 401 || code === 403 ? 'Il token non è valido o non ha il permesso Workers AI. Ricrealo con il modello “Workers AI”.' :
      code === 404 ? "Account non trovato. Controlla l'Account ID." :
      code === 429 ? 'Hai esaurito la quota gratuita di oggi di Workers AI. Riprova domani.' :
      `Cloudflare non risponde (errore ${code}). Riprova tra poco.`,
    )
  }
  try { return (JSON.parse(text) as { result?: { response?: unknown } }).result?.response ?? null } catch { return null }
}

function toJson(response: unknown): Record<string, unknown> | null {
  if (response && typeof response === 'object' && !Array.isArray(response)) return response as Record<string, unknown>
  if (typeof response === 'string') {
    const start = response.indexOf('{'), end = response.lastIndexOf('}')
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
    if (!title || (kind !== 'movie' && kind !== 'tv')) continue
    const year = Math.trunc(Number(o.year) || 0)
    out.push({ title, year: year > 1800 ? year : null, type: kind, reason: String(o.reason ?? '').trim().slice(0, 200) })
  }
  return out
}
