import { TmdbApi } from '../../../shared/tmdb.ts'
import { ApiError } from './api.ts'

// TmdbApi in the browser: every request goes to the server's proxy, which adds the API key.
// Answers are kept for the session, like the native client's in-memory caches.

const memory = new Map<string, Promise<unknown>>()

async function get(path: string, params?: Record<string, string> | null): Promise<any> {
  const query = new URLSearchParams(params ?? {}).toString()
  const url = '/api/tmdb' + path + (query ? '?' + query : '')
  const hit = memory.get(url)
  if (hit) return hit
  const request = (async () => {
    let response: Response
    try {
      response = await fetch(url, { credentials: 'same-origin' })
    } catch {
      throw new ApiError(0, 'Server non raggiungibile')
    }
    const text = await response.text()
    if (!response.ok) {
      let message = `TMDB ${response.status}`
      try { message = JSON.parse(text).error ?? message } catch { /* not json */ }
      throw new ApiError(response.status, message)
    }
    return JSON.parse(text)
  })()
  memory.set(url, request)
  request.catch(() => memory.delete(url))
  if (memory.size > 600) memory.delete(memory.keys().next().value as string)
  return request
}

export const tmdb = new TmdbApi(get)
