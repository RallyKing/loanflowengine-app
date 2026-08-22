# Canonical system map

**Binding reference.** Extend when ownership changes (same PR as the code).

---

## Core domains

| Domain | Canonical data owner | Canonical UI owner | Canonical scroll owner | Canonical workflow owner | Notes |
|--------|----------------------|--------------------|------------------------|--------------------------|-------|
| **Pipeline (files)** | Convex `pipeline` + related tables | `/pipeline`, `/pipeline/[convexFileId]` shells | **Hub:** `AppChrome` `<main>`. **File route:** **`[data-pipeline-workspace-scroll]`** — `<main>` is non-scrolling (`workspace-delegated`). See **`runtime-workspace-scroll-authority.md`**. | Stage changes, file create/archive, block layout | `PipelineFileWorkspace` + `PipelineFileWorkspaceShell` + mobile Vaul frame. **Client title** on the hub table is derived live from primary borrower entity + primary individual (`resolveTableRowClientDisplayName`); `dealData.clientName` is a write-through cache, not a second title. |
| **Contacts** | Convex `contacts`, `contactFileLinks`, `contactLenderLinks` | `/contacts` | `AppChrome` `<main>` | CRUD, labels, activity | Coexists with legacy embedded `pipeline.contacts`; prefer links as truth |
| **Lenders** | Convex `lenders` (org/global scope) | `/lenders` | `AppChrome` `<main>` | Directory, programs, attachments | Scenario match reads lender catalog |
| **Automations / message templates** | Convex `communicationTemplates` (+ outbound communications) | **`/automations`** (primary); Settings → Message templates is a **thin link / legacy redirect** from `/settings/message-templates` | `AppChrome` `<main>` | Email/SMS template CRUD; automation-type templates (follow-ups, reminders, notifications) placeholder until shipped | Do **not** add a second template store; compose UIs call the same Convex APIs |
| **Tasks** | Convex tasks tables / mutations | `/tasks` | `AppChrome` `<main>`** | Eisenhower matrix, recurrence | **Drawer overlay uses own scroll (exception) |
| **Messaging** | `fileMessages` + org rules | Quick panel / file UI | Messages list inside panel; page still `<main>` | Thread send/read | |
| **Documents / library** | `_storage` + doc records + per-user `vaultStars` | `/documents`, panels, Document Vault Explorer | `<main>` + bounded panel scrollports; pipeline file uses workspace scroll | Upload/link; Explorer star + search | Stars are per-user (`vaultStars`), not org-wide pins |
| **Portal** | Client grant + portal routes | `/portal/*` | Portal shell (`AppChrome` client portal variant) | Invite/magic link flows | Constrained surface |
| **Workflow automations** | `userSimpleWorkflows` + executors | Settings / admin UIs (until folded into Automations) | `<main>` | Trigger→action | Pair with webhook policy; distinct from message **templates** hub |
| **Webhooks** | Outbound subscription tables + workers | Admin/debug (where present) | N/A (server) | Enqueue/delivery | |
| **Org AI providers** | Convex `orgAiProviders` (AES-GCM via portalFieldCrypto) | Settings → Integrations → AI API keys (`/settings/ai-providers`) | `<main>` | Upsert / default / test ping | Full keys never returned to client |
| **AI Due Diligence** | `dueDiligencePrompts` + `dueDiligenceRuns` + `dueDiligenceActions` | Document Vault / `/documents` sheet | Overlay (`OverlayShell`) | Select vault files → prompt → persist run | Reuses `libraryDocuments` selection |
| **Shared field bus** | `fileSharedState`, overrides | Block UIs inside file | N/A | Normalize deal numerics across blocks | |
| **Simple P&L** | `pipeline.dealData.simplePlInstances` (+ legacy `simplePl`) + sticky `contactSimplePlStatements` | Financials collapsible `simplePl` / portal `simple_pl` | File workspace `[data-pipeline-workspace-scroll]` | Multi-timeframe assign / copy / vault task / PDF | Same category as PFS, Track Record, Construction Budget |
| **Layout / chrome** | N/A (presentation) | `AppChrome`, `MobileChromeProvider`, `SaasSidebar` | **Default:** `<main>`**. **File workspace route:** delegated scroller — see **`runtime-workspace-scroll-authority.md`** | N/A | Bottom nav: classic mobile only |

---

## Scroll ownership (summary)

- **Default vertical scroll:** `AppChrome` `<main data-app-main-scroll>`.
- **Pipeline file workspace route:** **`[data-pipeline-workspace-scroll]`** — `<main>` does **not** own file body scroll. Authoritative table: **`runtime-workspace-scroll-authority.md`**.
- **Documented exceptions:** task/lender inspector (`RecordInspectorShell`), modals, short `max-h-*` regions — see `docs/scroll-architecture-rules.md`.

---

## Duplicate / ambiguous zones (watch closely)

| Zone | Risk | Mitigation |
|------|------|------------|
| Contacts on file vs global contacts | Two representations | Prefer `contactFileLinks`; migrate legacy embedded |
| Notes / activity | Multiple tables | Clarify product “timeline” before adding another |
| Email vs messaging | Overlap perception | Single mental model in UX copy |
| Block registry vs ad hoc panels | Shadow UI | Register blocks; avoid one-off side panels |
| Org AI vs platform OpenAI env | Two key sources | Discovery/assist may use Convex env; Due Diligence uses `orgAiProviders` only |

---

## Related

- `duplicate-system-watchlist.md`
- `state-ownership-map.md`
- `route-ownership-map.md`
- `runtime-workspace-scroll-authority.md`
