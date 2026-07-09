# Pipeline file write forensics (P0 write storm)

Forensic audit of **every Convex mutation** triggered while an operator opens a pipeline file, idles, resizes, switches tabs, or interacts with layout chrome — without editing deal data.

Instrumentation: `lib/convexWriteStormGovernance.ts` → `window.__dlcWriteStormReport()` / auto-warn when idle file exceeds **2 writes/min** (`FILE_IDLE_MAX_WRITES_PER_MIN`).

Policy: **open file = read subscriptions only**. Allowed writes on open: **zero**, except a single presence registration if absent. **Five minutes idle = absolute zero writes** unless the operator edits persisted data.

---

## Trigger matrix (what we traced)

| Scenario | Expected mutations (post-fix) | Pre-fix behavior |
|----------|----------------------------|------------------|
| Open pipeline file | 0–1 (`presence.heartbeat` registration) | Drawer layout patch storm + `patchDeal` from IntakeEditor hydration |
| Idle 5 minutes | 0–1 (presence heartbeat at 60s cadence) | 3–30/min from layout + deal autosave loops |
| Tab switch (hidden → visible) | 0–1 (`presence.heartbeat` or `clearForUser`) | Heartbeat on every visibility tick |
| Window resize / mobile keyboard | **0** | `patchFileDrawerLayout` on expand/collapse |
| Drawer open/close (expand only) | **0** (localStorage only) | Convex patch + `updatedAt` bump + activity |
| Workspace hydration | **0** | Persist effect fired before hydration guard |
| Live query refresh | **0** | `patchDeal` / termOptions re-sync on `updatedAt` |
| Header compression / scroll | **0** | Drawer expanded state persisted to Convex |
| Presence surface churn | **0** unless field focus changes | Heartbeat keyed to `drawerExpandedKey` |

---

## Ranked offenders (writes/min, pre-fix → post-fix)

Projected monthly cost uses `COST_WEIGHT.mutation` (100 units) × writes/min × 43,200 min/month. Presence uses `COST_WEIGHT.presenceWrite` (80).

| Rank | Mutation | Source component | Reason triggered | Required? | Pre-fix writes/min | Post-fix writes/min | Pre-fix monthly units | Post-fix monthly units |
|------|----------|------------------|------------------|-----------|-------------------|----------------------|----------------------|------------------------|
| **1** | `pipeline.patchFileDrawerLayout` | `PipelineFileWorkspace` | `useEffect` on `drawerLayout` including `expanded` — scroll/header/mobile collapse | **No** (expand is local-only) | **12–40** | **0** idle | **51M–172M** | **0** |
| **2** | `pipeline.patchDeal` | `IntakeEditor` | `useLayoutEffect` applied `fileSectionDefaultMode` defaults, marked dirty, `queueSave()` on every draft load | **No** (only on real diff) | **2–8** | **0** idle | **8.6M–34M** | **0** |
| **3** | `presence.heartbeat` | `usePresence` | Effect deps included volatile drawer keys; visibility debounce | **Yes** (1/min max, surface change, tab visible) | **3–18** | **≤1** | **10M–62M** | **≤3.5M** |
| **4** | `pipeline.patch` (termOptions) | `PipelineFileWorkspace` | Debounced term sync re-fired when `updatedAt` changed from unrelated patches | **No** unless terms changed | **1–4** | **0** idle | **4.3M–17M** | **0** |
| **5** | Activity via drawer layout | `convex/pipeline.ts` | `appendPipelineFileActivity` on drawer order/hidden change | **Yes** on real layout edit only | **0–12** (coupled to #1) | **0** idle | **0–51M** | **0** |
| **6** | `pipeline.initDealDataIfMissing` | `IntakeEditor` | First open when `dealData` empty | **Yes** (once per file) | **0–1** (one-shot) | **0–1** | **≤4.3M** | **≤4.3M** |
| **7** | `presence.clearForUser` | `usePresence` | Tab hidden / unmount | **Yes** | **0–2** | **0–1** | **≤6.9M** | **≤3.5M** |
| **8** | Offline queue flush | `PipelineFileWorkspace` / sync | Hub reconnect | **Yes** (when pending user edits) | **0** idle | **0** idle | **0** | **0** |

**Pre-fix idle total (file open, no edits):** ~20–60 mutations/min → **86M–259M** projected units/month from idle alone (unacceptable).

**Post-fix idle target:** ≤ **2 total writes in 300s** (`PIPELINE_FILE_IDLE_MAX_TOTAL_WRITES`), ≤ **2 writes/min** sustained.

---

## Fixes applied (P0)

### Client

1. **`drawerLayoutConvexPersistKey`** — Convex persist key excludes `expanded`; expand/collapse writes to **localStorage only** (`lib/pipelineDrawerLayoutPersist.ts`).
2. **`PipelineFileWorkspace`** — skip `patchFileDrawerLayout` when persist key unchanged; trace mutations; `setFileRouteActive(true)` for storm detector; presence model decoupled from drawer expand/order.
3. **`IntakeEditor`** — compare workspace/analysis layout before dirty + `queueSave()`; skip noop default-mode application.
4. **`usePresence`** — 60s heartbeat gate, payload dedupe, tab visibility; trace `heartbeat` / `clearForUser`.

### Server

5. **`patchFileDrawerLayout`** — early return (no patch, no `updatedAt`, no activity) when audit targets unchanged (expanded-only delta).

### Guardrails

6. **`window.__dlcWriteStormReport()`** — writes/min, mutation names, duplicate callers, idle violation count, component stacks.
7. **`tests/e2e/pipeline-idle-write-budget.spec.ts`** — open file, idle soak, assert budget.

---

## Operator verification

```js
// After opening a file — reset counter, wait 5 min untouched:
window.__dlcWriteStormReset()
// ... idle 300s ...
window.__dlcWriteStormReport()
// totalWrites <= 2, writesPerMinute <= 2, no patchDeal / patchFileDrawerLayout / activity churn
```

Convex dashboard: mutation graph for `patchFileDrawerLayout`, `patchDeal`, `appendPipeline*` should stay **flat** during idle.

---

## Regression gate

```bash
cd lender-app
npx playwright test tests/e2e/pipeline-idle-write-budget.spec.ts --project=chromium
```

Production soak (`PW_BASE_URL` set): **300s** idle. Local dev: **90s** with slightly relaxed total cap.

---

## Related docs

- `docs/convex-cost-forensics.md` — subscription + broader cost model (Phase 11.1)
- `lib/convexCostBudget.ts` — `FILE_IDLE_MAX_WRITES_PER_MIN`, `PIPELINE_FILE_IDLE_MAX_TOTAL_WRITES`
- `docs/governance/runtime-workspace-scroll-authority.md` — scroll/layout must not trigger persistence
