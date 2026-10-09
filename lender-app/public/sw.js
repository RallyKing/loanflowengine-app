/**
 * Minimal service worker — PWA installability + Web Push handlers.
 * Network-first fetch (no offline cache). Push delivery uses browser push
 * networks; this worker never polls Convex.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

/**
 * @param {unknown} data
 * @returns {{ title: string; body: string; url: string; tag: string }}
 */
function parsePushPayload(data) {
  const fallback = {
    title: "Direct Lending Connection",
    body: "You have a new notification",
    url: "/",
    tag: "dlc-push",
  };
  if (!data || typeof data !== "object") return fallback;
  const o = /** @type {Record<string, unknown>} */ (data);
  return {
    title:
      typeof o.title === "string" && o.title.trim()
        ? o.title.trim().slice(0, 120)
        : fallback.title,
    body:
      typeof o.body === "string" && o.body.trim()
        ? o.body.trim().slice(0, 240)
        : fallback.body,
    url:
      typeof o.url === "string" && o.url.startsWith("/")
        ? o.url
        : fallback.url,
    tag:
      typeof o.tag === "string" && o.tag.trim()
        ? o.tag.trim().slice(0, 120)
        : fallback.tag,
  };
}

self.addEventListener("push", (event) => {
  let parsed = parsePushPayload(null);
  try {
    if (event.data) {
      parsed = parsePushPayload(event.data.json());
    }
  } catch {
    try {
      const text = event.data ? event.data.text() : "";
      parsed = parsePushPayload(JSON.parse(text));
    } catch {
      /* keep fallback */
    }
  }

  event.waitUntil(
    self.registration.showNotification(parsed.title, {
      body: parsed.body,
      tag: parsed.tag,
      data: { url: parsed.url },
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw =
    event.notification.data &&
    typeof event.notification.data === "object" &&
    "url" in event.notification.data
      ? String(/** @type {{ url?: string }} */ (event.notification.data).url || "/")
      : "/";
  const path = raw.startsWith("/") ? raw : "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
            try {
              await client.navigate(path);
              return;
            } catch {
              /* fall through to openWindow */
            }
          }
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(path);
      }
    })(),
  );
});
