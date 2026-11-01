import webpush from 'web-push'
import { getServerMeta, setServerMeta, userIds } from './accounts.ts'
import { romeClock, romeTime } from '../../shared/dates.ts'
import { evaluateFollow, evaluatePerson, followCompleted, personNoticeText } from '../../shared/follows.ts'
import { personKey } from '../../shared/model.ts'
import {
  currentUserId, db, deleteReminder, dueReminders, follows, getMeta, nothingFollowed, people, prefs, setMeta, updateFollow, updatePerson, withUser,
} from './db.ts'
import { serverTmdb, tmdbConfigured } from './tmdb.ts'

// Web Push replaces the native notifications: the server decides when to send them, like a
// WorkManager job / BGTask did on the phone.

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

/** url: where a tap on the notification opens the app (a deep link like "/?route=..."). tag: replaces older ones with the same tag. */
export type Payload = { title: string; body: string; url: string; tag: string; image?: string }

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

// --- ReleaseCheckWorker: followed titles and people ------------------------------------------

const checking = new Set<number>()

/**
 * ReleaseCheckWorker.doWork for the current account. Background runs stay silent at night (23–8,
 * Europe/Rome): the next morning run delivers what was released. Interactive runs (the user opened
 * the app or just followed something) ignore the quiet hours, like checkNow on the phone.
 */
export async function checkReleases(interactive: boolean) {
  const userId = currentUserId()
  if (checking.has(userId)) return
  const now = romeClock()
  if (!interactive && (now.hour < 8 || now.hour >= 23)) return
  if (!tmdbConfigured() || nothingFollowed()) return
  checking.add(userId)
  try {
    const today = now.date
    for (const follow of follows()) {
      if (followCompleted(follow)) continue
      try {
        const notices = evaluateFollow(follow, await serverTmdb.releaseInfo(follow.media), today)
        if (updateFollow(follow)) {
          for (const notice of notices) {
            // One notification per title and kind: a newer episode replaces the previous episode alert.
            await send({ title: notice.title, body: notice.text, url: '/?media=' + encodeURIComponent(follow.media.id), tag: `${follow.media.id}:${notice.kind}`, image: follow.media.poster })
          }
        }
      } catch (e) {
        console.warn('Controllo uscite non riuscito per', follow.media.id, (e as Error).message)
      }
    }
    const hideShows = prefs().hideShowCredits
    for (const follow of people()) {
      try {
        const credits = await serverTmdb.personCreditsJson(follow.person.id)
        const all = serverTmdb.mapPersonCredits(credits, follow.person.director, false)
        const shows = new Set<string>()
        if (hideShows) {
          for (const m of all) shows.add(m.id)
          for (const m of serverTmdb.mapPersonCredits(credits, follow.person.director, true)) shows.delete(m.id)
        }
        const fresh = evaluatePerson(follow, all, shows, today)
        if (updatePerson(follow)) {
          for (const media of fresh) {
            await send({ title: follow.person.name, body: personNoticeText(media, today), url: '/?media=' + encodeURIComponent(media.id), tag: `${personKey(follow.person)}:${media.id}`, image: media.poster })
          }
        }
      } catch (e) {
        console.warn('Controllo persona non riuscito per', follow.person.id, (e as Error).message)
      }
    }
    setMeta('last-release-check', String(Date.now()))
  } finally {
    checking.delete(userId)
  }
}

/** ReleaseCheckWorker.refreshOnLaunch: when the app opens, at most every 30 minutes. */
export function checkOnLaunch() {
  const last = Number(getMeta('last-release-check') ?? '0')
  if (Date.now() - last > 30 * 60 * 1000) void checkReleases(true).catch((e) => console.error('Controllo uscite non riuscito:', e))
}

// --- TvReminderReceiver: user-selected programme reminders ------------------------------------

/** Sends the reminders whose time has come; a reminder for a programme already over is dropped. */
export async function sendDueReminders() {
  for (const reminder of dueReminders(Date.now())) {
    deleteReminder(reminder.key)
    if (reminder.end <= Date.now()) continue
    const date = romeClock(reminder.start).date
    await send({ title: reminder.title, body: `${reminder.channel} · alle ${romeTime(reminder.start)}`, url: '/?route=guide&date=' + date, tag: 'tv:' + reminder.key })
  }
}

/** The periodic job of the current account: what ReleaseCheckWorker did every 2 hours. */
export async function runJobs() {
  try {
    const last = Number(getMeta('last-release-check') ?? '0')
    if (Date.now() - last >= 2 * 60 * 60 * 1000 - 60_000) await checkReleases(false)
  } catch (e) {
    console.error('Lavoro periodico non riuscito:', e)
  }
}

/** The same for every account. */
export async function runJobsForAll() {
  for (const id of userIds()) await withUser(id, runJobs)
}

/** Every 30 seconds: TV reminders are due to the minute, like the exact alarms on the phone. */
export async function remindersForAll() {
  for (const id of userIds()) {
    try { await withUser(id, sendDueReminders) } catch (e) { console.error('Promemoria non inviati:', e) }
  }
}
