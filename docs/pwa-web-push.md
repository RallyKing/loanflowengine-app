# Lean PWA Web Push (phone notifications)

Event-driven browser **Web Push** for Direct Lending Connection (`lender-app`). Delivery uses FCM / Mozilla / Apple push networks — **not** Convex as the transport. Convex only stores subscriptions and sends once per real notification event.

## Hard constraints (honored)

- No polling Convex from the service worker or client for push.
- No cron that fans out to all users every minute.
- Cap: dedupe via `userNotifications.pushDispatchedAt`, skip when no subscription, prune **410/404** endpoints, small send concurrency (3).
- In-app Alerts bell is unchanged — push extends the same `dispatchUserNotification` path.

## What ships (phone push)

Push is scheduled only for:

1. **`document_activity`** — client uploaded docs to a Document Vault file task (`recordClientVaultUpload` → `notifyPipelineBrokers` → `dispatchUserNotification`)

**Recipient rule:** Vault file tasks do **not** have a broker `assigneeUserKey`. Registry fields (`assignedContactId` / `assignedClientId` / `assignedLenderId`) identify the *client-side* assignee, not a broker phone. Broker notification goes to the pipeline file’s **`ownerUserKey`** (same as in-app Alerts for vault uploads today).

Settings **Send test notification** bypasses the category allowlist and does not insert a `userNotifications` row.

Task assignment / ownership assignment change remain **in-app only** (not phone push).

To add another category later:

1. Add the category to `WEB_PUSH_CATEGORIES` in `lender-app/convex/webPushPayload.ts`.
2. Ensure the product event already calls `dispatchUserNotification` (preferred) so push piggybacks for free.
3. Optionally document the new category in Settings copy.

## Architecture

```
Event mutation → dispatchUserNotification (insert userNotifications)
              → scheduler.runAfter(0, webPushActions.trySendWebPush)
              → web-push library → browser push network → public/sw.js (push + notificationclick)
```

| Piece | Path |
|--------|------|
| Schema | `convex/schema.ts` → `pushSubscriptions` |
| Subscribe CRUD | `convex/pushSubscriptions.ts` |
| Send action (`"use node"`) | `convex/webPushActions.ts` |
| Allowlist + payload | `convex/webPushPayload.ts` |
| Hook | `convex/notifications.ts` → `dispatchUserNotification` |
| Client upload path | `convex/documentVaultActivity.ts` → `recordClientVaultUpload` |
| Service worker | `public/sw.js` |
| Client subscribe | `lib/webPush/clientSubscribe.ts` |
| Settings toggle | `components/PushNotificationDeviceToggle.tsx` |

## Generate VAPID keys

From `lender-app/`:

```bash
npx web-push generate-vapid-keys
```

You get a **public** and **private** key. Keep the private key secret.

Choose a contact subject (mailto or HTTPS URL), e.g. `mailto:ops@yourdomain.com`.

## Environment variables

### Convex deployment (send path)

Set on the **Convex** deployment (Dashboard → Settings → Environment Variables, or CLI):

| Variable | Purpose |
|----------|---------|
| `VAPID_PUBLIC_KEY` | Same public key as client |
| `VAPID_PRIVATE_KEY` | Server-only signing key |
| `VAPID_SUBJECT` | `mailto:…` or `https://…` contact URI |

After Convex code changes: `npm run convex:deploy:prod` (production) or keep `npx convex dev` locally.

### Vercel / Next.js (subscribe path)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key for `PushManager.subscribe` |
| `NEXT_PUBLIC_WEB_PUSH_DEV` | Optional `1` to register SW outside production (local HTTPS / preview) |

Redeploy the Next app after setting public env vars (`npm run deploy:prod` per deployment rules).

## Enable on a phone (Joshua)

### Android Chrome

1. Open the production app over HTTPS.
2. Install / Add to Home Screen (optional but recommended).
3. Settings → Notifications → **Enable push on this device**.
4. Accept the browser permission prompt.
5. Have a client upload a document to a vault task on a file you own — phone should show a system notification.

### iOS Safari (16.4+)

1. Open the site in **Safari** (not an in-app browser).
2. Share → **Add to Home Screen** (must run as installed PWA / standalone).
3. Open the icon from the home screen.
4. Settings → Notifications → **Enable push on this device**.
5. Grant permission when prompted.

iOS will **not** deliver Web Push from a normal Safari tab — Home Screen install is required.

## Manual test notes (PR)

1. Set VAPID on Convex + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` on the web deploy.
2. Production (or preview with HTTPS): enable toggle once → one `pushSubscriptions` row (check Convex dashboard). Re-toggling on should upsert the same endpoint, not spam rows on an interval.
3. Client portal/vault upload on a file owned by the subscribed user → `document_activity` notification → `trySendWebPush` runs once; `pushDispatchedAt` set on the notification row.
4. Task assignment should **not** schedule Web Push.
5. Settings **Send test notification** still works (bypasses allowlist).
6. Confirm **no** new Convex cron for push (only existing `deadlineDigest` remains).
7. Revoke / expire a subscription (or mock 410) → endpoint row deleted on next send attempt.

## Out of scope

- Mentions, deadlines, comments, broker review, lender room access
- SMS / email channels (email already exists separately)
- Replacing Product Updates / Alerts UI
- Marketing blast pushes
