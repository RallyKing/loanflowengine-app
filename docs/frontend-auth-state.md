# Frontend authentication state

This document describes the workspace shell’s **auth state machine**, boundaries, and patterns for safe Convex subscriptions. It complements `docs/internal-auth-architecture.md` (server/session cookies).

## State machine

`AuthStateProvider` (`lib/auth/authStateContext.tsx`) derives a single **`AuthMachineState`** from:

- **Cookie session** — `SessionProvider` / `useViewer()` (SSR-aligned).
- **Client hydration** — `useClientHydrated()` so `localStorage` / `document.cookie` reads do not run on the server path (avoids hydration mismatch).
- **Convex WebSocket** — `useLiveConnection()` phases and retry counts.
- **Browser online** — `useBrowserOnline()`.
- **Explicit invalidation** — `emitSessionInvalid("expired" | "revoked")` (`lib/auth/sessionInvalidation.ts`).

### States

| State | Typical meaning |
| --- | --- |
| `loading` | Signed-in viewer present but client hydration not finished (org/storage not final yet). |
| `authenticated` | Viewer + Convex connected. |
| `unauthenticated` | No viewer (public / signed-out layout). |
| `expired` | Soft session invalid — dispatch `emitSessionInvalid("expired")` (e.g. after API signals expiry). |
| `revoked` | Session ended — `emitSessionInvalid("revoked")`. |
| `reconnecting` | Convex previously connected; socket reconnecting (banner, app still mounted). |
| `degraded` | Offline or excessive reconnect failures while online — **limited live data**; UI should not white-screen. |

Invalidation **clears** `lender.activeOrganizationId` in `localStorage` to avoid stale org persistence across accounts.

## Provider placement

- Under **`ConvexClientProvider`** (requires `LiveConnectionProvider` for `useLiveConnection`).
- Under **`SessionProvider`** (requires `useViewer`).

In `app/layout.tsx`, authenticated and unauthenticated Convex branches wrap with `AuthStateProvider` + `SessionBoundary`. The signed-in branch also wraps **`AuthBoundary`** around `AppChrome`.

Routes **without** Convex (misconfigured URL) do not mount `AuthStateProvider`; `useAuthStateOptional()` returns `null` and compatibility hooks fall back to legacy behavior.

## Context API

- `useAuthState()` — throws if provider missing (use only under Convex + provider).
- `useAuthStateOptional()` — `null` outside provider; used by hooks that must work in all shells.

`useAuth()` / `useUser()` / `useOrganization()` (`lib/sessionUiClient.tsx`) integrate optional auth state:

- `isLoaded` waits for hydration when the machine is present.
- `isSignedIn` is false for `expired` / `revoked` / `unauthenticated`, but stays true during `loading` if a viewer exists (cookie still authoritative until client finishes).

## Org resolution & stale storage

`useOrgPermissions` (`lib/useOrgPermissions.ts`):

- Initial **`activeOrganizationId`** is **`parseOrganizationId(viewer.organizationId)`** so server and first client frame match.
- After mount, resolution follows host cookie → `localStorage` → viewer default (existing priority).
- On **`userKey` change**, stored active org is reset to the new viewer’s default org so a different account does not keep the prior tenant’s id.

`useEffectivePermissionsQuery` **skips** Convex RBAC when auth state is `expired`, `revoked`, or `unauthenticated`, preventing throw/retry loops against bad scope.

## Boundaries

| Component | Role |
| --- | --- |
| **`AuthBoundary`** | Blocks or degrades the tree for invalid/unauthenticated sessions; banners for reconnecting/degraded; optional `requireConvex={false}` for special trees. |
| **`SessionBoundary`** | Delays children until `clientHydrated` when a viewer exists (storage-safe). |
| **`OrgBoundary`** | Requires `activeOrganizationId` from `useOrgPermissions`. |
| **`PermissionBoundary`** | Wraps `can(permission)` with non-throwing fallback UI. |

## Retry & errors

- **`AuthRetryBoundary`** — class boundary; resets when `recoverKey` (e.g. route) or `authRecoverKey` (auth state) changes. Wraps **`PageErrorBoundary`** in `AppChrome` so transient auth/connectivity churn can recover without a full reload.
- **`AuthSuspenseFallback`** — loading / reconnecting / degraded copy for `React.Suspense` or explicit placeholders.

## Safe Convex queries

See `lib/auth/safeConvexQuery.ts`. Prefer **`useQuery` object form** with **`throwOnError: false`** and handle `pending` / `error` / `success` so subscriptions do not surface as uncaught render errors.

## Offline recovery

- **Auth machine**: `degraded` when offline or retries exceed `AUTH_DEGRADED_RETRY_THRESHOLD` (`lib/auth/authTypes.ts`).
- **Product**: existing `OfflineSyncBanner`, Convex reconnection, and org scope banner remain the operational UX; auth state aligns messaging with connectivity.

## Emitting session invalid from client code

After confirming the server revoked or expired the session (e.g. 401 from an authenticated API route), call:

```ts
import { emitSessionInvalid } from "@/lib/auth/sessionInvalidation";

emitSessionInvalid("expired");
```

Avoid calling this in a tight loop; pair with user-visible copy or a single redirect.

## Files

| Path | Purpose |
| --- | --- |
| `lib/auth/authTypes.ts` | State union + degraded threshold |
| `lib/auth/deriveAuthState.ts` | Pure derivation |
| `lib/auth/authStateContext.tsx` | Provider + hooks |
| `lib/auth/clientHydration.ts` | Hydration gate |
| `lib/auth/sessionInvalidation.ts` | Browser events |
| `lib/auth/safeConvexQuery.ts` | Query pattern notes |
| `components/auth/*` | Boundaries, shells, fallbacks |
