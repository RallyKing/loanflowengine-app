# Canonical system map

**Binding reference.** Extend when ownership changes (same PR as the code).

---

## Core domains

| Domain | Canonical data owner | Canonical UI owner | Canonical scroll owner | Canonical workflow owner | Notes |
|--------|----------------------|--------------------|------------------------|--------------------------|-------|
| **Pipeline (files)** | Convex `pipeline` + related tables | `/pipeline`, `/pipeline/[convexFileId]` shells | **Hub:** `AppChrome` `<main>`. **File route:** **`[data-pipeline-workspace-scroll]`** — `<main>` is non-scrolling (`workspace-delegated`). See **`runtime-workspace-scroll-authority.md`**. | Stage changes, file create/archive, block layout | `PipelineFileWorkspace` + `PipelineFileWorkspaceShell` + mobile Vaul frame |
| **Contacts** | Convex `contacts`, `contactFileLinks`, `contactLenderLinks` | `/contacts` | `AppChrome` `<main>` | CRUD, labels, activity | Coexists with legacy embedded `pipeline.contacts`; prefer links as truth |
| **Lenders** | Convex `lenders` (org/global scope) | `/lenders` | `AppChrome` `<main>` | Directory, programs, attachments | Scenario match reads lender catalog |
| **Tasks** | Convex tasks tables / mutations | `/tasks` | `AppChrome` `<main>`** | Eisenhower matrix, recurrence | **Drawer overlay uses own scroll (exception) |
| **Messaging** | `fileMessages` + org rules | Quick panel / file UI | Messages list inside panel; page still `<main>` | Thread send/read | |
| **Documents / library** | `_storage` + doc records | `/documents`, panels | `<main>` + bounded panel scrollports | Upload/link | |
| **Portal** | Client grant + portal routes | `/portal/*` | Portal shell (`AppChrome` client portal variant) | Invite/magic link flows | Constrained surface |
| **Automations** | `userSimpleWorkflows` + executors | Settings / admin UIs | `<main>` | Trigger→action | Pair with webhook policy |
| **Webhooks** | Outbound subscription tables + workers | Admin/debug (where present) | N/A (server) | Enqueue/delivery | |
| **Shared field bus** | `fileSharedState`, overrides | Block UIs inside file | N/A | Normalize deal numerics across blocks | |
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

---

## Related

- `duplicate-system-watchlist.md`
- `state-ownership-map.md`
- `route-ownership-map.md`
- `runtime-workspace-scroll-authority.md`
