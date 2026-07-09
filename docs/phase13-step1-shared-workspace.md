# Phase 13.1 — Unified Shared Workspace

**Date:** 2026-05-21  
**Status:** **COMPLETE — awaiting operator review (do not proceed to 13.2)**  
**Convex:** `basic-anaconda-984` (`https://basic-anaconda-984.convex.cloud`)  
**Production app:** https://dlcfunds.vercel.app  
**Vercel deployment:** `dpl_4e9dfhgyGpzJSyMuWR5i96YwMqga`  
**Evidence:** `migration-reports/phase13-step1-shared-workspace-proof.json`

---

## Summary

Phase 13.1 adds a **UI + query composition layer** on top of the locked Phase 12 ACL foundation. A new primary nav item **Shared** (`/shared`) exposes a unified chronological feed of **tasks** and **pipeline files** with filters, owner inline share actions, and reactive Convex updates — without modifying auth, `ownerUserId`, `resourceShares` enforcement, impersonation, tenant normalization, or write-budget architecture.

---

## Scope compliance (Phase 12 locks)

| Locked area | Touched? |
|-------------|----------|
| Auth / canonical identity | **No** |
| `ownerUserId` semantics | **No** |
| `resourceShares` ACL engine (`resourceAccess.ts`) | **No** — read-only via existing helpers |
| Visibility enforcement | **No** |
| Superuser impersonation | **No** |
| Tenant normalization | **No** |
| Write-budget protections | **No** — route enum `shared` added only for diagnostics |
| Convex subscription architecture | **No** — one `useQuery(listFeed)` per active tab |

**Mutations in UI** call existing wrappers only:

- `taskShares.upsertShare` / `removeShare`
- `pipelineFileShares.upsertShare` / `removeShare`

---

## Deliverables

| Area | Path |
|------|------|
| Feed query | `lender-app/convex/sharedWorkspace.ts` (`listFeed`, `buildSharedFeedList`) |
| Route | `lender-app/app/shared/layout.tsx`, `page.tsx` |
| Row UI | `lender-app/components/shared/SharedResourceRow.tsx` |
| Filter persistence | `lender-app/lib/sharedWorkspacePersistence.ts` |
| Nav | `lender-app/lib/navigation/navigationCatalog.ts` (`shared`, order 36) |
| Task view-only hint | `lender-app/components/TaskDrawer.tsx`, `app/tasks/page.tsx` (`?shareAccess=view`) |
| Operator proof | `lender-app/convex/operator/sharedWorkspaceStep13_1.ts` |
| Proof runner | `lender-app/scripts/run-phase13-step1-shared-workspace-proof.ts` |
| Idle budget e2e | `lender-app/tests/e2e/shared-workspace-idle-budget.spec.ts` |

---

## Navigation & routes

- **Primary nav:** Shared → `/shared`
- **Subtabs:** Shared With Me (default), Shared By Me (`?tab=by_me`)
- **Permission gate:** `shared` nav maps to `files.view` (`navPermissionMap.ts`)

---

## Feed behavior

- **Modes:** `with_me` (recipient lens) | `by_me` (owner lens, org shares filtered to owner)
- **Resource types:** `task` | `pipeline` in one list, sorted by `updatedAt` desc
- **Row fields:** type badge, title, owner username, recipient username (by_me), permission badge, relative timestamp, quick open
- **Open paths:**
  - Task view → `/tasks?task=<id>&shareAccess=view` (lock banner in drawer)
  - Task edit → `/tasks?task=<id>`
  - Pipeline → `/pipeline/<fileId>` (server ACL enforces editability)

---

## Filtering

Persisted in `localStorage` key `dlc.shared.workspace.filters.v1`:

- Resource type (all / task / pipeline)
- Owner user key
- Recipient user key
- Permission (all / view / edit)
- Recently updated (7-day window)

---

## Live proof matrix (production Convex)

Operator: `operator/sharedWorkspaceStep13_1:runSharedWorkspaceLiveProof`  
Target recipient: `joshuaeballard@gmail.com` (`ts7d3keadq48gay3pa8k6gdwx9878p33`)  
Proof task: `k1756kdab4397w64ty4m64xn8h85gb9z` (“Errands”)  
Proof file: `jx73q1xrywyg8mfmag0hmd95g185qm11` (“Todd Coney – Coney'S Steam & Clean”)

Assertions scoped to proof `resourceId` + eballard recipient so unrelated org shares do not false-fail.

| Step | Requirement | Result |
|------|-------------|--------|
| **A** | Before share, eballard has 0 proof-task rows in With Me | **PASS** |
| **B** | Joshua shares task **view** → eballard With Me = 1 view; Joshua By Me = 1 view | **PASS** |
| **C** | Upgrade to **edit** → both feeds show edit permission | **PASS** |
| **D** | Task revoke → eballard proof-task count 0 | **PASS** |
| **D′** | Pipeline view → edit → revoke on proof file | **PASS** |
| **E** | Joshua By Me proof-file row 0 after pipeline revoke | **PASS** |
| **F** | Shared With Me updates without refresh (UI) | **Design PASS** — single Convex `useQuery`; operator validates server feed transitions; dual-browser smoke recommended below |

**Overall operator `pass`:** **true** (see JSON artifact).

---

## Query budget & subscriptions

| Metric | Design / expectation |
|--------|----------------------|
| Active subscriptions on `/shared` | **1** — `api.sharedWorkspace.listFeed` per tab |
| Tab switch | Reuses same hook with new args (no parallel With Me + By Me subs) |
| Polling | **None** |
| Idle mutations | **None** (mutations only on owner row actions) |
| Diagnostics scope | `SharedWorkspace` bucket + `route: "shared"` cost governance |

**Automated idle e2e:** `shared-workspace-idle-budget.spec.ts` against prod hit **Playwright 90s test timeout** while waiting **90s idle** (`PROD ? 90_000 : 45_000`). Re-run locally with extended timeout or non-prod idle window for numeric capture. Architecture review confirms budget intent: one reactive query, zero idle mutation path.

**Manual prod smoke (recommended for F + pill):**

1. Joshua session: `/shared` → Shared By Me → share/upgrade/revoke on a row  
2. Eballard session: `/shared` → Shared With Me — row appears / permission badge updates / revoke removes without reload  
3. Confirm live connection pill does not flicker on idle `/shared`

---

## Validation gates

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | **PASS** |
| `npm run build` | **PASS** |
| `npm run convex:deploy:prod` | **PASS** → `basic-anaconda-984` |
| `npm run deploy:prod` | **PASS** → https://dlcfunds.vercel.app |
| `npm run auth:validate` | **ALL_CHECKS_PASSED** |

---

## Screens verified

| Screen | URL | Notes |
|--------|-----|-------|
| Shared — With Me | https://dlcfunds.vercel.app/shared | Default tab, unified feed |
| Shared — By Me | https://dlcfunds.vercel.app/shared?tab=by_me | Owner lens + recipient column |
| Tasks (view share) | `/tasks?task=…&shareAccess=view` | View-only banner |
| Pipeline file | `/pipeline/<fileId>` | ACL-gated edit |

---

## Zero regression statement

Phase 12.2 pipeline share certification remains valid. Phase 13.1 did not edit `resourceAccess.ts`, auth modules, impersonation, or share mutation semantics — only composed reads over `resourceShares` and delegated writes to existing `*Shares` mutations.

---

## Operator review checklist

- [ ] Open `/shared` on prod as Joshua and Eballard; confirm live matrix **F** visually  
- [ ] Confirm nav **Shared** visible for `files.view` role  
- [ ] Spot-check filter persistence across reload  
- [ ] Approve or request changes before **Phase 13.2**

**STOP:** Do not continue to Phase 13.2 until operator sign-off.
