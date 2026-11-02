import webpush from 'web-push'
import { getServerMeta, setServerMeta, userIds } from './accounts.ts'
import * as data from './db.ts'
import { db, withUser } from './db.ts'
import { evaluate, evaluatePerson, followCompleted, personNoticeText } from '../../shared/follows.ts'
import { hourRome, timeRome, todayRome, dateRome } from '../../shared/dates.ts'
import { personKey, type Media } from '../../shared/model.ts'
import { mapPersonCredits } from '../../shared/tmdb.ts'
import { serverTmdb, tmdbConfigured } from './tmdb.ts'

// Web Push replaces the native notifications: the server decides when to send them, like
// ReleaseCheckWorker (WorkManager) and TvReminderReceiver (AlarmManager) did on the phone.

// One pair of keys for the whole server; each account keeps the subscriptions of its own devices.
let keys = { publicKey: getServerMeta('vapid_public') ?? '', privateKey: getServerMeta('vapid_private') ?? '' }
if (!keys.publicKey || !keys.privateKey) {
  keys = webpush.generateVAPIDKeys()
  setServerMeta('vapid_public', keys.publicKey)
  setServerMeta('vapid_private', keys.privateKey)
}
webpush.setVapidDetails('https://github.com/carellice/dueffe-streamwise', keys.publicKey, keys.privateKey)

export const vapidPublicKey = keys.publicKey

type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } }

/** Subscribes a device of the current account. A phone moved to another account stops getting the old one's notifications. */
export function subscribe(subscription: Subscription, reminders: boolean, userId: number) {
  for (const other of userIds()) {
    if (other !== userId) withUser(other, () => unsubscribe(subscription.endpoint))
  }
  db.prepare('INSERT INTO push_subs (endpoint, json, reminders) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET json = excluded.json, reminders = excluded.reminders')
    .run(subscription.endpoint, JSON.stringify(subscription), reminders ? 1 : 0)
}

export function unsubscribe(endpoint: string) {
  db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(endpoint)
}

export const pushDevices = () => Number((db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE reminders = 1').get() as { n: number }).n)

/** url: where a tap on the notification opens the app (a deep link like "/?open=..."). tag: replaces older ones with the same tag. */
export type Payload = { title: string; body: string; url: string; tag: string; icon?: string }

/** Sends to every device of the current account. */
export async function send(payload: Payload) {
  const rows = db.prepare('SELECT endpoint, json FROM push_subs WHERE reminders = 1').all() as { endpoint: string; json: string }[]
  await Promise.all(rows.map(async (row) => {
    try {
      await webpush.sendNotification(JSON.parse(row.json), JSON.stringify(payload), { TTL: 60 * 60 * 24 })
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      // The browser dropped the subscription: forget it.
      if (status === 404 || status === 410) unsubscribe(row.endpoint)
      else console.warn('Push non inviata:', (e as Error).message)
    }
  }))
}

const mediaLink = (media: Media) => `/?open=media&id=${encodeURIComponent(media.id)}`

// --- ReleaseCheckWorker.doWork ------------------------------------------------------------------

const running = new Set<number>()

/**
 * Compares followed titles and people with TMDB and notifies new episodes, releases, streaming
 * arrivals and new credits. Background runs stay silent at night (8–23 like the phone); a check
 * the user started (following something, opening the app) runs at any hour.
 */
export async function checkReleases(interactive: boolean) {
  const userId = data.currentUserId()
  if (userId == null || running.has(userId)) return
  if (!interactive) {
    const hour = hourRome()
    if (hour < 8 || hour >= 23) return
  }
  if (!tmdbConfigured()) return
  running.add(userId)
  try {
    const api = serverTmdb()
    const today = todayRome()
    for (const follow of data.releaseFollows()) {
      if (followCompleted(follow)) continue
      try {
        const notices = evaluate(follow, await api.releaseInfo(follow.media), today)
        if (data.updateFollow(follow)) {
          for (const notice of notices) {
            await send({ title: notice.title, body: notice.text, url: mediaLink(follow.media), tag: `${follow.media.id}:${notice.kind}`, icon: follow.media.poster || undefined })
          }
        }
      } catch { /* retried at the next run */ }
    }
    const hideShows = data.prefs().hideShowCredits
    for (const follow of data.personFollows()) {
      try {
        const credits = await api.personCreditsJson(follow.person.id)
        const all = mapPersonCredits(credits, follow.person.director, false)
        const shows = new Set<string>()
        if (hideShows) {
          for (const m of all) shows.add(m.id)
          for (const m of mapPersonCredits(credits, follow.person.director, true)) shows.delete(m.id)
        }
        const fresh = evaluatePerson(follow, all, shows, today)
        if (data.updatePerson(follow)) {
          for (const media of fresh) {
            await send({ title: follow.person.name, body: personNoticeText(media, today), url: mediaLink(media), tag: `${personKey(follow.person)}:${media.id}`, icon: media.poster || undefined })
          }
        }
      } catch { /* retried at the next run */ }
    }
    data.setMeta('last_check', String(Date.now()))
  } finally {
    running.delete(userId)
  }
}

/** "Ricontrolla" from the app, following something, or opening it after 30 minutes. */
export function checkNowFor(userId: number) {
  withUser(userId, () => checkReleases(true)).catch((e) => console.error('Controllo uscite non riuscito:', e))
}

// --- TvReminderReceiver -----------------------------------------------------------------------

/** Delivers the TV reminders whose time has come; past programmes are dropped like the phone did. */
export async function deliverReminders() {
  const now = Date.now()
  for (const reminder of data.reminders()) {
    if (reminder.trigger > now) continue
    data.deleteReminder(reminder.key)
    if (reminder.end <= now) continue
    await send({
      title: reminder.title,
      body: `${reminder.channel} · alle ${timeRome(reminder.start)}`,
      url: `/?open=guide&date=${dateRome(reminder.start)}`,
      tag: `tv:${reminder.key}`,
    })
  }
}

/** The periodic job of the current account. */
export async function runJobs() {
  try {
    await deliverReminders()
  } catch (e) {
    console.error('Promemoria non inviati:', e)
  }
}

/** Every hour, like the phone's periodic WorkManager job (which ran every 2 hours). */
export async function runReleaseChecksForAll() {
  for (const id of userIds()) {
    try { await withUser(id, () => checkReleases(false)) } catch (e) { console.error('Controllo uscite non riuscito:', e) }
  }
}

/** Every 30 seconds: reminders must arrive on time, like the exact alarms on the phone. */
export async function runJobsForAll() {
  for (const id of userIds()) await withUser(id, runJobs)
}
