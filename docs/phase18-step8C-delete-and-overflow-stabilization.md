## Phase 18.8C — Destructive flow + workspace containment stabilization

**Scope:** Stabilization + execution repair only.

**Explicitly not in scope (unchanged):**
- No schema changes
- No ACL changes
- No graph/index logic changes
- No hierarchy/projection/routing architecture changes
- No sharing logic changes
- No redesign of navigation or motion systems
- Stop after 18.8C (no 18.9 work)

---

## A — Destructive confirmation reliability

### A1 — Modal action layout constraints (no collapse)
**Goal:** Footer controls never compress, never shrink vertically, and remain touch-safe.

Changes:
- `lib/ui/operationalConfirm.ts`
  - footer action layout now uses stable row behavior on `sm+` (`OP_CONFIRM_CANCEL_ZONE`)
  - destructive zone aligns controls without wrapping/compressing (`OP_CONFIRM_DANGER_ZONE`)
- `components/ui/OperationalConfirmDialog.tsx`
  - action buttons now have `shrink-0` and a minimum touch height (`min-h-[var(--dlc-touch-target-min)]`)

### A2 — Deterministic destructive execution state machine
Added:
- `lender-app/lib/ui/operationalMutationState.ts`

Behavior:
- explicit state model (`idle`, `executing`, `success`, `failed`, `timeout`)
- no duplicate submits while busy
- timeout recovery (default 25s) with actionable message
- safe dismiss/cancel: UI can close without frozen overlays; late mutation results are ignored

Integrated into:
- `OperationalConfirmProvider` (central imperative confirm system)

### A3 — Error surfacing inside the modal
- execution wrapper uses `convexClientErrorMessage(...)` + classification
- modal remains usable after failures (retry works; cancel works)

### A4 — Overlay + stacking repair
- Added a single operational layer map: `lender-app/lib/ui/operationalLayers.ts`
- Migrated an ad-hoc modal overlay in `components/intake/Dashboard.tsx` to use `layerZIndexStyle("MODAL")`
- `components/ui/OverlayShell.tsx` bottom-sheet panel now uses `overflow-y-hidden` so children can own sticky footers and internal scroll regions (prevents footer compression under long content)

---

## B — Pipeline workspace overflow containment

### B1 — Overflow forensics
Documented in:
- `docs/phase18-step8C-overflow-forensics.md`

### B2/B3 — Board containment repair (horizontal reachability)
- `app/pipeline/PipelinePageClient.tsx`
  - board view is now wrapped in a dedicated horizontal scroll container (`overflow-x-auto touch-pan-x`)
  - hub reveal container uses `overflow-x-clip` (prevents hard clipping traps while maintaining containment)
- `components/pipeline/PipelineBoardView.tsx`
  - reinforced touch horizontal pan (`touch-pan-x`) on the board scroller

Scroll ownership remains unchanged: board is **horizontal** scrolling inside the hub; vertical remains with `<main>`.

---

## Validation

Ran (local):
- `npm run build` ✅
- `npm run qa:governance` ✅
- `npm run deploy:prod` ✅

Convex deploy:
- `npm run convex:deploy:prod` ❌ blocked: “You don't have access to the selected project. Run \`npx convex dev\` to select a different project.”
  - Note: 18.8C changes are UI-only (no `convex/` edits), but the command was executed as required and is currently blocked by local Convex project access.

Production deploy (Vercel):
- Alias: `https://lender-app-zeta.vercel.app`
- Deployment id: `dpl_8utVhESq1mAGLjfyF1fBKuXp6YCa`
- Inspect: `https://vercel.com/joshua-4539s-projects/lender-app/8utVhESq1mAGLjfyF1fBKuXp6YCa`

---

## Manual prod smoke checklist (must verify)
1. Delete client with nested projects
2. Delete project with files
3. Delete pipeline file from workspace
4. Cancel during pending delete
5. Retry after forced failure
6. Mobile delete dialog (safe-area + footer stability)
7. Mobile bottom nav (safe-zone)
8. Pipeline board horizontal scrolling (touch pan-x)
9. Sticky headers during board scroll
10. No bleed-through under overlays
11. No clipped board columns
12. No inaccessible content regions

---

## Files added/updated

Added:
- `lender-app/lib/ui/operationalMutationState.ts`
- `lender-app/lib/ui/operationalLayers.ts`
- `docs/phase18-step8C-overflow-forensics.md`
- `docs/phase18-step8C-delete-and-overflow-stabilization.md`

Updated:
- `lender-app/components/ui/OperationalConfirmDialog.tsx`
- `lender-app/lib/ui/operationalConfirm.ts`
- `lender-app/components/ui/OverlayShell.tsx`
- `lender-app/app/pipeline/PipelinePageClient.tsx`
- `lender-app/components/pipeline/PipelineBoardView.tsx`
- `lender-app/components/intake/Dashboard.tsx`

