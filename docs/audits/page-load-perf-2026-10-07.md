# Page-load performance audit — 2026-10-07

**Repo:** RallyKing/loanflowengine-app (`main` @ `cbcf503`)  
**App:** `lender-app/` (Next.js 15.5.15)  
**Convex prod:** `basic-anaconda-984`  
**Vercel prod:** https://www.paperworkprocessing.com  

**Method:** Code-path analysis of first-paint `useQuery` mounts + `npm run build` First Load JS (2026-10-07). Prod Convex Insights not pasted this session — docs-read columns are **code estimates**; refine with local `npx convex dev` load-check before each PR merge.

**Already cooled (do not redo):** `listTablePreview`, `listTablePreviewEnrichment`, `pipeline:getDetail`, presence/OCC contention (PRs #38–#42, #49).

**Hard rules for Phase 2:** no polling / idle scheduler pumps / unbounded collects without policy exception; never weaken auth, RBAC, org scoping, or vault/portal token checks; no feature or copy changes.

---

## 1. Shared shell (every signed-in page)

| Layer | Convex | Notes |
|-------|--------|-------|
| `OrgPermissionsProvider` | `organizations.listMyMemberships` → `organizations.effectivePermissions` | **Waterfall** — gates org-scoped page args |
| `UserPreferencesProvider` | `userPreferences.getByAccountId` | Small |
| `OrgBrandingProvider` | branding queries | Small |
| `NavigationConfigProvider` (via AppChrome) | nav config + org policy | Small |
| Notification bells | notifications / product-knowledge | When `notifyUserKey` set |

Unauthenticated / public portal layouts skip AppChrome; still get `ConvexClientProvider`.

---

## 2. Route inventory (59 pages + 20 API routes)

### Hubs

| Route | Page | First-paint Convex (primary) | First Load JS | Client/server |
|-------|------|------------------------------|---------------|---------------|
| `/pipeline` | Server + dynamic `PipelinePageClient` | `listTablePreview` (+ deferred enrichment); **`contacts.list` referral (no limit)** | **299 kB** | Server shell, heavy client |
| `/contacts` | Client | **`registry.listAll`** (triple stream collect) | **214 kB** | Fat client |
| `/documents` | Client | `libraryDocuments.listHub` `.take(≤80)` | **169 kB** | Light hub |
| `/tasks` | Client | **`tasks.getAll`** `.take(20_000)` + ownership | **211 kB** | Fat client; `TaskDrawer` dynamic |
| `/lenders` | Server + client | **`lenders.list`** (full-scan `.collect()` when filters need it) | **295 kB** | Heavy |
| `/ledger` | Client | **`ledger.list`** (ledger+payments `.collect()`) + **`pipeline.listLight`** | **177 kB** | Fat client |
| `/shared` | Client | shared-feed queries | 168 kB | Client |
| `/activity` | Client | activity hub | 158 kB | Client |
| `/analytics` | Server + client | user-triggered aggregates preferred | 161 kB | Moderate |
| `/operations` | Client | triage/activity | 157 kB | Client |
| `/automations` | Server + client | automations workspace | 167 kB | Moderate |
| `/events` | Server + client | events list | 173 kB | Moderate |
| `/events/[eventId]` | Server + client | event detail | 176 kB | Moderate |
| `/coming-soon` | Client | none | 113 kB | Static |
| `/registry` | Server | redirect → `/contacts` | — | — |

### Pipeline workspace

| Route | First Load JS | Notes |
|-------|---------------|-------|
| `/pipeline/[fileId]` | 104 kB (page) + dynamic workspace | Workspace ~135KB source; vault cluster + `contacts.list` ensureIds waterfall |
| `/pipeline/client/[clientId]` | 105 kB | Client workspace |
| `/pipeline/file/.../print` | 104 kB | Print |
| `/print/ledger` | 149 kB | `ledger.list` again |
| Redirects | — | `/pipeline/library`, `/pipeline/file/.../deal`, intake legacy |

### Contacts detail

| Route | First Load JS | Notes |
|-------|---------------|-------|
| `/contacts/[id]` | **725 kB** | Heavy detail panel |
| `/contacts/entity/[entityId]` | **702 kB** | Heavy entity panel |

### Settings

| Route | First Load JS | Notes |
|-------|---------------|-------|
| `/settings` | 271 kB | Section-gated org queries |
| `/settings/document-vault-templates` | **531 kB** | Heavy manager |
| Other settings/* | 161–199 kB | Moderate |

### Auth / marketing / legal

Lean (103–114 kB): `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/privacy`, `/terms`, `/session-expired`.

### Forms / public / portals

| Route | First Load JS | First-paint Convex |
|-------|---------------|--------------------|
| `/apply/[token]` | 139 kB | `preloadQuery` + form |
| `/upload/[taskToken]` | 140 kB | Task upload portal |
| `/share/[token]` | 104 kB | Share view |
| `/public/verify-access/[token]` | 138 kB | Access verify |
| `/client-portal/[bundleToken]` | **522 kB** | `getBundleByToken` (tasks `.collect()`) + composition waterfall |
| `/lender-delivery/[deliveryToken]` | **555 kB** | `getDeliveryByToken` (folders `.collect()` + doc fan-out) |
| `/portal/*` | 111–146 kB | Session portal; leaner than token portals |

### API routes

Auth, Convex token, org team, observability, health/debug — not first-paint UI cost.

---

## 3. Top 10 cost targets (ranked)

| Rank | Target | Route(s) | Evidence | Docs-read (estimate) | Fix PR |
|------|--------|----------|----------|----------------------|--------|
| **1** | `registry.listAll` | `/contacts` | Contacts+entities `.collect()`, lenders `.take(5000)`, merge cap 10k. Paginated API **exists unused** (`listPaginated`) | O(all contacts+entities) | A |
| **2** | `ledger.list` | `/ledger`, print | Dual global `.collect()` on ledger + payments; then per-file ACL | O(all ledger+payments) | A |
| **3** | `tasks.getAll` | `/tasks` | `.take(20_000)` + ownership presentation per row | Up to 20k tasks | A |
| **4** | `lenders.list` full-scan | `/lenders` | `.collect()` when `needsFullScan`; `listBrowsePaginated` unused | Up to full lenders table | A |
| **5** | `pipeline.listLight` | `/ledger` (+ gated onboarding) | Org `.take(20_000)` | Up to 20k files | A |
| **6** | `contacts.list` (no limit) | `/pipeline` referral | `.collect()` when limit omitted | O(org contacts) | A |
| **7** | Shell org waterfall | All signed-in | memberships → permissions serial | 2 queries | A (skip-only) |
| **8** | `getBundleByToken` | client-portal | Always collects vault tasks by pipeline | O(file tasks) | A |
| **9** | File vault cluster | pipeline vault UI | `listByPipeline` / folders / stale `.collect()` (file-scoped) | O(file docs) | A |
| **10** | `getDeliveryByToken` | lender-delivery | Folders `.collect()` + doc/url fan-out | O(file folders+docs) | A |

**Bundle adjuncts (PR B, not Convex):**

| Target | Why |
|--------|-----|
| `ReportBugMount` + `html-to-image` | Static in AppChrome for every signed-in session |
| `jszip` static on vault ZIP paths | Pulls into download call graph |
| `RichFilePreview` / DOMPurify | Can stay off cold hub paths via dynamic open |
| Mega modules | tasks page, PipelineFileWorkspace — continue splitting |

---

## 4. Primary hub First Load JS snapshot (build 2026-10-07)

| Route | Route JS | First Load JS |
|-------|----------|---------------|
| `/pipeline` | 81.6 kB | **299 kB** |
| `/contacts` | 42.9 kB | **214 kB** |
| `/documents` | 11.2 kB | **169 kB** |
| `/tasks` | 28.1 kB | **211 kB** |
| `/lenders` | 75.8 kB | **295 kB** |
| `/ledger` | 16.1 kB | **177 kB** |
| `/client-portal/[bundleToken]` | 17 kB | **522 kB** |
| `/lender-delivery/[deliveryToken]` | 15.3 kB | **555 kB** |
| Shared by all | — | 103 kB |

Raw log: `docs/audits/_build-page-load-2026-10-07.log` (local build artifact; optional to gitignore).

---

## 5. Phase 2 PR plan + verify matrix

| PR | Scope | Smoke |
|----|-------|-------|
| **A — Convex reads** | Contacts → `listPaginated` or stream `.take`; ledger scoped by file indexes; tasks lower take/paginate; lenders avoid full collect; pipeline `contacts.list` limit; selective portal skip collect; delivery folder walk via `get` | Contacts hub search/scroll; ledger totals; tasks list; lenders browse/search; pipeline referrals; vault PDF/image/Excel; client-portal; lender-delivery |
| **B — Bundle / lazy** | Dynamic ReportBugMount; lazy html-to-image; dynamic jszip; dynamic RichFilePreview from open paths | Report-a-bug screenshot; vault ZIP; previews; hubs First Load JS delta |
| **C — Render / UX** | Layout-stable skeletons on contacts/ledger/tasks; memo/virtualize if still janky | No layout jump; lists scroll/select |

**Per-PR gate:** before/after numbers in PR body; `verify:resource-safety`; local load-check (idle 60s → zero new calls); `/review-bugbot` + security + agent review — **fail closed on Criticals**; then merge + `deploy:prod` (+ `convex:deploy:prod` if Convex changed).

---

## 6. Load-check notes (dev backend only)

Before merging each Convex-touching PR:

1. Run flow once on local `npx convex dev`.
2. Count function calls in the log for the changed query.
3. Idle 60s → confirm **zero** new calls.
4. Optional: `window.__dlcConvexCostReport()` for duplicate subs / arg churn.
5. **Never** load-test production.
