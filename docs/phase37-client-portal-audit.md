# Phase 37.7.C.1 — Client Portal Infrastructure & Token Security Audit

**Date:** 2026-06-23  
**Status:** Read-only reconnaissance — **no application code changed**  
**Goal:** Map schema, token/session authorization, upload routing, Tab 5 shell state, and staging blueprint for the broker Client Portal control center (Tab 5).

**Prerequisite docs:** `docs/phase37-document-vault-audit.md`, `docs/phase37-macro-alignment-audit.md`, `lender-app/docs/collaboration-architecture-audit.md`.

---

## 1. Executive summary

| Finding | Detail |
|---------|--------|
| **Portal is a separate app surface** | Next.js routes under `app/portal/*` — not inside broker `AppChrome` |
| **Authorization model** | Email-scoped **`clientPortalGrants`** per pipeline file + **`clientPortalSessions`** (hashed bearer token) — **no broker account** |
| **Invite / token flow** | Broker `inviteClient` → one-time **`clientPortalMagicLinks`** → `exchangeMagicLink` → 30-day session |
| **Permission primitive** | Grant-level `view` vs `view_upload` (+ optional `grantExpiresAt`); legacy rows default to **view_upload** |
| **Upload storage** | **`clientPortalUploads`** → Convex `_storage` — **parallel silo**, **not** linked to `libraryDocuments` |
| **Tab 5 shell** | **`clientPortal`** tab = **placeholder only**; live broker UI = **`ClientPortalInviteBlock`** in quick panel |
| **Client-visible file fields** | **Redacted** via `publicPipelineView()` — no lenders, no internal notes, no funding internals beyond optional amount |
| **Messaging** | `fileMessages` with `audience: "portal"` + `PortalMessagingSection` on external file page |
| **Security layers** | SHA-256 token hashing, PBKDF2 passwords, rate limits (`portalAuthThrottle`), audit (`clientPortalAudit` + `securityAuditLog`) |

**Recommended Tab 5 strategy:** Promote **`ClientPortalInviteBlock`** into a full-width **`ClientPortalTab`** shell — unify grants, uploads inbox, requests, updates, and audit — and add an **optional bridge** from `clientPortalUploads` → `libraryDocuments` (Tab 4 vault) in a later slice.

---

## 2. Schema & access control inventory

**Source:** `lender-app/convex/schema.ts` (L2592–2767)

### 2.1 Core tables

| Table | Purpose | Key fields / indexes |
|-------|---------|----------------------|
| **`clientPortalIdentities`** | Optional password identity per `(orgScope, emailKey)` | `passwordSalt`, `passwordHash`; index `by_scope_email` |
| **`clientPortalGrants`** | **Canonical access row** — one email ↔ one pipeline file | `status` active/revoked, `permission` view/view_upload, `grantExpiresAt`, `invitedByUserKey`, `label`; indexes `by_file`, `by_email_file`, `by_scope_email` |
| **`clientPortalSessions`** | Active client sessions | `tokenHash` (never stores raw token), `grantIds[]`, `expiresAt`; index `by_tokenHash` |
| **`clientPortalMagicLinks`** | One-time invite tokens | `tokenHash`, `grantIds[]`, `expiresAt`, `usedAt`; index `by_tokenHash` |
| **`clientPortalUploads`** | Client-uploaded blobs | `grantId`, `pipelineFileId`, `storageId`, metadata; index `by_grant` |
| **`clientPortalRequests`** | Broker → client action items | `title`, optional encrypted `description`, `status` open/done |
| **`clientPortalUpdates`** | Broker → client status feed | `summary`, `detail` (plaintext) |
| **`clientPortalAudit`** | Append-only portal audit | `kind`, `actorType` client/broker/system, `pipelineFileId`, `grantId` |
| **`portalAuthThrottle`** | Rate-limit counters | Keys: `pw:{orgScope}:{emailKey}`, `magic:{tokenHash}` |
| **`securityAuditLog`** | Auth lockouts / anomalies | Separate from portal business audit |

**`orgScope`:** `organizationId` as string, or `"none"` when pipeline row has no org (legacy files).

### 2.2 Grant permission model

**File:** `convex/clientPortalShared.ts`

```
effectivePermission(grant):
  - inactive / expired → null
  - permission omitted (legacy) → "view_upload"
  - explicit "view" | "view_upload"
```

**Broker invite defaults** (`clientPortalAdmin.inviteClient`): `permission = "view_upload"`, `linkExpires = "24h"`, `grantExpires = "never"`.

There is **no per-field visibility schema** (e.g. hide lender name, hide funding amount) — visibility is coarse-grained at grant + `publicPipelineView` redaction.

---

## 3. Authorization & token routes (external user, no broker login)

### 3.1 End-to-end auth flows

```
Broker (internal)                          Client (external)
─────────────────                          ─────────────────
clientPortalAdmin.inviteClient
  → clientPortalGrants (active)
  → clientPortalMagicLinks (tokenHash)
  → email via clientPortalEmails.deliverMagicLink
  → signInUrl: {ORIGIN}/portal/magic?t={plainToken}

Client opens /portal/magic?t=...
  → clientPortal.exchangeMagicLink
  → marks magic link usedAt
  → clientPortalSessions.insert (tokenHash)
  → returns sessionToken (raw, once)

Client stores sessionToken in localStorage
  (lib/clientPortalSession.ts — key: dlc_client_portal_session)

Subsequent API calls pass sessionToken arg
  → authorizeSession: sha256(sessionToken) → by_tokenHash lookup
  → validates grantIds still active + email/orgScope match
```

**Alternate path:** `loginWithPassword` using `clientPortalIdentities` + grants for `(orgScope, emailKey)`.

**Session lifetime:** 30 days (`SESSION_MS` in `clientPortal.ts`).  
**Concurrent sessions:** max 8 per identity (`MAX_CONCURRENT_PORTAL_SESSIONS`); oldest pruned.

### 3.2 Token security properties

| Mechanism | Implementation |
|-----------|----------------|
| Magic link token | `randomHex(24)` plain → stored as **SHA-256 hash only** |
| Session token | `randomHex(32)` plain → **SHA-256 hash** in DB |
| Magic link reuse | Blocked via `usedAt` + failure throttle |
| Magic link TTL | Broker-selectable: 1h / 24h / 7d / 30d |
| Password storage | PBKDF2-SHA256, 120k iterations (`clientPortalCrypto.ts`) |
| Brute force | 8 password fails → 15 min lock; 24 magic fails → 15 min lock |
| Password reset side effect | `setPassword` invalidates other sessions (keeps current) |
| Sensitive request notes | Optional field encryption via `portalFieldCrypto` (seal/open) |

### 3.3 External route map

| Route | Role |
|-------|------|
| `/portal/login` | Email + password sign-in (org scope remembered) |
| `/portal/magic?t=` | One-time magic link exchange |
| `/portal/files` | List granted pipeline files (`listMyFiles`) |
| `/portal/file/[fileId]` | File bundle: updates, requests, uploads, messaging |
| `/portal` | Portal landing |

**Env:** `CLIENT_PORTAL_ORIGIN` — base URL embedded in invite links (default `http://127.0.0.1:3004`).

**Client session storage:** Browser `localStorage` — not HttpOnly cookies; XSS on portal origin would expose session token.

---

## 4. Convex API surface

### 4.1 Client-facing (`convex/clientPortal.ts`)

| Export | Type | Purpose |
|--------|------|---------|
| `listScopesForEmail` | query | Org picker at login |
| `listMyFiles` | query | Granted files (redacted view) |
| `getFileBundle` | query | Updates, requests, uploads, grant meta |
| `getUploadDownloadUrl` | query | Signed URL for client upload blob |
| `exchangeMagicLink` | mutation | Magic → session |
| `loginWithPassword` | mutation | Password → session |
| `setPassword` | mutation | Identity password setup |
| `logout` | mutation | Session delete |
| `logFileView` | mutation | Audit: `portal_file_view` |
| `generateUploadUrl` | mutation | Convex storage upload URL (requires `view_upload`); audits `upload_url_issued` |
| `attachUpload` | mutation | Insert `clientPortalUploads` row (**no audit event today**) |
| `completeClientRequest` | mutation | Client marks request done |
| *(file messaging)* | query/mutation | Portal-visible threads (`audience: "portal"`) |

### 4.2 Broker-facing (`convex/clientPortalAdmin.ts`)

| Export | Type | Purpose |
|--------|------|---------|
| `inviteClient` | mutation | Grant + magic link + optional email |
| `revokeGrant` | mutation | Revoke + session invalidation |
| `listAccessForFile` | query | Active grants (requires pipeline edit access) |
| `listAuditForFile` | query | Portal audit trail |
| `postClientUpdate` | mutation | Status update visible to client |
| `createClientRequest` | mutation | Client action request |

### 4.3 What the client sees (`publicPipelineView`)

**Fields exposed:** `_id`, `fileName`, `status`, `propertyAddress`, `scenario`, optional `fundingAmount`, `updatedAt`.

**Not exposed:** Lenders, internal notes, tasks, contacts, deal JSON, document vault, broker-only messaging.

**Client file page sections** (`app/portal/file/[fileId]/page.tsx`):

1. Redacted file header (stage, property, scenario)
2. **Updates from your team** (`clientPortalUpdates`)
3. **Portal messaging** (`PortalMessagingSection`)
4. **Requested actions** (`clientPortalRequests`, open only)
5. **Your documents** (upload UI + `clientPortalUploads` list)

There is **no milestone timeline**, **no lender roster**, and **no broker internal notes** on the external surface today.

---

## 5. Document upload routing & library integration

### 5.1 Client upload pipeline

```
Portal file page
  → clientPortal.generateUploadUrl (session + grant + view_upload check)
  → postFileToConvexUploadUrl (client, max 25 MB)
  → clientPortal.attachUpload
  → INSERT clientPortalUploads { grantId, pipelineFileId, storageId, ... }
```

**Server cap:** 25 MB (`MAX_UPLOAD_BYTES` in `clientPortal.ts`) — stricter than broker library (80 MB).

### 5.2 Relationship to `libraryDocuments` (Document Vault / Tab 4)

| Aspect | `clientPortalUploads` | `libraryDocuments` |
|--------|----------------------|-------------------|
| Versioning | No | Yes (`libraryDocumentVersions`) |
| Category / tax year | No | Yes (`libraryDocumentLinks` metadata) |
| Broker Tab 4 vault | **Not listed** | Primary surface |
| Broker quick panel | **Not listed** | `LibraryDocumentsPanel` |
| Link to pipeline | Direct `pipelineFileId` FK | Via `libraryDocumentLinks` |
| Promotion path | **None in codebase today** | N/A |

**Conclusion:** Portal uploads and Document Vault are **intentionally separate stores** today. A consumer upload does **not** automatically create a `libraryDocuments` row or appear in Tab 4 without a future **ingestion bridge** mutation.

### 5.3 Broker visibility of portal uploads

- **No** dedicated broker UI query for `clientPortalUploads` in pipeline workspace (Tab 5 or quick panel).
- **`ClientPortalInviteBlock`** shows grants + audit trail only — not client upload inventory.
- **Audit gap:** UI maps `upload_committed` in `auditKindLabel`, but **`attachUpload` does not call `appendPortalAudit`** — only `upload_url_issued` is logged on `generateUploadUrl`.

### 5.4 Proposed bridge (future — not implemented)

```
clientPortalAdmin.promoteUploadToLibrary (hypothetical)
  → read clientPortalUploads row + storageId
  → libraryDocuments.createVersionFromStorage (or equivalent)
  → libraryDocumentLinks { pipelineFileId, documentCategory: "client_submitted" }
  → optional: mark upload promotedAt / libraryDocumentId on portal row
```

This would unify broker Document Vault (Tab 4) with client-submitted files without exposing internal vault rows to the portal client.

---

## 6. Tab 5 shell state & broker UI today

### 6.1 File workspace tab order

**File:** `components/pipeline/FileWorkspaceTabShell.tsx`

| Index | Tab key | Label | Panel state |
|-------|---------|-------|-------------|
| 0 | `overview` | File Overview | Wired (`overviewPanel`) |
| 1 | `dealInfo` | Deal Info | Wired (`dealInfoPanel`) |
| 2 | `dealWorkspace` | Deal Workspace | Wired (`dealWorkspacePanel`) |
| 3 | `documents` | Documents | Wired (`documentsPanel` → `DocumentVaultTab`) |
| **4** | **`clientPortal`** | **Client Portal** | **`TabPlaceholder` only** |
| 5 | `settings` | Settings | Placeholder |

**Missing today:**

- No `ClientPortalTab.tsx` under `components/pipeline/tabs/`
- No `clientPortalPanel` prop on `FileWorkspaceTabShell` (unlike `documentsPanel`)

### 6.2 Live broker portal UX (quick panel)

**File:** `components/PipelineFileWorkspace.tsx`

- Section id: `quick-panel-client-portal`
- Component: **`ClientPortalInviteBlock`**
- Capabilities: invite email, permission (view / view + upload), link TTL, grant expiry, revoke, post updates, create requests, audit log

This is the **functional broker control center** today — buried in the collapsed quick panel, not Tab 5.

---

## 7. Supporting modules (reference map)

| Path | Role |
|------|------|
| `convex/clientPortal.ts` | Client queries/mutations, session auth, uploads |
| `convex/clientPortalAdmin.ts` | Broker invite, revoke, updates, requests |
| `convex/clientPortalShared.ts` | `isGrantUsable`, `effectivePermission` |
| `convex/clientPortalAudit.ts` | `appendPortalAudit` helper |
| `convex/clientPortalCrypto.ts` | PBKDF2, SHA-256, random tokens |
| `convex/portalAuthSecurity.ts` | Throttle + session budget enforcement |
| `convex/portalFieldCrypto.ts` | Seal/open optional request descriptions |
| `convex/clientPortalEmails.ts` | Magic link email delivery |
| `lib/clientPortalSession.ts` | localStorage session read/write/clear |
| `components/ClientPortalInviteBlock.tsx` | Broker invite + grant management UI |
| `app/portal/layout.tsx` | External portal chrome (header, footer, logout) |
| `app/portal/file/[fileId]/page.tsx` | Client file workspace |

---

## 8. Development staging blueprint

### Phase 37.7.C.2 — Tab 5 shell mount (UI only)

1. Create `components/pipeline/tabs/ClientPortalTab.tsx` — thin wrapper around extracted invite workspace.
2. Add `clientPortalPanel?: ReactNode` to `FileWorkspaceTabShell` (mirror `documentsPanel` pattern).
3. Wire `PipelineFileWorkspace` → pass `<ClientPortalTab pipelineFileId={...} memberUserKey={...} />`.
4. Keep quick panel section **or** deprecate with redirect note once Tab 5 is default (product choice).

**Constraints:** Single scroll owner on pipeline file route; no nested full-page scrollports.

### Phase 37.7.C.3 — Broker uploads inbox

1. Add `clientPortalAdmin.listUploadsForFile` query (by `pipelineFileId`, join grant email).
2. Tab 5 section: **Client submissions** table with download + promote action.
3. Fix audit: emit `upload_committed` from `attachUpload`.

### Phase 37.7.C.4 — Vault bridge (optional product slice)

1. Mutation to promote `clientPortalUploads` → `libraryDocuments` + link.
2. Tab 4 badge: `source: portal` on promoted rows.
3. Governance: tenant isolation via pipeline `organizationId`.

### Phase 37.7.C.5 — Visibility policy (if product requires granular toggles)

1. Extend `clientPortalGrants` with `visibilityPolicy` JSON or explicit flags.
2. Extend `publicPipelineView` + client page to respect flags.
3. Invite UI: checklist at link generation (see §9).

### Phase 37.7.C.6 — QA & deploy

- `npm run qa:governance` from `lender-app/`
- Manual: invite flow, magic link, upload, revoke, Tab 5 scroll on mobile
- `npm run deploy:prod` (+ `convex:deploy:prod` if schema/API changes)

---

## 9. Design philosophy — broker control center visibility

**Question:** On link generation, should the client immediately see a broad “all-access” milestone view, or should the broker explicitly toggle individual tracking elements (lender name, internal notes, etc.)?

### Current behavior (as-built)

The system already follows a **safe-by-default, broker-curated** model — not broad all-access:

| Layer | Behavior |
|-------|----------|
| **Grant permission** | Only `view` vs `view_upload` — not a field-level ACL |
| **Pipeline redaction** | `publicPipelineView` strips lenders, tasks, contacts, deal JSON |
| **Status narrative** | Client sees **broker-authored** `clientPortalUpdates` — not raw pipeline milestones |
| **Action items** | Broker creates `clientPortalRequests` explicitly |
| **Messaging** | Separate `fileMessages` thread with `audience: "portal"` |
| **Documents** | Client sees **their own uploads** only — not the broker Document Vault |

Generating a link does **not** open internal milestones, lender names, or internal notes. The client gets a **minimal file summary** plus whatever the broker **posts** (updates/requests).

### Recommendation: **opt-in visibility, safe defaults**

Prefer **explicit broker toggles at invite time** over an “all milestones visible” default:

1. **Trust & compliance** — mortgage files contain lender identities, pricing, and internal commentary that should never leak by default.
2. **Aligns with existing architecture** — grants + redacted view + curated updates already encode “share deliberately.”
3. **Incremental product path** — add a `visibilityPolicy` on grants (e.g. show funding amount, show property only, show custom milestone labels) rather than flipping a single “full access” switch.

**Suggested default on new invite:**

- View + upload (or view-only for sensitive phases)
- Pipeline stage + property visible (current `publicPipelineView`)
- **Funding amount: off** until broker opts in
- **No lender names** (keep absent until explicit product adds sanitized lender status)
- Broker must **post an initial update** or **create requests** — empty portal is acceptable and safer than auto-syncing internal task state

**Avoid:** Auto-hydrating Tab 5 / portal client view from internal task milestones or lender block without a broker preview step.

---

## 10. Gaps & risks (audit findings)

| ID | Severity | Finding |
|----|----------|---------|
| G-1 | Medium | Portal uploads siloed from Document Vault — broker may miss client files |
| G-2 | Low | `upload_committed` audit label exists but event not emitted |
| G-3 | Low | Session token in `localStorage` — standard SPA tradeoff; consider HttpOnly cookie hardening later |
| G-4 | Info | Tab 5 placeholder while functional UI lives in quick panel — discoverability gap |
| G-5 | Info | No per-field visibility toggles — only grant-level permission + server redaction |

---

## 11. Verification checklist (read-only pass)

- [x] Schema tables located in `convex/schema.ts`
- [x] Token generation: magic link + session in `clientPortal.ts` / `clientPortalCrypto.ts`
- [x] External auth path documented (no broker login)
- [x] Upload routing traced to `clientPortalUploads` (not `libraryDocuments`)
- [x] Tab 5 = placeholder; `ClientPortalInviteBlock` = live broker UI
- [x] Staging blueprint drafted for Tab 5 promotion

**No code modified in this phase.**
