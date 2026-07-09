# Phase 24.4E — Layout Shift Forensics

**Date:** 2026-05-28  
**Status:** Investigation harness shipped — **no permanent fixes**  
**Prior finding:** Phase 24.4D Step 1 proved **`OperationalOrientationStrip` is NOT the root cause** (jump persists with strip removed from DOM). Do not continue investigating the strip.

---

## Objective

Capture **actual DOM movement** during pipeline scroll — not scroll listeners, not sticky theory alone. Classify whether the jump is caused by:

| Code | Cause |
|------|-------|
| **A** | DOM height change |
| **B** | Programmatic scroll position write |
| **C** | Browser scroll anchoring |
| **D** | React remount / key change |
| **E** | Something else |

---

## Enable the harness

From `/pipeline` or `/pipeline/[fileId]`:

```js
localStorage.setItem("dlc-pipeline-layout-debug", "1");
location.reload();
// or one-shot: /pipeline?pipelineLayoutDebug=1
```

Console API: **`window.__PIPELINE_LAYOUT_DEBUG`**

| Method | Purpose |
|--------|---------|
| `snapshot()` | Full state: event counts, recent events, watched heights |
| `recentShifts()` | Layout-shift entries only |
| `clear()` | Reset event buffer |
| `enableScrollAnchorOff()` | Step 5 — toggle `overflow-anchor: none` on hierarchy root |
| `disableScrollAnchorOff()` | Revert Step 5 test |

Export after reproducing jump:

```js
copy(JSON.stringify(window.__PIPELINE_LAYOUT_DEBUG.snapshot(), null, 2));
```

---

## Instrumentation (Steps 1–4)

### Step 1 — Layout shift (`PerformanceObserver`)

**File:** `lender-app/lib/debug/pipelineLayoutDebug.ts` (~192–224)

Observes `layout-shift` entries. Each `LAYOUT_SHIFT` event logs:

- `at` — timestamp
- `value` — CLS contribution
- `hadRecentInput` — user input within 500ms (often true during scroll)
- `sources[]` — affected node label, `previousRect`, `currentRect`

### Step 2 — Height mutations (`ResizeObserver`)

**File:** `lender-app/lib/debug/pipelineLayoutDebug.ts` (~227–277)

Watched targets:

| Key | Selector |
|-----|----------|
| `pipeline-page-root` | `[data-pipeline-page-root]` |
| `pipeline-hub-hierarchy` | `[data-pipeline-hub-hierarchy]` |
| `pipeline-hub-hierarchy-row` | `[data-pipeline-hub-hierarchy] > section` (dynamic attach) |
| `pipeline-filter-card` | `[data-pipeline-page-root] .rounded-xl.border.shadow-sm` |
| `pipeline-hub-toolbar` | `[data-pipeline-page-root] .relative.z-10.shrink-0` |
| `pipeline-board-scroll` | `[data-testid="pipeline-board-scroll"]` |
| `app-main-scroll` | `[data-app-main-scroll]` |

Each `HEIGHT_CHANGED` logs: element key, old/new height, delta.

### Step 3 — Scroll writes (patched APIs)

**File:** `lender-app/lib/debug/pipelineLayoutDebug.ts` (~279–364)

Patches:

- `Element.prototype.scrollTop` setter
- `Element.prototype.scrollLeft` setter
- `Element.prototype.scrollIntoView`
- `window.scrollTo`

Each `SCROLL_WRITE` includes stack trace (8 frames).

### Step 4 — React remount probes

**Files:**

- `lender-app/lib/debug/pipelineLayoutRemountProbe.ts`
- `lender-app/components/pipeline/PipelineHubHierarchyView.tsx` — root, `ClientSection`, `ProjectSection`
- `lender-app/components/pipeline/PipelineHubFileRow.tsx`

Each mount/remount logs `COMPONENT_REMOUNT` with `component`, `instanceKey`, `mountGeneration`, `isRemount`.

**Mount point:** `PipelineLayoutDebugMount` in `PipelinePageClient.tsx` and `PipelineFileWorkspace.tsx`.

---

## Step 5 — CSS scroll anchoring audit

### Static audit

| Element | `overflow-anchor` | File / lines |
|---------|-------------------|--------------|
| `[data-app-main-scroll]` | **`none`** | `lender-app/app/globals.css` ~674–676 |
| `[data-pipeline-workspace-scroll]` | **`none`** | same block |
| `[data-nested-scroll]` | **`none`** | `globals.css` ~697–699 |
| AppChrome header bands | **`none`** (Tailwind) | `AppChrome.tsx` ~291, ~429 |
| File workspace sticky header | **`none`** (Tailwind) | `PipelineFileWorkspaceShell.tsx` ~139 |
| Operational disclosure panels | optional `[overflow-anchor:none]` | `OperationalDisclosure.tsx` ~102 |
| **Hub hierarchy root** | **default (`auto`)** | `PipelineHubHierarchyView.tsx` ~792–796 — no explicit anchor rule |

**Implication:** On hub `/pipeline`, the scroll owner (`<main data-app-main-scroll>`) already disables anchoring for the scrollport. Step 5 tests whether **hierarchy subtree** anchoring still affects perceived jump when content height changes inside `<main>`.

### Runtime test (debug only)

```js
window.__PIPELINE_LAYOUT_DEBUG.clear();
// reproduce jump while scrolling
window.__PIPELINE_LAYOUT_DEBUG.enableScrollAnchorOff();
// reproduce same scroll gesture
// compare recentShifts() and subjective jump
```

CSS (opt-in via `html[data-pipeline-layout-debug-anchor-off="true"]`):

```css
/* globals.css — Phase 24.4E */
html[data-pipeline-layout-debug-anchor-off="true"] [data-pipeline-hub-hierarchy] {
  overflow-anchor: none;
}
```

**Record:** Does jump disappear with anchor off? YES / NO.

---

## Reproduction protocol

1. Enable layout debug (above).
2. Open `/pipeline` — table/hierarchy view, utilities collapsed (default).
3. **Scenario A — continuous scroll:** scroll `<main>` for 30+ seconds through a long client list.
4. **Scenario B — expand/collapse:** toggle client and project chevrons while mid-scroll.
5. **Scenario C — focus return:** navigate into a file, back to hub (triggers focus row logic).
6. After each scenario: `snapshot()` → note first events in the 500ms window around the felt jump.

### Event correlation (read order)

When jump is felt, check which fired **first** in the buffer:

```
HEIGHT_CHANGED (hierarchy / row / main)
  → likely **A**
SCROLL_WRITE (scrollTop / scrollIntoView / scrollTo)
  → likely **B**
LAYOUT_SHIFT with sources pointing at hierarchy nodes, no SCROLL_WRITE
  → **A** or **C** (use Step 5 to split)
COMPONENT_REMOUNT with isRemount: true during passive scroll
  → likely **D**
None of the above but LAYOUT_SHIFT on sticky/header nodes
  → **E** (layout outside watched heights — extend selectors)
```

---

## Static suspects (code map)

### Ruled out

| Suspect | Evidence |
|---------|----------|
| **OperationalOrientationStrip** | 24.4D Step 1 — strip omitted from DOM; jump **still occurs** |
| **Scroll compression / compact chrome** | 24.4B removed; jump persists |
| **Virtualization on hub** | `PipelineHubVirtualizedLists.tsx` unwired; full DOM via `PipelineHubHierarchyView` |

### Primary suspect — **A: DOM height change**

Hierarchy expand/collapse **inserts/removes** large DOM subtrees synchronously (no height animation — pure layout reflow):

| Location | File | Lines | Event |
|----------|------|-------|-------|
| Project loans panel | `PipelineHubHierarchyView.tsx` | **499–563** | `{expanded && (<div>…loans…</div>)}` |
| Client projects panel | `PipelineHubHierarchyView.tsx` | **698–722** | `{expanded && (<div>…projects…</div>)}` |
| Chevron rotate | same file | **382–384**, **643–645** | `transition-transform` only (not height) |

**Expected sequence (expand while scrolled):**

1. `HEIGHT_CHANGED` on `pipeline-hub-hierarchy` and/or `pipeline-hub-hierarchy-row`
2. `LAYOUT_SHIFT` with sources on `section` or inner `div` rects shifting vertically
3. Possibly **no** `SCROLL_WRITE` if jump is pure reflow

### Secondary suspect — **B: scroll position write**

| Location | File | Lines | Trigger |
|----------|------|-------|---------|
| Focus row scroll | `PipelinePageClient.tsx` | **1064–1075** | `hubFocusFileId` → `scrollIntoView({ block: "center", behavior: "auto" })` after 80ms |
| Projection mode change | `PipelinePageClient.tsx` | **1582–1588** | `withOperationalScrollPreserved(() => setProjectionMode(...))` |
| Scroll restore impl | `scrollContinuity.ts` | **53–88** | `restoreOperationalScrollTop` sets `root.scrollTop` in rAF (double frame) |

**Expected sequence (focus return / mode change):**

1. `SCROLL_WRITE` `scrollIntoView` or `scrollTop` with stack through `PipelinePageClient` or `scrollContinuity.ts`
2. May precede or follow `LAYOUT_SHIFT` depending on timing

### **C: Browser scroll anchoring**

Less likely on hub because **main scrollport already has `overflow-anchor: none`**. Still test Step 5 — if jump persists with anchor off on hierarchy, **C is ruled out** for hub.

### **D: React remount**

Row keys are stable (`client.clientId`, `project.projectId`, `loan.row._id`). Remount during **passive scroll** would be unexpected unless:

- Parent re-render replaces `clients` array identity and keys change
- Filter/projection swap remounts entire hierarchy

Probe will log `COMPONENT_REMOUNT` with `isRemount: true` if instance remounts without key change (same key, new fiber).

---

## Preliminary classification (static + 24.4D)

**Runtime capture required to finalize.** Based on code structure and Step 1 isolation:

| Cause | Preliminary verdict | Confidence |
|-------|---------------------|------------|
| **A — DOM height change** | **Leading** for expand/collapse and possibly scroll-past-expanding-rows | High for expand; medium for passive scroll |
| **B — Scroll write** | **Leading** for file-return / focus-row / projection switch | High for those flows only |
| **C — Scroll anchoring** | **Unlikely on hub main** (already `none`); test hierarchy override | Low–medium until Step 5 run |
| **D — React remount** | **Unlikely** unless logs show remount during passive scroll | Low until runtime |
| **E — Other** | Sticky bands other than orientation strip, font/layout async, Convex list refresh reshaping rows | TBD |

### Most likely split by scenario

| User scenario | Best hypothesis |
|---------------|-----------------|
| Jump while **scrolling through list** (no click) | **A** or **E** (async data refresh changing row heights) — use `HEIGHT_CHANGED` + `LAYOUT_SHIFT` |
| Jump on **expand/collapse** | **A** (confirmed mechanism in code) |
| Jump on **return from file** / deep-linked row | **B** (`scrollIntoView` at `PipelinePageClient.tsx:1069`) |
| Jump on **projection mode** switch | **B** (`withOperationalScrollPreserved` at `PipelinePageClient.tsx:1584`) |

---

## Runtime results (fill after local test)

| Scenario | First event type | Affected node / stack | Cause letter |
|----------|------------------|----------------------|--------------|
| Continuous scroll | _pending_ | | |
| Expand client | _pending_ | | |
| Expand project | _pending_ | | |
| File → back to hub | _pending_ | | |
| Step 5 anchor off | Jump gone? _YES/NO_ | | |

### Exact source (complete when runtime confirms)

| Field | Value |
|-------|-------|
| **Root cause letter** | _A / B / C / D / E_ |
| **Moving on screen** | _e.g. `[data-pipeline-hub-hierarchy] > section`_ |
| **File** | _e.g. `PipelineHubHierarchyView.tsx`_ |
| **Line** | _e.g. 499_ |
| **Event sequence** | _e.g. HEIGHT_CHANGED → LAYOUT_SHIFT (no SCROLL_WRITE)_ |

---

## Files touched (24.4E harness only)

| File | Change |
|------|--------|
| `lib/debug/pipelineLayoutDebug.ts` | Layout-shift, ResizeObserver, scroll patches, global API |
| `lib/debug/pipelineLayoutRemountProbe.ts` | Remount hook |
| `components/debug/PipelineLayoutDebugMount.tsx` | Opt-in mount |
| `components/pipeline/PipelineHubHierarchyView.tsx` | Remount probes |
| `components/pipeline/PipelineHubFileRow.tsx` | Remount probe |
| `app/pipeline/PipelinePageClient.tsx` | Debug mount |
| `components/PipelineFileWorkspace.tsx` | Debug mount |
| `app/globals.css` | Debug-only hierarchy `overflow-anchor: none` |

**Not deployed to production** — local/preview investigation tooling. No behavioral fixes.

---

## Next step after runtime (24.4F — not started)

Once one row in **Runtime results** confirms cause letter with event sequence:

- **A** → 24.4D Step 2 (hierarchy motion / expand layout) or min-height reservation strategy
- **B** → 24.4D Step 3 (gate `scrollIntoView` / `withOperationalScrollPreserved`)
- **C** → permanent hierarchy anchor policy (only if Step 5 proves it)
- **D** → stabilize keys / memo boundaries
- **E** → extend watchers to new selector from `LAYOUT_SHIFT.sources`

---

*Phase 24.4E — layout shift forensics. Investigation only; no fixes until runtime table is complete.*
