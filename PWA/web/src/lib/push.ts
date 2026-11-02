import { api } from './api.ts'

// The native notifications (followed releases, TV reminders) arrive as Web Push from the server.

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext
}

function keyBytes(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** ReleaseCheckWorker.notificationsAllowed: permission given and this device subscribed. */
export async function notificationsAllowed(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    return (await registration?.pushManager.getSubscription()) != null
  } catch {
    return false
  }
}

/** Asks for permission and subscribes this device. Returns false when notifications can't arrive. */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  try {
    const registration = await navigator.serviceWorker.ready
    const { key } = await api<{ key: string }>('/api/push/key')
    const subscription = (await registration.pushManager.getSubscription()) ??
      await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource })
    await api('/api/push/subscribe', { method: 'POST', json: { subscription: subscription.toJSON(), reminders: true } })
    return true
  } catch {
    return false
  }
}

/** Keeps the server's copy of this device's subscription current (the browser can rotate it). */
export async function syncPush() {
  if (!(await notificationsAllowed())) return
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) await api('/api/push/subscribe', { method: 'POST', json: { subscription: subscription.toJSON(), reminders: true } })
  } catch { /* offline */ }
}

export async function disablePush() {
  if (!pushSupported()) return
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await api('/api/push/unsubscribe', { method: 'POST', json: { endpoint: subscription.endpoint } })
      await subscription.unsubscribe()
    }
  } catch { /* already gone */ }
}
