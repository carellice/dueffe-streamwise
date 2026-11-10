export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Fired when the server asks for the password again. */
export const authEvents = new EventTarget()

// Il token della sessione, mandato in ogni richiesta oltre al cookie: dietro il proxy HTTPS di
// Tailscale il cookie poteva non arrivare al server.
const SESSION_KEY = 'streamwise.session'

function sessionToken(): string | null {
  try { return localStorage.getItem(SESSION_KEY) } catch { return null }
}

/** L'intestazione con la sessione, per le richieste fatte senza [api] (catalogo TMDB, backup). */
export function sessionHeaders(): Record<string, string> {
  const session = sessionToken()
  return session ? { 'X-Session': session } : {}
}

function keepSession(value: string | null) {
  try {
    if (value) localStorage.setItem(SESSION_KEY, value)
    else localStorage.removeItem(SESSION_KEY)
  } catch { /* senza localStorage resta il cookie */ }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const headers = new Headers(rest.headers)
  if (json !== undefined) headers.set('Content-Type', 'application/json')
  const session = sessionToken()
  if (session) headers.set('X-Session', session)
  let response: Response
  try {
    response = await fetch(path, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'Server non raggiungibile: controlla la connessione')
  }
  const text = await response.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') authEvents.dispatchEvent(new Event('logout'))
    const message = (body as { error?: string } | null)?.error ?? `Errore ${response.status}`
    throw new ApiError(response.status, message)
  }
  if (path === '/api/login' || path === '/api/register') keepSession((body as { token?: string } | null)?.token ?? null)
  if (path === '/api/logout') keepSession(null)
  return body as T
}
