import { AsyncLocalStorage } from 'node:async_hooks'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  entryFrom, entryJson, personFollowFrom, personFollowJson, personKey, releaseFollowFrom, releaseFollowJson,
  type Backup, type LibraryEntry, type PersonFollow, type ReleaseFollow, type TvReminder,
} from '../../shared/model.ts'

// Data of one account. Every account has its own SQLite file under data/users/<id>/, picked per
// request with withUser(): the functions below never take a user id, they just read and write
// "the current account".

export const dataDir = process.env.DATA_DIR ?? join(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })

// The native app keeps everything in SharedPreferences as JSON: the library ("library"), the
// followed titles ("followed-releases"), the followed people ("followed-people"), the TV reminders
// ("tv-reminders") and a few values ("genres", "subscriptions", "hide-show-credits"). Here each of
// them is a table holding the same JSON, so the backup maps 1:1.
const schema = `
CREATE TABLE IF NOT EXISTS library (id TEXT PRIMARY KEY NOT NULL, position INTEGER NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS follows (id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS people (key TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tv_reminders (key TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, trigger INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS index_tv_reminders_trigger ON tv_reminders (trigger);
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

export function transaction<T>(work: () => T): T {
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    touch()
    return result
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

// --- preferences kept on the account (they are in the backup or the background check needs them)

export type Prefs = { genres: string[]; subscriptions: number[]; hideShowCredits: boolean }

const jsonMeta = <T>(key: string, fallback: T): T => {
  try { return JSON.parse(getMeta(key) ?? '') as T } catch { return fallback }
}

export function prefs(): Prefs {
  return {
    genres: jsonMeta<string[]>('genres', []),
    subscriptions: jsonMeta<number[]>('subscriptions', []),
    hideShowCredits: getMeta('hide-show-credits') !== 'false',
  }
}

export function savePrefs(patch: Partial<Prefs>) {
  transaction(() => {
    if (patch.genres) setMeta('genres', JSON.stringify(patch.genres.map(String)))
    if (patch.subscriptions) setMeta('subscriptions', JSON.stringify([...new Set(patch.subscriptions.map(Number).filter((n) => n > 0).map(serviceId))]))
    if (patch.hideShowCredits != null) setMeta('hide-show-credits', String(!!patch.hideShowCredits))
  })
}

/** SubscriptionRepository.serviceId: Netflix and Prime Video variants count as the main service. */
export const serviceId = (id: number) => (id === 1796 ? 8 : id === 2100 ? 119 : id)

// --- library ---------------------------------------------------------------------------------

export function library(): LibraryEntry[] {
  return (db.prepare('SELECT json FROM library ORDER BY position, id').all() as { json: string }[]).map((r) => entryFrom(JSON.parse(r.json)))
}

/** Saves entries as they are; new ones go to the end, like LinkedHashMap insertion order. */
export function saveEntries(entries: LibraryEntry[], removed: string[] = []) {
  transaction(() => {
    for (const id of removed) db.prepare('DELETE FROM library WHERE id = ?').run(id)
    for (const raw of entries) {
      const entry = entryFrom(entryJson(raw))
      if (!entry.media.id) continue
      const known = db.prepare('SELECT position FROM library WHERE id = ?').get(entry.media.id) as { position: number } | undefined
      const position = known?.position ?? Number((db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM library').get() as { p: number }).p)
      db.prepare('INSERT OR REPLACE INTO library (id, position, json) VALUES (?, ?, ?)').run(entry.media.id, position, JSON.stringify(entryJson(entry)))
    }
  })
}

// --- followed titles and people ----------------------------------------------------------------

export function follows(): ReleaseFollow[] {
  return (db.prepare('SELECT json FROM follows').all() as { json: string }[]).map((r) => releaseFollowFrom(JSON.parse(r.json))).filter((f) => f.media.id)
}

export function getFollow(id: string): ReleaseFollow | null {
  const row = db.prepare('SELECT json FROM follows WHERE id = ?').get(id) as { json: string } | undefined
  return row ? releaseFollowFrom(JSON.parse(row.json)) : null
}

export function saveFollow(f: ReleaseFollow) {
  transaction(() => db.prepare('INSERT OR REPLACE INTO follows (id, json) VALUES (?, ?)').run(f.media.id, JSON.stringify(releaseFollowJson(f))))
}

/** Saves a checked follow unless the user stopped following it in the meantime; unchanged ones are not rewritten. */
export function updateFollow(f: ReleaseFollow): boolean {
  const row = db.prepare('SELECT json FROM follows WHERE id = ?').get(f.media.id) as { json: string } | undefined
  if (!row) return false
  const value = JSON.stringify(releaseFollowJson(f))
  if (row.json !== value) saveFollow(f)
  return true
}

export function unfollow(id: string) {
  transaction(() => db.prepare('DELETE FROM follows WHERE id = ?').run(id))
}

export function people(): PersonFollow[] {
  const list = (db.prepare('SELECT json FROM people').all() as { json: string }[]).map((r) => personFollowFrom(JSON.parse(r.json))).filter((f) => f.person.id > 0)
  return list.sort((a, b) => a.person.name.toLowerCase().localeCompare(b.person.name.toLowerCase(), 'it'))
}

export function savePerson(f: PersonFollow) {
  transaction(() => db.prepare('INSERT OR REPLACE INTO people (key, json) VALUES (?, ?)').run(personKey(f.person), JSON.stringify(personFollowJson(f))))
}

export function updatePerson(f: PersonFollow): boolean {
  const row = db.prepare('SELECT json FROM people WHERE key = ?').get(personKey(f.person)) as { json: string } | undefined
  if (!row) return false
  const value = JSON.stringify(personFollowJson(f))
  if (row.json !== value) savePerson(f)
  return true
}

export function unfollowPerson(key: string) {
  transaction(() => db.prepare('DELETE FROM people WHERE key = ?').run(key))
}

export const nothingFollowed = () =>
  !db.prepare('SELECT 1 FROM follows LIMIT 1').get() && !db.prepare('SELECT 1 FROM people LIMIT 1').get()

// --- TV reminders ------------------------------------------------------------------------------

export function reminders(): TvReminder[] {
  return (db.prepare('SELECT json FROM tv_reminders ORDER BY trigger').all() as { json: string }[]).map((r) => JSON.parse(r.json) as TvReminder)
}

export function saveReminder(r: TvReminder) {
  transaction(() => db.prepare('INSERT OR REPLACE INTO tv_reminders (key, json, trigger) VALUES (?, ?, ?)').run(r.key, JSON.stringify(r), r.trigger))
}

export function deleteReminder(key: string) {
  transaction(() => db.prepare('DELETE FROM tv_reminders WHERE key = ?').run(key))
}

export function dueReminders(now: number): TvReminder[] {
  return (db.prepare('SELECT json FROM tv_reminders WHERE trigger <= ?').all(now) as { json: string }[]).map((r) => JSON.parse(r.json) as TvReminder)
}

// --- state and backup --------------------------------------------------------------------------

/** Everything the app shows, sent to the client in one go (GET /api/state). */
export function state() {
  return {
    library: library().map(entryJson),
    follows: follows().map(releaseFollowJson),
    people: people().map(personFollowJson),
    reminders: reminders(),
    prefs: prefs(),
    aiConfigured: !!getMeta('ai-account-id') && !!getMeta('ai-api-token'),
  }
}

/** LibraryStore.exportJson: the same file the phone writes. */
export function exportBackup(): Backup {
  const p = prefs()
  return {
    format: 'streamwise-backup',
    version: 1,
    exportedAt: new Date().toString(),
    library: library().map(entryJson),
    genres: p.genres,
    subscriptions: p.subscriptions,
    follows: follows().map(releaseFollowJson),
    followedPeople: people().map(personFollowJson),
  }
}

/** Old backups kept the subscriptions per month ({"2025-10":[8,119]}): take the current or latest month. */
function subscriptionIds(raw: unknown): number[] {
  let list: unknown = raw
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const months = raw as Record<string, unknown>
    const now = new Date().toISOString().slice(0, 7)
    list = months[now]
    if (!Array.isArray(list)) {
      const latest = Object.keys(months).filter((k) => /^\d{4}-\d{2}$/.test(k) && Array.isArray(months[k])).sort().pop()
      list = latest ? months[latest] : []
    }
  }
  return Array.isArray(list) ? [...new Set(list.map(Number).filter((n) => n > 0).map(serviceId))] : []
}

/** LibraryStore.importJson: replaces library, genres, subscriptions and follows. Returns false for a file that is not a backup. */
export function importBackup(raw: unknown): boolean {
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!root || !Array.isArray(root.library)) return false
  transaction(() => {
    db.exec('DELETE FROM library')
    let position = 1
    const seen = new Set<string>()
    for (const item of root.library as unknown[]) {
      const e = entryFrom(item)
      if (!e.media.id) continue
      if (seen.has(e.media.id)) db.prepare('DELETE FROM library WHERE id = ?').run(e.media.id)
      seen.add(e.media.id)
      db.prepare('INSERT OR REPLACE INTO library (id, position, json) VALUES (?, ?, ?)').run(e.media.id, position++, JSON.stringify(entryJson(e)))
    }
    setMeta('genres', JSON.stringify(Array.isArray(root.genres) ? root.genres.map(String) : []))
    if ('subscriptions' in root) setMeta('subscriptions', JSON.stringify(subscriptionIds(root.subscriptions)))
    if (Array.isArray(root.follows)) {
      db.exec('DELETE FROM follows')
      for (const item of root.follows) {
        const f = releaseFollowFrom(item)
        if (f.media.id) db.prepare('INSERT OR REPLACE INTO follows (id, json) VALUES (?, ?)').run(f.media.id, JSON.stringify(releaseFollowJson(f)))
      }
    }
    if (Array.isArray(root.followedPeople)) {
      db.exec('DELETE FROM people')
      for (const item of root.followedPeople) {
        const f = personFollowFrom(item)
        if (f.person.id > 0) db.prepare('INSERT OR REPLACE INTO people (key, json) VALUES (?, ?)').run(personKey(f.person), JSON.stringify(personFollowJson(f)))
      }
    }
  })
  return true
}

export const currentUserId = () => user().id
