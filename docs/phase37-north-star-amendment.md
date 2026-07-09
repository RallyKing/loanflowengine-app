# Phase 37.11 — North Star Blueprint Amendment (7-Tab Floor Plan)

**Date:** 2026-06-23  
**Status:** **Accepted and shipped** — definitive product/architecture record for Phase 37.10–37.11  
**Production:** https://dlcfunds.vercel.app  
**Supersedes:** Pre-37.10 blueprint (Underwriting-only Tab 6); Phase 37.10 interim (6-tab with Underwriting on Overview tail).

**Related artifacts:**

- `docs/phase37-workspace-validation-summary.md` — validation ledger, circuit breakers, Playwright coverage  
- `docs/phase37-underwriting-ledger-audit.md` — pre-37.10 Tab 6 analysis (historical)  
- `docs/phase37-macro-alignment-audit.md` — macro gap audit (refresh tab ledger on next macro pass)  
- `docs/ux-audit/future-state-platform-vision.md` — platform north star (amend Tab 6/7 semantics on next vision sync)

---

## 1. Executive decision

Phase 37.11 **finalizes the file-workspace tab floor plan** after the Phase 37.10 admin consolidation sprint:

| Era | Tab 6 (index 5) | Tab 7 (index 6) | Overview (Tab 1) |
|-----|-----------------|-----------------|------------------|
| Pre-37.10 blueprint | Underwriting | *(none / placeholder)* | Operational blocks only |
| Phase 37.10 interim | Settings | *(none)* | Underwriting ledger **tail** (`trailingPanel`) |
| **Phase 37.11 (authoritative)** | **Underwriting** | **Settings** | Operational blocks only — **no UW tail** |

**Accepted 7-tab Path 1 floor plan:**

- **Overview (Tab 1)** — day-to-day operational context (notes, history, contacts, tasks, lenders).  
- **Underwriting (Tab 6, index 5)** — dedicated `UnderwritingLedgerTab` (action queue, lender track, internal workflow).  
- **Settings (Tab 7, index 6)** — file admin SSOT (layout, sharing, archive, danger zone, history).  
- **Legacy admin surfaces** — suppressed via `HIDE_LEGACY_FILE_ADMIN_SURFACES` (drawer blocks, layout strip, header overflow admin items).

Admin is **not** exposed via Global Banner gear menus.

---

## 2. Accepted 7-tab floor plan

### 2.1 Shell contract (authoritative)

| Index | Tab key | Label | Panel prop | Component |
|-------|---------|-------|------------|-----------|
| 0 | `overview` | File Overview | `overviewPanel` | `OverviewTab` |
| 1 | `dealInfo` | Deal Info | `dealInfoPanel` | `DealInfoTab` |
| 2 | `dealWorkspace` | Deal Workspace | `dealWorkspacePanel` | `DealWorkspaceTab` |
| 3 | `documents` | Documents | `documentsPanel` | `DocumentVaultTab` |
| 4 | `clientPortal` | Client Portal | `clientPortalPanel` | `ClientPortalTab` |
| 5 | `underwriting` | **Underwriting** | `underwritingLedgerPanel` | `UnderwritingLedgerTab` |
| 6 | `settings` | **Settings** | `settingsPanel` | `SettingsTab` |

**Shell:** `components/pipeline/FileWorkspaceTabShell.tsx` (`FILE_WORKSPACE_TAB_IDS`)  
**Orchestrator:** `components/PipelineFileWorkspace.tsx`  
**Anchors / deep links:** `lib/pipeline/fileWorkspaceTabRouting.ts`

**Playwright test ids:**

- Tab nav: `pipeline-file-tab-{tabId}` (e.g. `pipeline-file-tab-underwriting`, `pipeline-file-tab-settings`)  
- Tab panels: `pipeline-file-tabpanel-{tabId}`  
- Underwriting root: `pipeline-underwriting-ledger-tab`  
- Settings root: `pipeline-settings-tab`

### 2.2 Tab 1 — Overview (operational only)

**Component:** `components/pipeline/tabs/OverviewTab.tsx`

Sections: notes, file history, contacts, tasks, lenders.

**Phase 37.11 change:** `trailingPanel` / Underwriting tail **removed**. Overview is intentionally lean; underwriting visibility lives on Tab 6.

### 2.3 Tab 6 — Underwriting (`UnderwritingLedgerTab`)

**Index 5** — restored dedicated tab in Phase 37.11.

| Section | Test id anchor |
|---------|----------------|
| Action queue | `pipeline-underwriting-action-queue` |
| Lender track | `pipeline-underwriting-lender-track` |
| Internal workflow | `pipeline-underwriting-internal-workflow` |

Read-model orchestrator; mutations remain elsewhere (tasks, lenders, portal).

### 2.4 Tab 7 — Settings (`SettingsTab`)

**Index 6** — admin SSOT from Phase 37.10.B (unchanged internally).

| Section anchor | Content |
|----------------|---------|
| `pipeline-settings-history` | File activity |
| `pipeline-settings-layout` | Layout & defaults |
| `pipeline-settings-sharing` | Pipeline file access (ACL) |
| `pipeline-settings-archive` | Archive / restore |
| `pipeline-settings-danger-zone` | Delete file |

**Mutation ownership:** `PipelineFileWorkspace.tsx` (`toggleArchive`, `openFileDeleteConfirm`, layout debounce). SettingsTab is presentation-only.

---

## 3. Circuit breaker policy (unchanged — Phase 37.10)

**Constant:** `HIDE_LEGACY_FILE_ADMIN_SURFACES = true`  
**Module:** `lib/pipeline/fileWorkspaceLegacyVisibility.ts`

| Helper | Suppressed surface |
|--------|-------------------|
| `isLegacyFileAdminDrawerBlockHidden()` | Drawer blocks: `people`, `archive`, `dangerZone` |
| `isLegacyFileAdminLayoutStripHidden()` | `drawer-layout-defaults` layout strip |
| `isLegacyFileAdminHeaderOverflowHidden()` | Header ⋮: Manage sharing, Archive/Restore, Delete file… (**mobile and desktop**) |

**Remains visible:** Workspace utilities (header ⋮).

**Deep-link behavior:** `people` / `archive` / `dangerZone` → tab key `settings` (Tab 7) + section anchor scroll.

---

## 4. Known overlap — product backlog

### 4.1 File history (low priority)

`PipelineFileActivityPanel` on **Overview** (`pipeline-overview-activity`) and **Settings** (`pipeline-settings-history`). Intentional overlap pending product dedupe (`P37-10-OVERLAP-HISTORY`).

### 4.2 Client-side delete permission UX (low priority)

Server `assertCanDeletePipelineRow` remains authoritative; optional client `files.delete` gate on Settings delete button.

---

## 5. Rejected / superseded alternatives

| Alternative | Outcome |
|-------------|---------|
| Global Banner gear for file admin | **Rejected** |
| Underwriting only on Overview tail (37.10 interim) | **Superseded** by 37.11 dedicated Tab 6 |
| Settings as sole Tab 6 with no Underwriting tab (37.10.B only) | **Superseded** by 37.11 seven-tab split |
| Legacy drawer admin without circuit breaker | **Rejected** |

---

## 6. Blueprint sync checklist

- [ ] `docs/ux-audit/future-state-platform-vision.md` — 7-tab shell; Tab 6 UW, Tab 7 Settings  
- [ ] `docs/phase37-macro-alignment-audit.md` — tab completeness ledger  
- [ ] `docs/phase37-underwriting-ledger-audit.md` — header note: Tab 6 = Underwriting (37.11)  
- [x] `docs/phase37-workspace-validation-summary.md` — Phase 37.11.D  
- [x] `docs/phase37-north-star-amendment.md` — this document  
- [x] `tests/e2e/pipeline-workspace-routing.spec.ts` — 7-tab + breaker Playwright  

---

## 7. Sprint closure statement

**Phase 37.11 Path 1 (7-tab) is shipped:**

- **Overview** — operational context, no underwriting tail  
- **Tab 6 (index 5)** — `UnderwritingLedgerTab`  
- **Tab 7 (index 6)** — `SettingsTab` + legacy admin circuit breaker  
- **GlobalBanner** — unchanged  

**Signed:** Phase 37.11.D — North Star amendment and Playwright baseline recorded.
