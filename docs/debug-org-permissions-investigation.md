# Org permissions (`effectivePermissions`) — investigation guide

This document maps **where failures surface**, how to **collect evidence**, and what the codebase allows to go wrong. It is meant to be filled in with your **Convex dashboard logs** and **browser console** output after a reproduction.

## 1. Where the UI error comes from

- The title **“Application error”** is rendered by Next.js [`app/global-error.tsx`](../lender-app/app/global-error.tsx): any **uncaught** error in the root layout tree (including under `ConvexProvider`) can reach this boundary.
- The message **`[CONVEX Q(organizations:effectivePermissions)] … Server Error`** is produced by the **Convex React client** when a **query subscription** receives a **function execution error** from the backend (not a validation-only rejection of args before the handler runs — those are usually worded differently).

So the classified failure domain is: **Convex query execution (backend UDF) + reactive subscription**, surfaced through **React** as a thrown error **unless** the client uses `throwOnError: false` for that query.

## 2. Runtime path (effective permissions)

**Browser**

1. [`lib/useOrgPermissions.ts`](../lender-app/lib/useOrgPermissions.ts) resolves `activeOrganizationId` in priority order:
   - Host cookie `lender_host_org` ([`lib/hostOrgCookie.ts`](../lender-app/lib/hostOrgCookie.ts))
   - `localStorage` key `lender.activeOrganizationId` ([`lib/activeOrganizationId.ts`](../lender-app/lib/activeOrganizationId.ts))
   - Cookie session viewer `orgId` ([`lib/sessionContext.tsx`](../lender-app/lib/sessionContext.tsx))
2. `userKey` comes from [`lib/useActorUserKey.ts`](../lender-app/lib/useActorUserKey.ts) (session `userKey`, else preferences `accountId`).
3. The app subscribes to **`organizations.effectivePermissions`** via [`lib/useEffectivePermissionsQuery.ts`](../lender-app/lib/useEffectivePermissionsQuery.ts).

**Convex**

4. [`convex/organizations.ts`](../lender-app/convex/organizations.ts) `effectivePermissions` calls:
   - [`resolveMemberUserKey`](../lender-app/convex/organizationAccess.ts) (may **throw** if Convex Auth returns an identity with an **empty** `subject`)
   - [`resolveEffectivePermissionStrings`](../lender-app/convex/organizationRbac.ts) (loads `organizationMembers` + optional `organizationRoles`)

**Not membership-related outcomes**

- If there is **no** membership row for `(organizationId, userKey)`, the query returns **`null`** (not an error). That leads to `can()` denying permissions in the UI, **without** a server error.

## 3. Instrumentation added (how to use it)

### 3a. Convex (always on for failures)

On **any throw** inside:

- `organizations.effectivePermissions`
- `resolveEffectivePermissionStrings`

…the server emits a single JSON line prefixed with **`ORG_PERM_FAIL`** (search in Convex **Logs** for that string).  
JWT empty-subject throws log as **`ORG_PERM_FAIL`** with stage `resolveMemberUserKey.emptyJwtSubject`.

### 3b. Convex (optional step-by-step)

Set Convex environment variable **`ORG_PERM_TELEMETRY=1`** (project → Settings → Environment Variables), redeploy functions.  
Then successful paths also emit **`ORG_PERM_TRACE`** lines (membership row counts, canonical row ids, etc.). Turn this **off** after debugging (noise + cost).

### 3c. Browser console

[`useEffectivePermissionsQuery`](../lender-app/lib/useEffectivePermissionsQuery.ts) calls Convex with **`throwOnError: false`**, so a failing query **does not** need to crash the app; it logs:

`[org-rbac] organizations.effectivePermissions failed`

plus a **runtime snapshot** from [`lib/orgRbacRuntimeSnapshot ts`](../lender-app/lib/orgRbacRuntimeSnapshot.ts):

- `nextPublicConvexUrl` / `convexHost`
- `storedActiveOrganizationId`, `hostMappedOrgId`, `viewerOrgId`
- `origin` / `pathname`
- error `message` / `stack`

Build with **`NEXT_PUBLIC_ORG_RBAC_DEBUG=1`** to also expose `window.__lenderOrgRbacDebug.snapshot()` and `.clearStoredActiveOrg()`.

## 4. Environment / deployment consistency checklist

| Check | Where |
|--------|--------|
| `NEXT_PUBLIC_CONVEX_URL` in the **built** app | Browser snapshot field `nextPublicConvexUrl`; or Vercel env + **uncached** production deploy |
| Org id sources agree | Compare `storedActiveOrganizationId`, `viewerOrgId`, `hostMappedOrgId` in the console snapshot |
| Convex deployment | Dashboard URL host must match `*.convex.cloud` from `NEXT_PUBLIC_CONVEX_URL` |
| External auth vs Convex org | Session carries `organizationId` ([`sessionAuth`](../lender-app/lib/sessionAuth.ts)); **`organizationId` in the cookie must be a Convex `organizations` id** expected by your data |

**Why incognito / hard refresh may not help**

- They clear **browser cache** and **local** storage from other profiles, but **do not** change: the **Vercel-built** `NEXT_PUBLIC_CONVEX_URL`, the **Convex deployment** your build points at, or a **bad org id** still issued fresh in the **session cookie** after login.
- If the failure is a **server exception** inside the query, it reproduces whenever the **same args** hit the **same** Convex backend.

## 5. Failure chain template (fill in after repro)

Paste your values here:

- **Request id** (from error toast / Convex logs):
- **`ORG_PERM_FAIL` stage** (from Convex logs):
- **Error message + stack** (from Convex log JSON):
- **Browser log** (`[org-rbac] …` object):
- **`membershipRowCount`** from `ORG_PERM_TRACE` (if telemetry on):

## 6. Architectural note: why “wrong org id” is possible

`localStorage` accepts **any** string as `Id<"organizations">` ([`activeOrganizationId.ts`](../lender-app/lib/activeOrganizationId.ts)). The Convex validator only checks shape when the parent table is `organizations`; **stale ids from another deployment** or corrupted values can still be sent to the server. The query usually returns **`null`** (no rows) rather than throwing — **unless** something else in the handler throws (e.g. auth resolution).

## 7. Prior `.unique()` duplicate-row fix — relationship to this report

Duplicate `organizationMembers` rows for the same `(organizationId, userKey)` caused **Convex** `.unique()` to **throw** (server error). That was one **proven** failure mode. If **`ORG_PERM_FAIL`** / browser logs show a **different** stage or message after the instrumentation above, use this doc to record the **new** root cause rather than assuming duplicates.

## 8. Next step after evidence

Only after **`ORG_PERM_FAIL`** + browser snapshot + (optional) traces are captured:

1. Classify: **auth (`resolveMemberUserKey`)**, **data (membership/roles)**, **deployment mismatch**, or **client subscription**.
2. Implement a **single** fix aligned with that evidence (avoid unrelated query churn).
