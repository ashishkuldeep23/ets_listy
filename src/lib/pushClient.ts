// Browser side of Web Push: asks permission and registers this device for my
// reminders. Needs the service worker, which only runs in a production build.

import { apiFetch } from "@/lib/apiClient";
import type { Result } from "@/types";

/** The VAPID public key is base64url text; the browser wants its bytes. */
export function vapidKeyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=");
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

/**
 * Turns notifications on for this device (asking permission if needed) and
 * tells the server, also when they were on already: this device may have been
 * used by someone else before. The error says what the person can do about it.
 */
export async function enablePush(): Promise<Result<true>> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return { ok: false, error: "Notifications aren't set up on this server yet." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return {
      ok: false,
      error: isIos()
        ? "On iPhone, add Listy to your Home Screen first (Share → Add to Home Screen), then set the reminder from there."
        : "This browser can't show notifications.",
    };
  }
  if (!(await navigator.serviceWorker.getRegistration())) {
    return { ok: false, error: "Notifications aren't available here yet. Reload the page and try again." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Notifications are blocked for Listy. Allow them in your browser or phone settings." };
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(key) }));
    await apiFetch("/api/push/subscription", { method: "POST", body: JSON.stringify(subscription) });
    return { ok: true, value: true };
  } catch (err) {
    console.error("Turning on notifications failed", err);
    return { ok: false, error: "Couldn't turn on notifications. Please try again." };
  }
}

/** On logout: the next person on this device must not get my reminders. Call while still logged in. */
export async function disablePush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await apiFetch("/api/push/subscription", { method: "DELETE", body: JSON.stringify({ endpoint }) });
}
