# Phase 37.11 — File Workspace Validation & 7-Tab Architecture Summary

**Date:** 2026-06-23  
**Status:** **Phase 37.11 complete** — 7-tab shell shipped; Settings on Tab 7; Underwriting restored on Tab 6; Playwright routing baseline added  
**Scope:** File workspace tab shell, Settings admin consolidation, Underwriting tab restoration, legacy circuit breakers, E2E regression  
**Production:** https://dlcfunds.vercel.app  

**Supersedes:** Phase 37.10 six-tab interim (Settings-only Tab 6 + Overview underwriting tail).

**Related artifacts:**

- `docs/phase37-north-star-amendment.md` — authoritative 7-tab Path 1 floor plan  
- `tests/e2e/pipeline-workspace-routing.spec.ts` — automated 7-tab + circuit breaker tests  
- `lib/pipeline/fileWorkspaceLegacyVisibility.ts` — circuit breaker constants  

---

## 1. Executive verdict

| Gate | Result | Notes |
|------|--------|-------|
| **7-tab shell expansion (37.11)** | **SHIPPED** | `underwriting` + `settings` as indices 5 and 6 |
| **Underwriting dedicated tab (Tab 6)** | **SHIPPED** | `underwritingLedgerPanel` → `UnderwritingLedgerTab` |
| **Settings tab (Tab 7)** | **SHIPPED** | `settingsPanel` → `SettingsTab` (37.10.B body unchanged) |
| **Overview clean of UW tail** | **SHIPPED** | `trailingPanel` removed from `OverviewTab` |
| **Circuit breaker** | **ACTIVE** | `HIDE_LEGACY_FILE_ADMIN_SURFACES = true` |
| **Playwright (37.11.D)** | **SHIPPED** | `pipeline-workspace-routing.spec.ts` |
| **`npm run build`** | **PASS** | Verified after 37.11 routing |

---

## 2. Seven-tab architecture (authoritative)

### 2.1 Shell contract (`FileWorkspaceTabShell.tsx`)

| Index | Tab key | Label | Panel prop | Component |
|-------|---------|-------|------------|-----------|
| 0 | `overview` | File Overview | `overviewPanel` | `OverviewTab` |
| 1 | `dealInfo` | Deal Info | `dealInfoPanel` | `DealInfoTab` |
| 2 | `dealWorkspace` | Deal Workspace | `dealWorkspacePanel` | `DealWorkspaceTab` |
| 3 | `documents` | Documents | `documentsPanel` | `DocumentVaultTab` |
| 4 | `clientPortal` | Client Portal | `clientPortalPanel` | `ClientPortalTab` |
| 5 | `underwriting` | **Underwriting** | `underwritingLedgerPanel` | `UnderwritingLedgerTab` |
| 6 | `settings` | **Settings** | `settingsPanel` | `SettingsTab` |

- Registry: `FILE_WORKSPACE_TAB_IDS` (7 entries, Phase 37.11)  
- Nav test ids: `pipeline-file-tab-{tabId}`  
- Panel test ids: `pipeline-file-tabpanel-{tabId}`  

### 2.2 Tab 1 — Overview (`OverviewTab.tsx`)

| Section | Content |
|---------|---------|
| Notes | `FileNotesBlock` |
| File history | `PipelineFileActivityPanel` |
| Contacts | CRM block adapter |
| Tasks / Lenders | `FileTasksBlock`, `LenderSummaryBlock` |

**No underwriting content.** Phase 37.11 removed the Phase 37.10 `trailingPanel` / `UnderwritingLedgerTab` tail.

### 2.3 Tab 6 — Underwriting (`UnderwritingLedgerTab.tsx`)

| Section | Test id |
|---------|---------|
| Action queue | `pipeline-underwriting-action-queue` |
| Lender track | `pipeline-underwriting-lender-track` |
| Internal workflow | `pipeline-underwriting-internal-workflow` |

Root: `pipeline-underwriting-ledger-tab`.

Props: `fileId`, `memberUserKey` from `PipelineFileWorkspace.tsx`.

### 2.4 Tab 7 — Settings (`SettingsTab.tsx`)

| Section id | Title | Primary content |
|------------|-------|-----------------|
| `pipeline-settings-history` | File history | `PipelineFileActivityPanel` |
| `pipeline-settings-layout` | Layout & defaults | Drawer layout, collapse behavior, template reset |
| `pipeline-settings-sharing` | Pipeline file access | `PipelineFileSharingSection` |
| `pipeline-settings-archive` | Archive | `pipeline-settings-archive-action` |
| `pipeline-settings-danger-zone` | Danger zone | `pipeline-settings-delete-action` |

Admin mutations remain in **`PipelineFileWorkspace.tsx`** — SettingsTab is unchanged from 37.10.B.

---

## 3. Circuit breakers — `HIDE_LEGACY_FILE_ADMIN_SURFACES`

**Location:** `lib/pipeline/fileWorkspaceLegacyVisibility.ts`  
**Value:** `true`

### 3.1 Suppressed legacy surfaces

| Surface | Enforcement |
|---------|-------------|
| Drawer `people`, `archive`, `dangerZone` | `isLegacyFileAdminDrawerBlockHidden()` |
| Layout strip `drawer-layout-defaults` | `isLegacyFileAdminLayoutStripHidden()` |
| Header ⋮ admin items (mobile + desktop) | `isLegacyFileAdminHeaderOverflowHidden()` |

### 3.2 Remains visible

- **Workspace utilities** in header overflow  
- **GlobalBanner** (unchanged)  
- **Settings tab body** (canonical admin)

### 3.3 Deep-link routing

Admin drawer blocks route to tab key **`settings`** (Tab 7, index 6) with anchors via `settingsAnchorForDrawerBlock()`.

---

## 4. Sprint timeline (historical ledger)

| Phase | Description | Outcome |
|-------|-------------|---------|
| **37.10.B** | Settings tab; admin consolidation; UW on Overview tail; circuit breaker | Shipped |
| **37.10.C** | Read-only audit | CB-01 desktop overflow leak found |
| **37.10.B.FIX** | Desktop header overflow guard | Shipped |
| **37.10.D** | Docs (6-tab interim) | Superseded by 37.11.D |
| **37.11** | 7-tab expansion; UW Tab 6; Settings Tab 7; clean Overview | Shipped |
| **37.11.D** | Docs sync + Playwright | This pass |

---

## 5. Playwright coverage (`pipeline-workspace-routing.spec.ts`)

| Test | Assertion |
|------|-----------|
| Seven tabs visible | 7 `role=tab` buttons with expected labels |
| Overview clean | No `pipeline-underwriting-ledger-tab` on overview panel |
| Underwriting routing | Click `pipeline-file-tab-underwriting` → ledger tab visible |
| Settings smoke | Layout section, archive action, danger zone / delete action |
| Circuit breaker mobile | ⋮ menu: utilities yes; sharing/archive/delete no |
| Circuit breaker desktop | Same at 1280×800 viewport |

**Run:**

```bash
cd lender-app
npm run build
npx playwright test tests/e2e/pipeline-workspace-routing.spec.ts --project chromium
```

Requires Convex URL + workspace auth (`APP_AUTH_USERNAME` / `APP_AUTH_PASSWORD` or E2E sandbox users).

---

## 6. Known overlaps & follow-ups

| Item | Priority | Notes |
|------|----------|-------|
| File history duplicate (Overview + Settings) | P3 | `P37-10-OVERLAP-HISTORY` — product dedupe |
| Underwriting `getDetail` dedupe | P3 | Optional shared provider |
| Client delete permission UX | P3 | Optional pre-click gate |
| Macro alignment doc refresh | P2 | `phase37-macro-alignment-audit.md` still lists early placeholders |

---

## 7. Manual prod smoke (7-tab)

1. Login → open pipeline file  
2. Tab strip shows **7** tabs ending with Underwriting + Settings  
3. Tab 1 Overview — scroll full height — **no** underwriting ledger  
4. Tab 6 Underwriting — action queue + lender track render  
5. Tab 7 Settings — layout, archive, delete sections  
6. Header ⋮ (mobile + desktop) — **Workspace utilities** only  

---

## 8. Verification checklist (Phase 37.11.D)

- [x] Tab 6 (index 5) = `underwriting` / `UnderwritingLedgerTab` documented  
- [x] Tab 7 (index 6) = `settings` / `SettingsTab` documented  
- [x] Overview free of underwriting tail documented  
- [x] Circuit breaker surfaces logged  
- [x] North Star amendment updated (`phase37-north-star-amendment.md`)  
- [x] Playwright spec added (`pipeline-workspace-routing.spec.ts`)  
- [x] No application `.tsx` modified in 37.11.D (docs + tests only)  

**Signed:** Phase 37.11.D — documentation sync and Playwright baseline complete.

---

## 9. Appendix — superseded architectures

### 9.1 Phase 37.10 interim (6-tab)

| Index | Tab key | Notes |
|-------|---------|-------|
| 5 | `settings` | Settings only |
| — | — | Underwriting on Overview `trailingPanel` |

**Superseded by 37.11.**

### 9.2 Phase 37.9 / pre-37.10 (6-tab underwriting)

| Index | Tab key | Notes |
|-------|---------|-------|
| 5 | `underwriting` | No Settings tab |

**Superseded by 37.10 then 37.11.**
