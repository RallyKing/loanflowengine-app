# LFE / lender-app — Full optimization & bug audit

| Field | Value |
|-------|-------|
| **Date** | 2026-09-10 |
| **Repo** | RallyKing/loanflowengine-app |
| **App root** | `lender-app/` |
| **Branch audited** | `inbound-file-linked-new-lead-task` (plus local workspace checkout) |
| **Prod Convex (hint, re-verified as code targets)** | Production deployment nicknamed “Intake Sheet” (deployment slug redacted — see Convex dashboard / `CONVEX_DEPLOYMENT`) |
| **Vercel (hint)** | Hobby project `loanflowengine`, root=`lender-app`; FDT ~62/100GB reported externally — **not re-measured in this audit** |
| **Method** | Parallel code audits (routes/nav, Convex, frontend UX, perf/cost, security, tests) + primary-source verification of P0/P1 claims |
| **Scope** | Bugs, reliability, security, OCC/cost, test gaps, optimization. **No product redesign.** |
| **Outcome of this PR** | Docs-only audit. Critical security holes are ranked P0 with **urgent Prompt Pack** items — a separate minimal security patch PR is recommended immediately after review (see Prompt Pack §1–4). |

**Constraints acknowledged:** architecture + scroll ownership (`docs/governance/runtime-workspace-scroll-authority.md`), mobile QA (`docs/mobile-testing-rules.md`), deployment CLI gate (`docs/deployment-rules.md`). This document does not ship UI changes.

**Evidence policy:** Prefer primary code citations (`path:line`). Items labeled **speculation** are structural matches to external hints (OCC Insights, FDT) without inventing metrics. No coverage percentages or GB attributions invented.

---

## 1. Executive summary

Direct Lending Connection (`lender-app`) is a mature Next.js 15 + Convex multi-tenant broker workspace. The codebase shows strong intentional architecture (locked shell scroll, org-scoped RBAC helpers, `qa:governance` mobile gate, Stripe/Dropbox Sign signature verification). The highest risks are **not** missing features — they are **security boundary gaps** on public Convex mutations and **OCC contention** on hot session/job/presence documents that match reported Convex Insights warnings.

### Top conclusions

1. **Security P0 (action required):** Several public Convex mutations lack identity binding — notably unauthenticated migration/search-rebuild writers, `lenderFiles.generateUploadUrl` with empty auth, and `assertOrgPermission` trusting caller-supplied `userKey` (with empty-key fallback to `APP_AUTH_USER_KEY`). These are the only findings that justify an immediate minimal fix PR ahead of optimization work.
2. **OCC P0/P1 (matches prod Insights hints):** `touchSession` unconditionally patches `authSessions` on every viewer load; inbound integration schedules **both** worker claim and `processInboundIntegrationJob` against the same `integrationJobs` row with late idempotency; presence heartbeat/clear contend without unique `(org,user)`.
3. **Perf/cost (Vercel Hobby):** No `vercel.json` / ignore-build step — preview storms can burn build minutes and FDT. Largest measured public asset is `pdf.worker.min.mjs` (~1.31 MiB); middleware matcher does not exclude `.mjs`. ~530 `"use client"` modules; several 100KB+ client trees. **Cannot explain 62GB FDT from repo file sizes alone.**
4. **UX reliability:** `OverlayShell` with `wrapPanel={false}` drops dialog ARIA; pipeline file/client dynamic imports use `loading: () => null` (blank flash); Activity/Documents deep-links ignore record IDs.
5. **Tests:** Playwright-heavy (71 specs); `qa:governance` covers mobile + smoke + auth reject. Contacts CRUD, auth lifecycle beyond login, billing/webhook success paths, and many settings routes are thinly covered or env-skipped. **No `.github` CI workflows.**

### Recommended sequencing

| Order | Track | Why |
|------:|-------|-----|
| 1 | Security Prompt Pack 01–04 | Close unauthenticated write / spoofable RBAC before more surface area |
| 2 | OCC Prompt Pack 05–08 | Reduce auth/job/presence contention (prod Insights alignment) |
| 3 | UX + a11y Prompt Pack 09–12 | User-visible reliability without schema risk |
| 4 | Vercel cost Prompt Pack 13–15 | Ignore-build, worker caching, deploy double-build |
| 5 | Test gap Prompt Pack 16–18 | Lock P0 paths after security/OCC land |

---

## 2. Severity-ranked issue list

Severity guide:

| Sev | Meaning |
|-----|---------|
| **P0** | Security exploit / data corruption / dual-write automation / unauthenticated mutation of prod data |
| **P1** | High user or ops impact; known OCC hotspot shape; auth DoS; open redirect |
| **P2** | Medium reliability, cost, a11y, or correctness |
| **P3** | Hygiene, polish, docs drift |

---

### P0

#### P0-01 — Unauthenticated public migration mutations can rewrite tenant data

| | |
|--|--|
| **Evidence** | `lender-app/convex/contactMigration.ts:87–100` — `migratePipelineContactsToStandalone` has no admin secret / identity check; `.collect()` on all `pipeline` + `contacts`. Same class: `lenderContactMigration.ts:169+` (`migrateLenderContacts`), `legacyAssignToOwner.ts:31+` (`run`), `globalSearchSync.ts:68+` (rebuild pages). |
| **Repro** | Call public Convex mutation on the deployment with no JWT / no `operatorSecret` (any client with deployment URL + deploy key or open `convex.cloud` HTTP if exposed). |
| **Impact** | Cross-tenant or global data mutation / contact creation / org reassignment depending on mutation. |
| **Fix direction** | Convert to `internalMutation` **or** gate with `assertDataMigrationAdmin` / `DATA_MIGRATION_ADMIN_SECRET`; prefer delete/disable leftover one-shots. |

#### P0-02 — `assertOrgPermission` trusts client `userKey`; empty key → platform fallback

| | |
|--|--|
| **Evidence** | `lender-app/convex/organizationRbac.ts:298–309` — uses caller `userKey`, then JWT subject, then `platformUserKeyFallback()` (`APP_AUTH_USER_KEY`). Call sites include `webhooks.createWebhook`, `organizations.addMember`, branding upload URL, custom domains, integration connectors (see security stream). Contrast: `callerAuth.ts` `requireAuthenticatedCaller` / `resolveMemberUserKey` bind JWT. |
| **Repro** | **Speculation on exploit ease:** invoke a public mutation that only calls `assertOrgPermission` with a victim admin’s `userKey` (or empty key if deployment fallback is set) without matching JWT. |
| **Impact** | Privilege spoof / cross-user org actions if Convex public API is reachable. |
| **Fix direction** | Make `assertOrgPermission` require `requireAuthenticatedCaller` (or equivalent); **never** use platform fallback on public functions. |

#### P0-03 — `lenderFiles.generateUploadUrl` mints storage upload URLs with no auth

| | |
|--|--|
| **Evidence** | `lender-app/convex/lenderFiles.ts:67–72` — `mutation` with empty args, returns `ctx.storage.generateUploadUrl()` with no identity check. |
| **Repro** | Call `lenderFiles:generateUploadUrl` without auth; POST bytes to returned URL. |
| **Impact** | Storage cost/DoS abuse; arbitrary blob write (linking still gated in `addFile`). |
| **Fix direction** | Require org-scoped authenticated caller (same pattern as other vault `generateUploadUrl`s). |

#### P0-04 — Inbound automation dual-writes `integrationJobs` before claim (OCC + duplicate effects)

| | |
|--|--|
| **Evidence** | `integrationJobs.ts:374–379` schedules `processInboundIntegrationJob` after enqueue; `insertJobAndSchedule` also schedules worker (`:170–172` region per stream). Bridge (`integrationAutomationBridge.ts`) checks `inboundAutomationDispatched` late, after side effects. Concurrent worker `tryClaimJob` / `completeJob` / `failJob` also patch the same doc. |
| **Repro** | **Speculation:** concurrent scheduler fire of worker + bridge on same `jobId` under load — matches Insights OCC on `tryClaimJob` / `processInboundIntegrationJob`. |
| **Impact** | Duplicate automation side effects; OCC retries/failures on inbound path. |
| **Fix direction** | CAS claim **before** effects; single owner (worker-after-claim **or** bridge-only); status CAS on complete/fail. |

#### P0-05 — Discovery candidates/runs lack `organizationId` (cross-tenant data model)

| | |
|--|--|
| **Evidence** | Schema `lenderCandidates` / `discoveryRuns` without org field (stream: `schema.ts` ~940–984); `discovery.ts` list paths use global `by_status` / `by_created` after `assertDiscoveryAccess` only. |
| **Impact** | Cross-tenant read/mutate of discovery rows by id / global lists. |
| **Fix direction** | Add `organizationId` + org indexes; scope all list/update/accept paths. |

---

### P1

#### P1-01 — `touchSession` hot RMW on `authSessions` (Insights hotspot)

| | |
|--|--|
| **Evidence** | `convex/auth/sessionQueries.ts:100–155` — unconditional `ctx.db.patch` of `lastSeenAt` / idle / token fields. Called from `lib/session/loadViewer.ts` on successful cookie validation; client may swallow failures. |
| **Impact** | OCC on auth path under parallel RSC/API/multi-tab; session idle extension can fail. |
| **Fix direction** | Throttle/CAS (skip patch if `lastSeenAt` within N minutes); separate idle-touch from token rotation; unique `publicId`. |

#### P1-02 — `presence.heartbeat` / `clearForUser` contention; non-unique `(org,user)`

| | |
|--|--|
| **Evidence** | `convex/presence.ts` heartbeat/clear via `by_org_user` `.first()` then patch/delete/insert; index not unique; client empty-catch on heartbeat (`hooks/usePresence.ts`). |
| **Impact** | OCC; duplicate presence rows; flaky presence. |
| **Fix direction** | Idempotent upsert; version/CAS; purge index by `expiresAt`. |

#### P1-03 — Public `revokeSession` needs only `publicId` (no token proof)

| | |
|--|--|
| **Evidence** | `sessionQueries.ts:160–174`. Bridged logout uses HMAC path separately. |
| **Impact** | Session revoke DoS if `publicId` leaks. |
| **Fix direction** | Require `tokenHash` or make internal-only. |

#### P1-04 — Post-login open redirect via `?next=`

| | |
|--|--|
| **Evidence** | `app/login/LoginForm.tsx:59` — `window.location.href = next \|\| APP_HOME_HREF` with no allowlist. |
| **Repro** | `/login?next=https://evil.example` → after successful login, browser navigates off-site. |
| **Impact** | Phishing / token exfil via attacker-controlled landing. |
| **Fix direction** | Allow only same-origin relative paths starting with `/` (reject `//`, `http:`, etc.). |

#### P1-05 — Integration inbound token optional; short connector `publicId`

| | |
|--|--|
| **Evidence** | `integrationJobs.ts:352–359` — verify only if hash/salt present; `integrationConnectors` `publicId` = short hex. |
| **Impact** | Untokened connectors reachable by id; bot actions share boundary. |
| **Fix direction** | Require inbound token by default; lengthen `publicId`; fail closed. |

#### P1-06 — JWT-less verified `memberUserKey` acceptance

| | |
|--|--|
| **Evidence** | `callerAuth.ts` / `workspaceMemberAuth.ts` — if `memberUserKey` is a verified member, accept without JWT. |
| **Impact** | **Speculation:** exploitability rises if `userKey` appears in client payloads/logs. |
| **Fix direction** | Prefer JWT-only for mutations; time-box bridge fallback. |

#### P1-07 — Lender rating optimistic UI does not roll back

| | |
|--|--|
| **Evidence** | `components/LenderDrawer.tsx:257–265` — catch empty despite “revert on failure” comment. |
| **Impact** | Wrong star rating until remount. |

#### P1-08 — Activity / Documents links ignore record IDs

| | |
|--|--|
| **Evidence** | `app/activity/page.tsx:322–347` — `href="/contacts"` / `/lenders` / `/tasks` while IDs exist. `app/documents/page.tsx:168–174` similar for contacts. Helper `registryCommandCenterHref` already builds `/contacts/${id}`. |
| **Impact** | Dead-end UX; looks broken. |

#### P1-09 — Pipeline surfaces lack `ConvexQueryBoundary`; dynamic `loading: () => null`

| | |
|--|--|
| **Evidence** | `PipelineFilePageClient.tsx:6–11`, `ClientWorkspacePageClient.tsx`, `FileWorkspaceContainer.tsx`, `tasks/page.tsx` TaskDrawer — `loading: () => null`. Tasks/contacts use boundaries; pipeline hub/file largely do not. |
| **Impact** | Blank flash; full-page error on query failures. |

#### P1-10 — Product Updates bell: mobile accessible name + error-as-empty

| | |
|--|--|
| **Evidence** | `ProductUpdatesBell.tsx:215–258` — visible label `hidden sm:inline`, no `aria-label`; errors coerced to empty state. |

#### P1-11 — `OverlayShell` `wrapPanel={false}` drops dialog ARIA (systemic a11y)

| | |
|--|--|
| **Evidence** | `components/ui/OverlayShell.tsx:98–127`. Callers: NewPipelineHierarchyCreateDialog, MergeRecordModal, ConvertToEntityModal, HierarchyActionWizard, DealBibleCompilerModal. No focus trap. |
| **Impact** | Screen-reader / keyboard users lose dialog semantics on core create/merge flows. |

#### P1-12 — Job complete/fail / sweep without status CAS; `.filter` on `nextAttemptAt`

| | |
|--|--|
| **Evidence** | `integrationJobs.ts:62–75` `completeJob` blind patch; sweep uses `.filter` despite `by_status_next` index. |
| **Impact** | Status flapping; extra OCC; inefficient sweeps. |

---

### P2

| ID | Finding | Evidence |
|----|---------|----------|
| P2-01 | No `vercel.json` / ignore-build step (preview storm amplifier) | Repo has no `vercel.json`; deploy scripts are `--prod` only |
| P2-02 | `pdf.worker.min.mjs` ~1,375,838 bytes; middleware matcher omits `.mjs` | `public/pdf.worker.min.mjs`; `middleware.ts:258–262` |
| P2-03 | No `Cache-Control` for static/public assets in `next.config.mjs` | Headers = security/CSP only (`:116–165`) |
| P2-04 | `deploy:prod` double-builds (local + remote) | `package.json` `deploy:prod` |
| P2-05 | Serialized Next build (`staticGenerationMaxConcurrency: 1`, workers off) | `next.config.mjs:105–110` — intentional for Windows; costly on Vercel Linux |
| P2-06 | ~530 `"use client"` files; mega modules (PipelineFileWorkspace ~135KB, tasks page ~122KB, …) | Disk sizes measured |
| P2-07 | Dual hub+file `listTablePreview` subscriptions | `usePipelineFileWorkspaceData` + `PipelinePageClient` |
| P2-08 | `Date.now()` in some queries | e.g. `teamManagement.ts`, `clientPortalLinks.ts` |
| P2-09 | Hot `.filter` / wrong index (tasks quadrant/date, webhookOutbound, orgTenantRepoint `fileMessages`) | Convex stream |
| P2-10 | N+1 link→entity gets | `contactFileLinks`, `contactLenderLinks`, `vaultStars` |
| P2-11 | CSRF cookie set but never verified (Origin-only) | `api/auth/login` sets `dlc_csrf`; `sameOrigin.ts` Origin≡Host |
| P2-12 | Optional unsigned webhook env footgun | `CONVEX_ALLOW_UNSIGNED_WEBHOOKS` in `http.ts` |
| P2-13 | Debug surfaces if `DLC_SAFE_DEBUG=1` in prod | `lib/observability/debugGate.ts` |
| P2-14 | Env/E2E login backdoors if misconfigured | `APP_AUTH_E2E_ALLOW_IN_PRODUCTION`, env credentials |
| P2-15 | Host→org public mapping / auth health fingerprint | Intentional but useful recon |
| P2-16 | Portal files page returns `null` during redirect | `app/portal/files/page.tsx:29–36` |
| P2-17 | `PortalOverlayPanel` lacks `aria-modal` / focus trap | `PortalOverlayPanel.tsx` |
| P2-18 | `isomorphic-dompurify` on client preview path | `sanitizePreviewHtml.ts` → `RichFilePreview` |
| P2-19 | Brand font includes Ethiopic subset (4 weights) | `app/layout.tsx` Noto Serif Ethiopic |
| P2-20 | Zero `next/image` usage; raw `<img>` | App-wide grep |
| P2-21 | Orphan route `/settings/document-vault-templates` (no in-app href) | Page exists; no nav link found |
| P2-22 | Systemic missing `returns` validators on public Convex fns | Large count; args generally present |
| P2-23 | Bridge swallows rule errors then marks dispatched | `integrationAutomationBridge` catch → warn |
| P2-24 | HtmlDocumentEditorCanvas `innerHTML` without sanitize-on-load | Stored HTML XSS risk for editors |

---

### P3

| ID | Finding | Evidence |
|----|---------|----------|
| P3-01 | `SETTINGS_JUMP_LINKS` mentioned in comment only | `settingsRegistry.ts:30` |
| P3-02 | `requireUser` redirects to `/sign-in` vs middleware `/login` | Works via chain; inconsistent |
| P3-03 | Documents Due Diligence decorative icon not `aria-hidden` | `documents/page.tsx` |
| P3-04 | Text-only loading on some hubs | activity/documents |
| P3-05 | Phase115 PNGs in app root inflate CLI upload context | `phase115-*.png` not in `.vercelignore` |
| P3-06 | PWA SW network-first only | `public/sw.js` |
| P3-07 | 36 unit scripts unwired in `package.json` | `scripts/*-tests.ts` |
| P3-08 | No GitHub Actions CI | No `.github/workflows` |
| P3-09 | `/registry` legacy in `navRecency` only | Redirects to contacts |

---

## 3. Per-route checklist

Status: **Visited in code** = page/layout/middleware/nav read during audit. **Needs UI verify** = no browser smoke in this session.

### Public / auth / legal

| Path | Status | Notes |
|------|--------|-------|
| `/` | Visited in code / Needs UI verify | Marketing if logged out; redirect if session |
| `/login` | Visited in code / Needs UI verify | Open redirect P1-04 |
| `/sign-in` | Visited in code | → `/login` |
| `/signup`, `/sign-up` | Visited in code / Needs UI verify | |
| `/forgot-password`, `/reset-password` | Visited in code / Needs UI verify | Untested E2E happy path |
| `/session-expired` | Visited in code | |
| `/terms`, `/privacy` | Visited in code | |

### Core workspace (nav catalog)

| Path | Nav? | Status | Notes |
|------|------|--------|-------|
| `/pipeline` | Yes | Visited in code / Needs UI verify | Hub; dual `listTablePreview` |
| `/pipeline/[fileId]` | Child | Visited in code / Needs UI verify | Delegated scroll; blank dynamic load P1-09 |
| `/pipeline/client/[clientId]` | Child | Visited in code / Needs UI verify | |
| `/pipeline/licenses` | Pipeline sub | Visited in code | |
| `/pipeline/library` | — | Visited in code | Redirect → `/pipeline` |
| `/pipeline/file/.../deal` | — | Visited in code | Redirect → file |
| `/pipeline/file/.../print` | — | Visited in code | |
| `/pipeline/intake/[[...slug]]` | — | Visited in code | Legacy |
| `/analytics` | Pipeline sub | Visited in code / Needs UI verify | Thin tests |
| `/ledger` | Pipeline sub | Visited in code / Needs UI verify | Large client page |
| `/tasks` | Yes | Visited in code / Needs UI verify | Stronger tests than contacts |
| `/events`, `/events/[eventId]` | Yes / child | Visited in code / Needs UI verify | Thin tests |
| `/contacts`, `/contacts/[id]`, `/contacts/entity/[entityId]` | Yes / child | Visited in code / Needs UI verify | CRUD untested P0 gap |
| `/registry` | Legacy | Visited in code | → `/contacts` |
| `/documents` | Yes | Visited in code / Needs UI verify | Broken deep links P1-08 |
| `/operations` | Yes | Visited in code / Needs UI verify | |
| `/shared` | Yes | Visited in code / Needs UI verify | |
| `/activity` | Yes | Visited in code / Needs UI verify | Broken deep links P1-08 |
| `/lenders` | Yes | Visited in code / Needs UI verify | Rating rollback P1-07 |
| `/automations` | Yes | Visited in code / Needs UI verify | |
| `/coming-soon` | Yes | Visited in code | |
| `/settings` (+ hashes) | Yes | Visited in code / Needs UI verify | Hub via `settingsRegistry` |

### Settings subpages

| Path | Status | Notes |
|------|--------|-------|
| `/settings/ai-providers` | Visited in code / Needs UI verify | jumpHref |
| `/settings/message-templates` | Visited in code | permanentRedirect → `/automations` |
| `/settings/navigation-manager` | Visited in code | Alternate/orphan; tests hit it |
| `/settings/pipeline-stages` | Visited in code / Needs UI verify | |
| `/settings/loan-templates` | Visited in code / Needs UI verify | |
| `/settings/portal-defaults`, `.../[id]/builder` | Visited in code / Needs UI verify | Thin tests |
| `/settings/tasks/library` | Visited in code / Needs UI verify | |
| `/settings/document-vault-templates` | Visited in code | **Orphan** — no in-app href found |

### Portals / tokens / print / debug

| Path | Status | Notes |
|------|--------|-------|
| `/portal`, `/portal/login`, `/portal/magic`, `/portal/files`, `/portal/file/[fileId]` | Visited in code / Needs UI verify | Public portal auth |
| `/apply/[token]`, `/upload/[taskToken]`, `/client-portal/[bundleToken]`, `/lender-delivery/[deliveryToken]`, `/share/[token]`, `/public/verify-access/[token]` | Visited in code / Needs UI verify | Token gateways |
| `/{companySlug}/{token}` | Visited in code (middleware rewrite) | |
| `/print/ledger`, `/print/terms/[id]` | Visited in code | |
| `/convex-debug`, `/system/debug/agent-log` | Visited in code | Debug |
| API routes under `/api/auth/*`, `/api/convex/token`, `/api/org/team/*`, observability, `/system/health`, JWKS | Visited in code | Auth/public as middleware |

**Nav orphans / mismatches:** No `NAV_CATALOG` href points at a missing page. Orphan deep page: `/settings/document-vault-templates`. Sampled static nav hrefs matched pages.

---

## 4. Convex health (OCC / indexes / auth) — summary

| Hotspot (Insights hint) | Code verdict |
|-------------------------|--------------|
| `auth/sessionQueries.touchSession` | **P1** unconditional RMW; high call rate via `loadViewer` |
| `integrationAutomationBridge.processInbound` + `tryClaimJob` | **P0** dual writers + late flag; claim itself is sound |
| `presence.clearForUser` | **P1** contend with heartbeat; non-unique pair |
| Migrations | **P0** if public ungated; **P1** OCC vs live traffic even when secret-gated |

**Positives:** Scheduler uses `internal.*` (no `api.*` scheduling found). `tryClaimJob` pending→running claim is correct. Tasks `expectedUpdatedAt` is a good CAS pattern to reuse. Stripe + Dropbox Sign webhook verification present.

**Indexes:** Hot tables generally have lookup indexes; gaps are uniqueness (`authSessions.publicId`, `memberPresence` org+user), underused range queries (`by_status_next`), and discovery missing org fields.

---

## 5. Perf / Vercel cost — summary

| Topic | Verified |
|-------|----------|
| `vercel.json` / ignore build | **Absent** |
| Largest public asset | `pdf.worker.min.mjs` = **1,375,838 bytes** |
| `"use client"` count | **~530** TSX files |
| `next/image` | **Zero** imports |
| Vercel crons in repo | **None** (Convex crons **do** exist in `convex/crons.ts`) |
| FDT 62/100GB | **External report — not measured here** |

**Speculative FDT ranking (labeled):** (1) preview deployment storm × visits — medium–high for usage pattern, low for exact GB; (2) repeated PDF worker fetches — medium; (3) large client JS graphs — medium; (4) fonts / unoptimized images — low–medium. Largest static file (~1.3 MiB) cannot alone explain tens of GB.

---

## 6. Security — summary

| Control | Status |
|---------|--------|
| Session middleware + public prefixes | Present |
| Stripe / Dropbox Sign signatures | Present (fail-closed when secret unset for Dropbox) |
| Portal token routes | Present |
| `dangerouslySetInnerHTML` | Sanitized preview path (DOMPurify); static layout scripts OK; contentEditable load risk P2-24 |
| Committed secrets | No `.env` committed; examples only |
| Clerk remnants in `app/` | Not found |
| Critical gaps | P0-01–P0-03, P0-05; P1-03–P1-06 |

**Decision this PR:** Docs-only. P0 security warrants an immediate **separate** minimal patch PR (Prompt Pack 01–04) after human review — mixed docs+security in one PR was avoided to keep review focused.

---

## 7. Tests — summary

| Metric | Count (observed) |
|--------|------------------|
| Playwright `*.spec.ts` | **71** |
| Approximate `test()` cases | **~169** |
| `__tests__` / Vitest | **0** |
| App `page.tsx` routes | **59** |
| Convex `.ts` files | **348** |
| GitHub Actions | **None** |

**Strong:** pipeline scroll/mobile, drawer smoke, auth login reject, governance gate (`qa:governance` = build + mobile + Chromium smoke/auth).

**Weak / untested risk:** contacts CRUD; forgot/reset/signup/logout; Stripe/billing success; webhook authorized success; pipeline create/delete/share happy path; many settings/events/automations routes.

**Skip risk:** Widespread env/data-gated `describe.skip` / `test.skip` → false confidence when seed missing.

---

## 8. Action plan — Cursor Cloud Agent PROMPT PACK

Each prompt is self-contained. Branch names must match cloud agent template when used from that environment: `cursor/<descriptive-name>-d12b` (adjust suffix per agent).

### Prompt 01 — Lock down unauthenticated migration / rebuild mutations
- **Fixes:** P0-01
- **Multitask:** No (single cluster)
- **Branch:** `cursor/secure-migration-mutations-d12b`
- **Prompt:** Convert public one-shot migrations (`contactMigration.migratePipelineContactsToStandalone`, `lenderContactMigration.migrateLenderContacts`, `legacyAssignToOwner.run`, public `globalSearchSync` rebuild pages) to `internalMutation` **or** require `DATA_MIGRATION_ADMIN_SECRET` via existing `assertDataMigrationAdmin`. Do not change migration logic. Add a short unit/script assert that public API rejects unauthenticated calls. Run Convex typecheck. Do not redesign contacts model.
- **Acceptance:** Public unauthenticated call throws; authenticated/admin path still works; no schema break; docs note in commit.

### Prompt 02 — Bind `assertOrgPermission` to authenticated caller
- **Fixes:** P0-02
- **Multitask:** Yes — pair with Prompt 03 if touching many call sites; otherwise solo with careful regression on webhooks/org settings
- **Branch:** `cursor/rbac-bind-caller-identity-d12b`
- **Prompt:** Refactor `assertOrgPermission` / `assertAnyOrgPermission` in `organizationRbac.ts` to resolve identity via `requireAuthenticatedCaller` (or equivalent). Remove empty-key `platformUserKeyFallback` from **public** paths (keep operator/internal escape hatches explicit and secret-gated). Grep all call sites; fix broken callers that only passed spoofable `memberUserKey`. Preserve impersonation readonly/operator behavior. Add focused tests or script proving mismatched JWT/`userKey` fails.
- **Acceptance:** Spoofed `userKey` without JWT fails; legitimate JWT paths for org admin actions succeed; impersonation modes unchanged.

### Prompt 03 — Auth-gate `lenderFiles.generateUploadUrl`
- **Fixes:** P0-03
- **Multitask:** No
- **Branch:** `cursor/secure-lender-upload-url-d12b`
- **Prompt:** Require authenticated org-scoped caller on `lenderFiles.generateUploadUrl` (mirror vault/portal patterns). Ensure UI upload still works. Reject unauthenticated calls.
- **Acceptance:** Unauthenticated mint fails; authenticated lender file upload E2E or manual path works.

### Prompt 04 — Org-scope discovery schema + queries
- **Fixes:** P0-05
- **Multitask:** No (schema migration — careful)
- **Branch:** `cursor/discovery-org-scope-d12b`
- **Prompt:** Add `organizationId` to `lenderCandidates` / `discoveryRuns` with indexes `by_org_status`, `by_org_created`. Backfill migration (admin-gated). Update `discovery.ts` list/update/accept to filter by org. Preserve `assertDiscoveryAccess`. Additive migration only.
- **Acceptance:** Org A cannot list Org B candidates; indexes used; migration dry-run documented.

### Prompt 05 — Integration job single-writer + claim-before-effects
- **Fixes:** P0-04, P1-12
- **Multitask:** Recommended (worker + bridge + sweep)
- **Branch:** `cursor/integration-job-claim-cas-d12b`
- **Prompt:** Ensure inbound automation runs only after atomic claim of `inboundAutomationDispatched` (or fold into worker after `tryClaimJob`). Stop dual schedule that patches same fields from worker + bridge. Add status CAS to `completeJob`/`failJob`. Replace sweep `.filter` with `by_status_next` range. Preserve idempotency keys.
- **Acceptance:** Single automation apply per job under concurrent schedule; OCC on job doc reduced structurally; sweep uses index.

### Prompt 06 — Throttle/CAS `touchSession`
- **Fixes:** P1-01
- **Multitask:** No
- **Branch:** `cursor/touch-session-throttle-d12b`
- **Prompt:** In `sessionQueries.touchSession`, skip patch when idle touch within threshold (e.g. 60–120s) unless rotating token. Prefer CAS on `lastSeenAt`/`updatedAt`. Keep `loadViewer` behavior. Do not weaken token validation.
- **Acceptance:** Rapid parallel validates do not all patch; rotation still updates hash; login/logout still work.

### Prompt 07 — Harden presence upsert + purge
- **Fixes:** P1-02
- **Multitask:** No
- **Branch:** `cursor/presence-unique-upsert-d12b`
- **Prompt:** Make heartbeat idempotent (delete duplicates or replace); clearForUser deletes all rows for org+user; add purge index/strategy by `expiresAt`. Keep client swallow only for transient OCC **after** backend is idempotent — prefer logging.
- **Acceptance:** No duplicate presence rows under concurrent heartbeat; clear removes all; purge does not table-scan blindly.

### Prompt 08 — Harden `revokeSession` + login `next` allowlist
- **Fixes:** P1-03, P1-04
- **Multitask:** No (small cluster)
- **Branch:** `cursor/session-revoke-and-redirect-d12b`
- **Prompt:** Require `tokenHash` (or internal-only) for `revokeSession`; keep bridged HMAC logout. In `LoginForm`, allow only relative same-origin paths (`/` prefix, reject `//`, schemes). Middleware-generated `next` must still work.
- **Acceptance:** `/login?next=https://evil.example` stays on-site; logout still revokes; public revoke without token fails.

### Prompt 09 — OverlayShell ARIA when `wrapPanel={false}`
- **Fixes:** P1-11
- **Multitask:** No
- **Branch:** `cursor/overlay-shell-a11y-d12b`
- **Prompt:** Apply `role`/`aria-*` to non-wrapPanel branch; add basic focus trap or document reuse of OperationalOverlayShell pattern. Fix DealBibleCompilerModal ignored aria-label. Mobile QA: create file wizard + merge modal keyboard Esc/focus.
- **Acceptance:** Dialog role present on create/merge/convert; `qa:governance` mobile still passes; no scroll contract break.

### Prompt 10 — Pipeline/client dynamic loading skeletons + ConvexQueryBoundary
- **Fixes:** P1-09
- **Multitask:** No
- **Branch:** `cursor/pipeline-loading-boundaries-d12b`
- **Prompt:** Replace `loading: () => null` with existing skeleton patterns; wrap pipeline hub/file query trees with `ConvexQueryBoundary` like tasks/contacts. Preserve delegated scroll / Vaul.
- **Acceptance:** No blank flash; query errors show in-panel retry; mobile file scroll tests pass.

### Prompt 11 — Activity/Documents deep links + lender rating rollback
- **Fixes:** P1-07, P1-08
- **Multitask:** No
- **Branch:** `cursor/activity-deeplinks-rating-rollback-d12b`
- **Prompt:** Use `registryCommandCenterHref` / equivalent for contact/lender/task links when IDs present. Roll back lender rating draft on `rate` failure (mirror ClientMomentumStars).
- **Acceptance:** Activity row with contactId opens `/contacts/:id`; failed rating restores previous stars.

### Prompt 12 — Product Updates bell a11y + error state
- **Fixes:** P1-10
- **Multitask:** No
- **Branch:** `cursor/product-updates-a11y-d12b`
- **Prompt:** Add `aria-label` on trigger; distinguish loading vs error vs empty in panel.
- **Acceptance:** Mobile VoiceOver-friendly name; error copy ≠ empty copy.

### Prompt 13 — Vercel ignore-build + preview hygiene
- **Fixes:** P2-01
- **Multitask:** No (docs + optional `vercel.json`)
- **Branch:** `cursor/vercel-ignore-build-d12b`
- **Prompt:** Document Ignored Build Step for Hobby; optionally add `vercel.json` ignoreCommand that skips builds for docs-only / non-prod agent pushes per `docs/deployment-workflow.md`. Do not enable GitHub auto-prod. Confirm deploy scripts stay CLI `--prod`.
- **Acceptance:** Docs + config committed; `deploy:prod` unchanged in intent; preview policy explicit.

### Prompt 14 — PDF worker caching + middleware exclude `.mjs`
- **Fixes:** P2-02, P2-03 (partial)
- **Multitask:** No
- **Branch:** `cursor/pdf-worker-cache-middleware-d12b`
- **Prompt:** Exclude `.mjs` from middleware matcher (like `.js`); add long-cache `Cache-Control` for `/pdf.worker.min.mjs` in `next.config.mjs` headers; ensure public PDF preview still loads for authed users (and unauth if required by product — verify). Do not weaken auth on API routes.
- **Acceptance:** Worker request skips Edge middleware; cache headers present; PDF preview works.

### Prompt 15 — Deploy double-build / artifact ignore
- **Fixes:** P2-04, P3-05
- **Multitask:** No
- **Branch:** `cursor/deploy-prebuilt-vercelignore-d12b`
- **Prompt:** Prefer `vercel deploy --prebuilt` after local build **or** drop redundant build; add phase115 PNGs / artifacts to `.vercelignore`. Preserve `qa:governance` before ship.
- **Acceptance:** Single webpack build per prod ship path; artifacts not uploaded.

### Prompt 16 — P0 E2E: contacts CRUD + auth reset + pipeline create
- **Fixes:** Test gaps
- **Multitask:** Yes (can split contacts / auth / pipeline)
- **Branch:** `cursor/e2e-p0-happy-paths-d12b`
- **Prompt:** Add Playwright happy paths with seed: contact create→edit→detail; pipeline create file→stage patch; forgot/reset API or UI contract. Fail (don’t soft-skip) when seed missing in CI mode.
- **Acceptance:** Specs green with seed; no `test.skip(true)` after catch.

### Prompt 17 — Webhook success + Stripe signature tests
- **Fixes:** Test gaps P1
- **Multitask:** No
- **Branch:** `cursor/test-webhook-success-paths-d12b`
- **Prompt:** Extend `tests/integrations` beyond empty-body 400: signed inbound success fixture; Stripe constructEvent reject + one mocked sync. Use secrets from test env only.
- **Acceptance:** Unauthorized fails; authorized fixture succeeds.

### Prompt 18 — Require inbound integration tokens by default
- **Fixes:** P1-05
- **Multitask:** No (coordinate with Prompt 05)
- **Branch:** `cursor/require-inbound-connector-tokens-d12b`
- **Prompt:** Make inbound token mandatory for new connectors; migrate existing; lengthen `publicId`. Fail closed when hash missing.
- **Acceptance:** Untokened inbound rejected; documented migration for existing connectors.

### Prompt 19 — Discovery/OCC residual indexes + Date.now queries *(optional follow-on)*
- **Fixes:** P2-08, P2-09, P2-10
- **Multitask:** Yes
- **Branch:** `cursor/convex-query-index-hygiene-d12b`
- **Prompt:** Replace hot `.filter` with indexes; pass `nowMs` into session/portal queries; batch N+1 link gets where cheap.
- **Acceptance:** No new full-table filters on listed hotspots; query args include `nowMs` where needed.

### Prompt 20 — Wire unwired unit scripts + route smoke matrix *(optional)*
- **Fixes:** P3-07, route gaps
- **Multitask:** No
- **Branch:** `cursor/test-unit-wire-route-smoke-d12b`
- **Prompt:** Add `test:unit:all`; extend mobile/desktop smoke to events/automations/analytics/key settings headings.
- **Acceptance:** npm script runs previously orphaned unit files; smoke covers listed routes.

---

## 9. Do not change (preserve)

Do **not** break or rewrite these without explicit product approval:

1. **Scroll contract** — locked `html`/`body`; `<main>` default scroll owner; **delegated** `[data-pipeline-workspace-scroll]` on `/pipeline/[fileId]`; Vaul mobile sheet (`PipelineWorkspaceMobileVaulFrame`); no new competing route-level `overflow-y-auto`.
2. **Auth model** — HMAC session cookie (`dlc_session`), Convex JWT mint via `/api/convex/token`, org-scoped RBAC — harden boundaries, don’t replace with Clerk.
3. **Canonical deal / pipeline data model** — `lib/deal/canonicalDataModel.ts`, block registry, file workspace modular blocks.
4. **Record inspector shell** — `RecordInspectorShell` / lender & task drawers scrollport rules.
5. **Deployment discipline** — Vercel CLI `deploy:prod` as ship path; do not re-bind production to GitHub auto-deploy as the primary gate.
6. **Mobile governance gate** — `npm run qa:governance` remains the baseline before user-facing complete.
7. **Tenant / org isolation intent** — tighten discovery/migrations; don’t introduce new global tables without org scope.
8. **Integration idempotency keys** — preserve; fix dual-writers around them.
9. **Client portal / token gateways** — public tokenized routes (`/apply`, `/upload`, `/share`, portals) must remain reachable without workspace session.
10. **Product branding / white-label fields** — org branding schema and theming paths.
11. **Presence product behavior** — presence itself is desired; only harden concurrency.
12. **Existing successful Stripe / Dropbox Sign verification** — don’t loosen fail-closed paths.

---

## 10. Appendix — audit method & limits

| Stream | Method |
|--------|--------|
| Routes / nav | Enumerated `page.tsx` / `route.ts` / layouts; read `middleware.ts`, `navigationCatalog.ts`, `settingsRegistry.ts` |
| Convex | Schema + prioritized OCC files + migration/auth/discovery scans |
| Frontend UX | OverlayShell, pipeline dynamic loads, activity/documents links, a11y samples |
| Perf | `next.config.mjs`, asset `wc -c`, `"use client"` counts, package scripts |
| Security | RBAC, upload URLs, webhooks, XSS grep, secrets |
| Tests | Playwright inventory, `package.json` scripts, skip patterns |

**Limits:** No live Convex Insights dashboard scrape in-session; no authenticated Vercel FDT breakdown; no browser UI smoke. Production OCC/FDT numbers from user hints are **labeled speculation** where only structural code match is available.

**Follow-up:** After Prompt Pack 01–04 lands, re-run Insights on the production Convex deployment and Vercel FDT by path to validate cost hypotheses with real metrics.

---

*End of audit — 2026-09-10*
