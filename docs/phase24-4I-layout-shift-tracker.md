# Phase 24.4I — Hub Layout Shift Tracker & Scroll Stabilization

**Date:** 2026-05-28  
**Context:** Phase 24.4H (`vh` → `dvh`) did not fix mobile scroll jump. Rogue JS scroll writes, nested scrollports, and mobile chrome listeners are ruled out. Remaining hypothesis: **pure layout shift** inside `[data-app-main-scroll]` while scrolling `/pipeline`.

---

## What shipped

### Step 1 — Real-time layout shift tracker

- **`lib/debug/pipelineHubLayoutShiftTracker.ts`** — `ResizeObserver` on every descendant of `[data-pipeline-hub-list="hierarchy"]`.
- Wired from **`PipelinePageClient.tsx`** via `usePipelineHubLayoutShiftTracker(hubListRef, …)`.
- After each element’s **first** height sample, any ≥1px change logs:

```text
console.warn("[LAYOUT SHIFT DETECTED]", <descriptor>, element, "Old:", n, "New:", m, "Δ…")
```

Descriptor includes `data-testid`, `data-pipeline-hub-component`, `data-pipeline-row`, and nearest **React component name** (from fiber).

**Console API:** `window.__PIPELINE_HUB_LAYOUT_SHIFT_TRACKER.stats()` — `{ observedElements, shiftWarnings }`.

### Step 2 — Lifecycle / animation stabilization (temporary)

Flags in **`lib/debug/phase24-4I-hub-stabilization.ts`** (all `true` in this deploy):

| Flag | Effect |
|------|--------|
| `omitEntryAnimations` | `OperationalContentReveal` renders instantly (no opacity fade) |
| `forceFullHierarchyMount` | Client/project nested rows always mount (`hubHierarchySectionVisible`) |
| `omitHierarchyExpandMotion` | Chevron `transition-transform` removed on hierarchy + projection rows |

**Audit:** No `next/image` / `<img>` on hub hierarchy path. No `IntersectionObserver` on hub list (only `PipelineMobileWorkspaceOpsRail` on file workspace). Conditional `{expanded && …}` was the main mount/unmount height driver — bypassed while `forceFullHierarchyMount` is on.

### Step 3 — CSS layout containment

When `layoutContainment: true`, `PipelinePageClient` sets `html[data-pipeline-hub-layout-contain="true"]`.

**`globals.css` rules:**

- Client sections: `content-visibility: auto`, `contain-intrinsic-size: 0 120px`, `min-height: 120px`
- Project rows: intrinsic 80px
- Loan rows: intrinsic 56px

---

## Manual test (production)

1. Open https://lender-app-zeta.vercel.app/pipeline on **iPhone Safari** or **Android Chrome**.
2. Open devtools console (remote debug).
3. Fast-scroll hub list up/down.
4. Note any **`[LAYOUT SHIFT DETECTED]`** warnings — record `react=` / `data-testid` / `component=` fields.
5. Run `__PIPELINE_HUB_LAYOUT_SHIFT_TRACKER.stats()` after a scroll session.

**Interpretation:**

- **No warnings + jump gone** → containment + full mount fixed it; narrow which flag can revert.
- **Warnings correlate with jump** → fix the named component (async data, editor mount, triage chrome, etc.).
- **Warnings + jump persists** → shift may be outside hub list (filters, batch bar, chrome) — extend observer to `[data-pipeline-page-root]`.

---

## Revert

Set flags in `phase24-4I-hub-stabilization.ts` to `false` and redeploy. Remove tracker hook when forensics complete.

---

## Deploy

**Production:** https://lender-app-zeta.vercel.app  
**Deployment:** `dpl_GPuYJuPixK1px2qhZTVYsAwGNpPd` (2026-05-28)
