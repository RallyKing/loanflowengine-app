/**
 * Client helpers for lean Web Push subscribe / unsubscribe.
 * Stores the PushSubscription once (not on an interval). Never polls Convex for push.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

export function webPushClientSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function vapidPublicKeyFromEnv(): string {
  return (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
}

export type PushSubscriptionKeys = {
  endpoint: string;
  keysP256dh: string;
  keysAuth: string;
  expirationTime: number | null;
};

function subscriptionToKeys(
  sub: PushSubscription,
): PushSubscriptionKeys | null {
  const json = sub.toJSON();
  const endpoint = json.endpoint?.trim();
  const p256dh = json.keys?.p256dh?.trim();
  const auth = json.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) return null;
  return {
    endpoint,
    keysP256dh: p256dh,
    keysAuth: auth,
    expirationTime:
      typeof json.expirationTime === "number" ? json.expirationTime : null,
  };
}

/** Ensure `/sw.js` is registered (production gate matches PwaServiceWorkerRegistration). */
export async function ensurePushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!webPushClientSupported()) return null;
  if (process.env.NODE_ENV !== "production") {
    /* Allow explicit opt-in for local HTTPS / preview testing. */
    if (process.env.NEXT_PUBLIC_WEB_PUSH_DEV !== "1") return null;
  }
  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function getCurrentPushSubscriptionKeys(): Promise<PushSubscriptionKeys | null> {
  const reg = await ensurePushServiceWorker();
  if (!reg) return null;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  return subscriptionToKeys(sub);
}

/**
 * Request permission (if needed) and subscribe with VAPID public key.
 * Returns null when unsupported, denied, or misconfigured.
 */
export async function subscribeThisDeviceToWebPush(): Promise<PushSubscriptionKeys | null> {
  const vapid = vapidPublicKeyFromEnv();
  if (!vapid) return null;
  const reg = await ensurePushServiceWorker();
  if (!reg) return null;

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return null;

  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    const keys = subscriptionToKeys(existing);
    if (keys) return keys;
  }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
  });
  return subscriptionToKeys(sub);
}

/** Unsubscribe this browser endpoint (does not touch other devices). */
export async function unsubscribeThisDeviceFromWebPush(): Promise<string | null> {
  const reg = await ensurePushServiceWorker();
  if (!reg) return null;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
