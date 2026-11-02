import { AsyncLocalStorage } from 'node:async_hooks'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  defaultPrefs, entryFromJson, entryToJson, personFollowFromJson, personFollowToJson, providerFromJson, providerToJson,
  releaseFollowFromJson, releaseFollowToJson, personKey,
  type AppState, type AvailabilityRecord, type LibraryEntry, type PersonFollow, type Prefs, type Provider, type ReleaseFollow, type TvReminder,
} from '../../shared/model.ts'
import { subscriptionIds } from '../../shared/subscriptions.ts'
import { yearMonthRome } from '../../shared/dates.ts'

// Data of one account. Every account has its own SQLite file under data/users/<id>/, picked per
// request with withUser(): the functions below never take a user id, they just read and write
// "the current account".

export const dataDir = process.env.DATA_DIR ?? join(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })

// The Android app keeps everything in SharedPreferences as JSON (LibraryStore, ReleaseFollows,
// PersonFollows, TvReminderReceiver, SubscriptionRepository): one table per preference file,
// each row the same JSON object the app stores, keyed like the app keys it.
const schema = `
CREATE TABLE IF NOT EXISTS library (id TEXT PRIMARY KEY NOT NULL, position INTEGER NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS follows (id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS people (key TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reminders (key TEXT PRIMARY KEY NOT NULL, trigger INTEGER NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS availability (id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, reminders INTEGER NOT NULL);
`

// --- accounts: every account has its own database, picked per request -------------------------

type UserData = { id: number; db: DatabaseSync }

const opened = new Map<number, UserData>()
const current = new AsyncLocalStorage<UserData>()

export const userDir = (userId: number) => join(dataDir, 'users', String(userId))

function open(userId: number): UserData {
  const known = opened.get(userId)
  if (known) return known
  const dir = userDir(userId)
  mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(join(dir, 'streamwise.db'))
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;')
  db.exec(schema)
  const data = { id: userId, db }
  opened.set(userId, data)
  return data
}

/** Runs [work] on the data of [userId]: every function of this module then reads and writes there. */
export function withUser<T>(userId: number, work: () => T): T {
  return current.run(open(userId), work)
}

export function closeUser(userId: number) {
  opened.get(userId)?.db.close()
  opened.delete(userId)
}

/** The account the current request or job works for. */
export const currentUserId = () => current.getStore()?.id ?? null

function user(): UserData {
  const data = current.getStore()
  if (!data) throw new Error('Nessun account attivo')
  return data
}

/** The database of the current account. */
export const db = {
  prepare: (sql: string) => user().db.prepare(sql),
  exec: (sql: string) => user().db.exec(sql),
}

// --- meta ------------------------------------------------------------------------------------

export function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setMeta(key: string, value: string | null) {
  if (value == null) db.prepare('DELETE FROM meta WHERE key = ?').run(key)
  else db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

/** Bumped on every change, so clients can tell when to reload (GET /api/state?since=<revision>). */
export function revision(): number {
  return Number(getMeta('revision') ?? '0')
}

function touch() {
  setMeta('revision', String(revision() + 1))
}

let depth = 0

export function transaction<T>(work: () => T): T {
  if (depth > 0) return work()
  db.exec('BEGIN')
  depth++
  try {
    const result = work()
    depth--
    db.exec('COMMIT')
    touch()
    return result
  } catch (e) {
    depth--
    db.exec('ROLLBACK')
    throw e
  }
}

// --- readers ---------------------------------------------------------------------------------

const parse = (text: string): unknown => {
  try { return JSON.parse(text) } catch { return {} }
}

export function libraryEntries(): LibraryEntry[] {
  return (db.prepare('SELECT json FROM library ORDER BY position').all() as { json: string }[]).map((r) => entryFromJson(parse(r.json)))
}

export function releaseFollows(): ReleaseFollow[] {
  return (db.prepare('SELECT json FROM follows').all() as { json: string }[]).map((r) => releaseFollowFromJson(parse(r.json))).filter((f) => f.media.id !== '')
}

export function releaseFollow(id: string): ReleaseFollow | null {
  const row = db.prepare('SELECT json FROM follows WHERE id = ?').get(id) as { json: string } | undefined
  return row ? releaseFollowFromJson(parse(row.json)) : null
}

export function personFollows(): PersonFollow[] {
  return (db.prepare('SELECT json FROM people').all() as { json: string }[]).map((r) => personFollowFromJson(parse(r.json))).filter((f) => f.person.id > 0)
}

export function reminders(): TvReminder[] {
  return (db.prepare('SELECT json FROM reminders ORDER BY trigger').all() as { json: string }[]).map((r) => parse(r.json) as TvReminder)
}

export function prefs(): Prefs {
  const stored = parse(getMeta('prefs') ?? '{}') as Partial<Prefs>
  return { ...defaultPrefs(), ...stored }
}

export function services(): Provider[] {
  const raw = parse(getMeta('services') ?? '[]')
  return Array.isArray(raw) ? raw.map(providerFromJson) : []
}

export function availability(): Record<string, AvailabilityRecord> {
  const out: Record<string, AvailabilityRecord> = {}
  for (const row of db.prepare('SELECT id, json FROM availability').all() as { id: string; json: string }[]) {
    const o = parse(row.json) as { checkedAt?: number; providers?: unknown[] }
    out[row.id] = { checkedAt: Number(o.checkedAt) || 0, providers: (o.providers ?? []).map(providerFromJson) }
  }
  return out
}

export const aiAccount = () => getMeta('ai_account') ?? ''
export const aiToken = () => getMeta('ai_token') ?? ''

/** Everything the app shows, sent to the client in one go (GET /api/state). */
export function state(): Omit<AppState, 'revision'> {
  return {
    library: libraryEntries(),
    follows: releaseFollows(),
    people: personFollows(),
    reminders: reminders(),
    prefs: prefs(),
    services: services(),
    availability: availability(),
    // The token itself never leaves the server.
    ai: { configured: aiAccount() !== '' && aiToken() !== '', accountId: aiAccount() },
    lastCheck: Number(getMeta('last_check') ?? '0'),
    notices: notices(),
  }
}

/** Notifications the release checks sent recently, so the Android app in server mode can show them too. */
export type SentNotice = { id: string; title: string; text: string; mediaId: string; subtext: string; poster: string; at: number }

export function notices(): SentNotice[] {
  try {
    const list = JSON.parse(getMeta('notices') ?? '[]') as SentNotice[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function addNotice(notice: SentNotice) {
  const week = Date.now() - 7 * 24 * 3600 * 1000
  const list = [...notices().filter((n) => n.at > week && n.id !== notice.id), notice].slice(-50)
  setMeta('notices', JSON.stringify(list))
}

// --- writes ----------------------------------------------------------------------------------

/** LinkedHashMap.put: an existing title keeps its place, a new one goes to the end. */
function putEntry(entry: LibraryEntry) {
  const row = db.prepare('SELECT position FROM library WHERE id = ?').get(entry.media.id) as { position: number } | undefined
  const position = row?.position ?? Number((db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM library').get() as { p: number }).p)
  db.prepare('INSERT OR REPLACE INTO library (id, position, json) VALUES (?, ?, ?)').run(entry.media.id, position, JSON.stringify(entryToJson(entry)))
}

export function saveEntry(entry: LibraryEntry) {
  transaction(() => putEntry(entry))
}

export function deleteEntry(id: string) {
  transaction(() => db.prepare('DELETE FROM library WHERE id = ?').run(id))
}

export function saveFollow(f: ReleaseFollow) {
  transaction(() => db.prepare('INSERT OR REPLACE INTO follows (id, json) VALUES (?, ?)').run(f.media.id, JSON.stringify(releaseFollowToJson(f))))
}

/** Saves a checked follow unless the user stopped following it in the meantime; unchanged ones are not rewritten. */
export function updateFollow(f: ReleaseFollow): boolean {
  const stored = db.prepare('SELECT json FROM follows WHERE id = ?').get(f.media.id) as { json: string } | undefined
  if (!stored) return false
  const value = JSON.stringify(releaseFollowToJson(f))
  if (stored.json !== value) transaction(() => db.prepare('UPDATE follows SET json = ? WHERE id = ?').run(value, f.media.id))
  return true
}

export function deleteFollow(id: string) {
  transaction(() => db.prepare('DELETE FROM follows WHERE id = ?').run(id))
}

export function savePerson(f: PersonFollow) {
  transaction(() => db.prepare('INSERT OR REPLACE INTO people (key, json) VALUES (?, ?)').run(personKey(f.person), JSON.stringify(personFollowToJson(f))))
}

export function updatePerson(f: PersonFollow): boolean {
  const key = personKey(f.person)
  const stored = db.prepare('SELECT json FROM people WHERE key = ?').get(key) as { json: string } | undefined
  if (!stored) return false
  const value = JSON.stringify(personFollowToJson(f))
  if (stored.json !== value) transaction(() => db.prepare('UPDATE people SET json = ? WHERE key = ?').run(value, key))
  return true
}

export function deletePerson(key: string) {
  transaction(() => db.prepare('DELETE FROM people WHERE key = ?').run(key))
}

export function saveReminder(r: TvReminder) {
  transaction(() => db.prepare('INSERT OR REPLACE INTO reminders (key, trigger, json) VALUES (?, ?, ?)').run(r.key, r.trigger, JSON.stringify(r)))
}

export function deleteReminder(key: string) {
  transaction(() => db.prepare('DELETE FROM reminders WHERE key = ?').run(key))
}

export function setPrefs(changes: Partial<Prefs>) {
  transaction(() => setMeta('prefs', JSON.stringify({ ...prefs(), ...changes })))
}

export function saveAvailability(id: string, record: AvailabilityRecord, seen: Provider[]) {
  transaction(() => {
    db.prepare('INSERT OR REPLACE INTO availability (id, json) VALUES (?, ?)').run(id, JSON.stringify({ checkedAt: record.checkedAt, providers: record.providers.map(providerToJson) }))
    const known = new Map<number, Provider>()
    for (const p of services()) known.set(p.id, p)
    for (const p of seen) if (p.id === (p.id === 1796 ? 8 : p.id === 2100 ? 119 : p.id)) known.set(p.id, p)
    setMeta('services', JSON.stringify([...known.values()].map(providerToJson)))
  })
}

export function setAi(accountId: string, token: string) {
  transaction(() => { setMeta('ai_account', accountId || null); setMeta('ai_token', token || null) })
}

// --- backup (LibraryStore.exportJson / importJson) ----------------------------------------------

export function exportBackup(): Record<string, unknown> {
  const p = prefs()
  return {
    format: 'streamwise-backup',
    version: 1,
    exportedAt: new Date().toString(),
    library: libraryEntries().map(entryToJson),
    genres: p.genres,
    subscriptions: p.subscriptions,
    follows: releaseFollows().map(releaseFollowToJson),
    followedPeople: personFollows().map(personFollowToJson),
  }
}

/** Replaces the account's data with a native backup. False when the file is not a StreamWise backup. */
export function importBackup(root: Record<string, unknown>): boolean {
  const library = root.library
  if (!Array.isArray(library)) return false
  transaction(() => {
    db.prepare('DELETE FROM library').run()
    for (const item of library) {
      const e = entryFromJson(item)
      if (e.media.id !== '') putEntry(e)
    }
    const changes: Partial<Prefs> = { genres: Array.isArray(root.genres) ? root.genres.map(String) : [], onboardingDone: true }
    if ('subscriptions' in root) changes.subscriptions = subscriptionIds(root.subscriptions, yearMonthRome())
    setMeta('prefs', JSON.stringify({ ...prefs(), ...changes }))
    if (Array.isArray(root.follows)) {
      db.prepare('DELETE FROM follows').run()
      for (const item of root.follows) {
        const f = releaseFollowFromJson(item)
        if (f.media.id !== '') db.prepare('INSERT OR REPLACE INTO follows (id, json) VALUES (?, ?)').run(f.media.id, JSON.stringify(releaseFollowToJson(f)))
      }
    }
    if (Array.isArray(root.followedPeople)) {
      db.prepare('DELETE FROM people').run()
      for (const item of root.followedPeople) {
        const f = personFollowFromJson(item)
        if (f.person.id > 0) db.prepare('INSERT OR REPLACE INTO people (key, json) VALUES (?, ?)').run(personKey(f.person), JSON.stringify(personFollowToJson(f)))
      }
    }
  })
  return true
}
