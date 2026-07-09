# Phase 17 — UI Migration Plan (from 17.0 audit)

**Status:** Phase **17 UI track COMPLETE** (17.0 → 17.4). Phase **17.5 experience audit COMPLETE** (read-only). **STOP** — await operator review before **Phase 18** implementation.  
**Evidence:** `migration-reports/phase17-step1-stabilization.json`, `phase17-step2-rows.json`, `phase17-step3-headers.json`, `phase17-step4-mobile.json`, **`phase17-5-product-experience-audit.json`**  
**Inputs:** `docs/ui-audit-*.md`, `docs/ux-audit-*.md`, `migration-reports/phase17-ui-audit.json`

## Principles

1. **Stabilize overlays and z-index before cosmetic token sweeps**
2. **Mobile-safe pipeline hub before table column redesign**
3. **Extract presentational shells without moving Convex wiring**
4. **Preserve** hub virtualization and file workspace scroll contract
5. **No** ACL, graph, events schema, or hierarchy logic changes in 17.x UI program

---

## 1. Critical fixes first (17.1a) — **COMPLETE**

| # | Item | Status |
|---|------|--------|
| 1 | Inspector z-index → `Z_LAYER.INSPECTOR` (45) | **COMPLETE** — `RecordInspectorShell.tsx` |
| 2 | Legacy modal z-index → `OverlayShell` / `MODAL` tier | **COMPLETE** — `AttachmentPreviewDialog.tsx` (+ 2 pipeline dialogs) |
| 3 | Help center z-tier (48) below command (52) / toast (60) | **COMPLETE** — `HelpCenterPanel.tsx`, `layering.ts`, `globals.css` |
| 4 | Vaul + inspector drag-lock (pre-existing) | **UNCHANGED** — documented in 17.0 audit |
| 5 | Mobile input font ≥16px (iOS zoom) | **COMPLETE** — `Input.tsx`, inline editors, hub sort selects |
| 6 | Hub header horizontal overflow | **COMPLETE** — `PipelinePageClient.tsx` stage chips wrap |

---

## 2. Safe component migration order

| Step | Component | Action |
|------|-----------|--------|
| 1 | `EventCollaboratorRoleBadge` | Merge into shared role badge map |
| 2 | `hubRowActionPrimitives` | Rename/export as `ActionSuite` (no behavior change) |
| 3 | `SharedResourceRow` | Wrap with `RowShell` slots (markup only) — **COMPLETE (17.2)** |
| 4 | `PipelineHubFileRow` / mobile card | Align to `RowShell` |
| 5 | `HubModalShell` / `PortalOverlayPanel` | `OverlayShell` wrapper |
| 6 | Sharing panels | Shared presentational list+form |
| 7 | `ProgressiveDisclosureCard` | Task drawer sections |
| 8 | `PipelineTableRow` | Last — inline commit coupling |

---

## 3. Highest regression-risk surfaces

1. `components/PipelineFileWorkspace.tsx`
2. `app/pipeline/PipelinePageClient.tsx`
3. `components/pipeline/PipelineTableRow.tsx`
4. `components/RecordInspectorShell.tsx`
5. `components/TaskDrawer.tsx`
6. `components/PipelineWorkspaceMobileVaulFrame.tsx`
7. `components/AppChrome.tsx`

---

## 4. Shared component strategy

- **One overlay registry** — `lib/ui/layering.ts` + thin `OverlayShell`
- **One row contract** — `RowShell` with leading / title / metadata / actions slots
- **One action cluster** — `ActionSuite` from hub primitives
- **One sharing UI** — presentational; mutations stay in route modules
- **Ownership** — keep `ResourceOwnershipLine` + unified role badge

---

## 5. Overlay normalization strategy

1. Inventory gate: no new `fixed inset-0` without `OverlayShell`
2. Map `SHELL_Z` numeric tiers into `Z_LAYER` (or document explicit overrides)
3. Portal all anchored menus (intake tail)
4. Scrim: `overlayScrimClass()` only; panels: `overlaySurfaceClass()`
5. Stack depth API from `overlayStack.ts` for nested opens

---

## 6. Responsive stabilization sequence

| Phase | Route / surface |
|-------|-----------------|
| 17.1b-1 | `/events`, `/events/[id]` — verify 3A layout |
| 17.1b-2 | `/shared`, `/tasks` drawer |
| 17.1b-3 | `/pipeline` hub — toolbar collapse + filter sheet |
| 17.1b-4 | `/pipeline` table — horizontal scroll container |
| 17.1b-5 | `/pipeline/[fileId]` — sticky + Vaul |
| 17.1b-6 | `/contacts`, `/lenders` |

---

## 7. Header compression sequence

1. Task drawer → default-collapsed secondary sections — **COMPLETE (17.1 + 17.3 compressed header)**
2. Pipeline file shell → single-line primary header — **COMPLETE (17.3)**
3. Pipeline hub → icon rail (`max-md`) — pending 17.4+
4. Event detail → collaborator chips in disclosure panel — **COMPLETE (17.3)**
5. Intake → `ProgressiveDisclosureCard` for analysis blocks — pending

---

## 8. Progressive disclosure rollout

| Surface | Primitive |
|---------|-----------|
| Task drawer | `CollapsibleSection` + defaults closed |
| File workspace blocks | Existing collapse registry |
| Hub filters | Mobile sheet (exists) |
| Secondary meta | `ProgressiveDisclosureCard` |

---

## 9. Mobile-first stabilization order

1. Viewport/safe-area pass on fixed drawers — **COMPLETE (17.4)**
2. Touch targets on all hub actions (`max-md` rule) — **COMPLETE (17.4)**
3. Pipeline table scroll model — unchanged (hub virtualized table)
4. Inspector + Vaul interaction QA — **COMPLETE (17.4 nested scroll + safe-area)**
5. Events + tasks mobile smoke — operator proof pending
6. Tablet (`md`–`lg`) sidebar/nav sheet — pending future pass

---

## Phase 17.2 delivered (operator review)

**Shipped:**

- `RowShell` layout primitive — left / primary (truncate + tooltip) / metadata (single-line) / trailing / hover-revealed `ActionSuite`
- Unified row hover: `hover:bg-dlc-surface-low/50` + `group/row-shell` action opacity reveal
- **Pipeline hub hierarchy:** client + project header rows → `RowShell`
- **Tasks:** `TaskRow` → `RowShell` + `ActionSuite` (open/delete icons)
- **Shared:** `SharedResourceRow` → dense `RowShell` list row
- `HubHierarchyRowActions` → native `ActionSuite` (no `hubRowActionPrimitives` div shim)

**Unchanged (17.2 scope boundary):**

- `PipelineHubVirtualizedLists` estimator / row height contract
- `PipelineTableRow` (14-column table)
- Hub loan stack lines (`LoanStackRow`)

---

## Phase 17.3 delivered (operator review)

**Shipped:**

- `HeaderDisclosureToggle` + `HeaderDisclosurePanel` — grid-based expand/collapse (no layout thrash)
- `DropdownMenu` / `DropdownMenuItem` — DLC tokens, `Z_LAYER.DROPDOWN`
- `disclosureChevronClass` + `pipelineWorkspaceChevronTransition` → **200ms** chevron rotation
- **Pipeline file workspace:** `h-9` single-line chrome (name, owner chip, stage); secondary meta + scheduling/snooze in disclosure; overflow menu consolidates archive/share/delete/utilities; removed duplicate utility rail
- **Task drawer:** compressed inspector header + disclosure for ownership/type/category/quadrant/snooze
- **Event detail:** compressed sticky header + disclosure for status/collaborators; overflow menu for share/duplicate/archive/delete

**Guardrails honored:**

- `usePipelineFileWorkspaceData` — **not modified**
- Disclosure uses local `useState` only; lazy mount after first open preserves lower workspace inputs

---

## Phase 17.4 delivered (operator review)

**Shipped:**

- `lib/ui/touchTarget.ts` — 44px mobile hit areas (`touchTargetIconClass`) on `ActionSuite`, header disclosure, overflow menus
- `[data-nested-scroll]` + `touch-scroll-y` on inspector body, file activity log, lender search lists, event detail panel
- `[data-app-shell-root]` mobile `overflow-x: hidden` on AppChrome / pipeline hub / file workspace shells
- Record inspector sheet: `safe-area-inset-top` / `safe-area-inset-bottom` padding on mobile
- Responsive behavior remains **CSS media-query first** (no new window resize listeners)

---

## 10. Post–Phase 17 visual refinement (backlog)

1. Token sweep: `shadow-dlc-*`, `rounded-dlc-*` on hub cards
2. Typography: page titles → `text-dlc-title-*`
3. Surface classes on cards/panels
4. Hover/motion tokenization on lists
5. Dark/SaaS parity pass
6. Remove remaining `shadow-sm` clusters

---

## Phase 17.1 delivered (operator review)

**Shipped:**

- Unified `Z_LAYER` map (`INSPECTOR`, `HELP`, `SHEET`, `PRODUCT_TOUR`) + `OVERLAY_Z_BASE` sync
- `OverlayShell` + migrations: `AttachmentPreviewDialog`, `NewPipelineFileDialog`, `NewPipelineHierarchyCreateDialog`
- `ActionSuite` (+ `hubRowActionPrimitives` re-exports)
- `lib/ui/roleBadgeTokens.ts` — collaborator + resource type badges
- Task drawer: done/archived sections default collapsed
- Hub header: no horizontal scroll on narrow viewports

**Out of scope for 17.1 (unchanged):**

- Pipeline 14-column table redesign
- `PipelineFileWorkspace` block registry refactor
- Intake visual overhaul
- Calendar/print/events Step 4+ features

---

## Phase 17.5 — Product experience audit (READ-ONLY) — **COMPLETE**

**Deliverables:** `docs/ux-audit-*.md` (sections A–K), `docs/phase18-experience-reconstruction-plan.md`, `migration-reports/phase17-5-product-experience-audit.json`

**Scope:** Operational UX systems — IA, hierarchy psychology, projection modes, density, interaction, navigation, visual language, mobile, scalability, workspace focus, component systemization. **No** feature expansion, backend/ACL/schema changes, or production deploy.

**Validation:** `npm run convex:codegen` + `npm run build` only.

**Next:** Operator review → **Phase 18** per `docs/phase18-experience-reconstruction-plan.md` (not started).

---

## STOP gate

- 17.0 audit ✓
- **17.1 complete** — production: https://dlcfunds.vercel.app
- **17.2 complete** — production: https://dlcfunds.vercel.app (see `phase17-step2-rows.json`)
- **17.3 complete** — production: https://dlcfunds.vercel.app (see `phase17-step3-headers.json`)
- **17.4 complete** — production: https://dlcfunds.vercel.app (see `phase17-step4-mobile.json`)
- **17.5 experience audit ✓** — read-only; see `phase17-5-product-experience-audit.json`
- **Phase 17 program closed** — Phase 18 requires new operator approval
