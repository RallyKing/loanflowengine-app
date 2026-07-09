# Phase 24.4C — Pipeline Scroll Jump Root Cause (Forensics)

**Date:** 2026-05-28  
**Status:** Investigation — **no fixes (24.4D not started)**  
**Context:** Phase 24.4B removed master compression, mobile compact chrome, collapse/reveal grids, file header scale/IO. Jump reportedly **still present**.

---

## Executive conclusion (code evidence, pre-runtime)

After 24.4B, **header compression is no longer a plausible primary cause** on pipeline routes. Static analysis points to **three remaining systems** that can produce scroll jumps with file/line proof:

| Rank | Cause class | Verdict | Primary evidence |
|------|-------------|---------|------------------|
| **1** | **D — Height recalculation** | **Confirmed in code** | Hierarchy expand/collapse inserts/removes DOM synchronously |
| **2** | **A — Sticky inside scroll container** | **Confirmed in code** | `OperationalOrientationStrip` defaults `sticky top-0` inside `<main>` |
| **3** | **C — Programmatic scroll APIs** | **Confirmed in code** | `scrollIntoView`, `withOperationalScrollPreserved` double-rAF restore |
| — | **B — Virtualization** | **Not active on hub** | `@tanstack/react-virtual` components exist but are **unwired** |
| — | **E — Competing vertical scrollports** | **Unlikely on hub table** | Architecture enforces single `<main>` vertical owner |

**Runtime confirmation required:** use `window.PIPELINE_SCROLL_DEBUG` (below) while reproducing the jump to see which event fires first: `HEIGHT_CHANGED` vs `SCROLL_CORRECTION_DETECTED` vs `SCROLL_API_CALL`.

---

## Phase 24.4B removal recap (what is gone)

| System | Status on `/pipeline*` |
|--------|------------------------|
| `useMasterScrollCompression` | **Disabled** (`AppChrome` `enabled: !isPipelineSurface`) |
| `MobileChromeController` compact | **Suspended** (`suspendCompact` on pipeline) |
| `mobileScrollCollapseGridClass` / `mobileScrollRevealInnerClass` | **Removed** from hub JSX |
| File header scale/opacity + IO sentinel | **Removed** from `PipelineFileWorkspaceShell` |
| Pipeline `scroll-behavior: smooth` | **Set to `auto`** in `globals.css` |

If jump persists, **cause is elsewhere**.

---

## Cause A — Sticky element inside scroll container

### Primary suspect: Operational orientation strip

| Field | Value |
|-------|-------|
| **File** | `lender-app/components/ui/OperationalOrientationStrip.tsx` |
| **Lines** | 121 (`sticky = true` default), 155–157 (`sticky top-0 z-[calc(var(--dlc-z-header,20)+1)]`) |
| **Used by** | `lender-app/app/pipeline/PipelinePageClient.tsx` ~2167 |
| **Scroll owner** | Parent is `AppChrome` `<main data-app-main-scroll>` (vertical) |
| **Mechanism** | Sticky band re-anchors at `top: 0` of `<main>` while content above/below reflows → perceived snap |

**Not sticky (hub):** filter toolbar card (`PipelinePageClient` ~1561) — `relative z-10`, scrolls with content.

**File workspace sticky (kept):** access banner `PipelineFileWorkspaceShell.tsx` ~228 — `sticky top-0` **inside** `[data-pipeline-workspace-scroll]`.

### Bisect procedure (manual — no code change in 24.4C)

1. Enable debug (below).
2. In DevTools → Elements, select `[data-testid="pipeline-hub-orientation"]`.
3. Toggle `position: sticky` → `position: relative` **while reproducing scroll**.
4. If jump disappears → **Cause A confirmed** for orientation strip.

Or call: `PIPELINE_SCROLL_DEBUG.bisectStickyCandidates()`

---

## Cause B — Virtualization

### Static finding: **NOT ACTIVE on default hub path**

| File | Lines | Notes |
|------|-------|-------|
| `components/pipeline/PipelineHubVirtualizedLists.tsx` | 65–70, 158–163 | `useVirtualizer` + padding `<tr>` spacers + `translateY` cards |
| **Import graph** | — | **No imports** of `PipelineHubVirtualizedTableRows` or `PipelineHubVirtualizedCardList` anywhere in app |

**Active hub renderer:** `PipelineHubProjectionView` → `PipelineHubHierarchyView` — **full DOM tree**, no virtualizer.

```787:817:lender-app/components/pipeline/PipelineHubHierarchyView.tsx
  return (
    <div
      className="min-w-0 max-w-full space-y-3"
      data-testid="pipeline-hub-hierarchy"
      ...
    >
      {clients.map((client) => (
        <ClientSection key={client.clientId} ... />
      ))}
    </div>
  );
```

**Runtime check:** `PIPELINE_SCROLL_DEBUG.snapshot().virtualization.activeOnPage` should be **`false`** on hub unless dead code path mounted.

**Verdict:** Cause B is **ruled out** for default hierarchy scroll unless a different view mode mounts virtualized lists later.

---

## Cause C — Auto scroll restoration / scroll APIs

### C1 — Hub focus `scrollIntoView`

| Field | Value |
|-------|-------|
| **File** | `app/pipeline/PipelinePageClient.tsx` |
| **Lines** | 1061–1072 |
| **Trigger** | `useEffect` when `hubFocusFileId` set and row exists in `filtered` |
| **API** | `element.scrollIntoView({ block: "center", behavior: "auto" })` |
| **When** | Deep link / focus file / return from file workspace — **not continuous scroll** |

### C2 — Projection mode scroll preserve

| Field | Value |
|-------|-------|
| **File** | `app/pipeline/PipelinePageClient.tsx` ~1575 |
| **Calls** | `withOperationalScrollPreserved(() => setProjectionMode(...))` |
| **Implementation** | `lib/ui/scrollContinuity.ts` 72–88 |
| **Mechanism** | Captures `main.scrollTop`, runs state update, restores via **double `requestAnimationFrame`** + direct `scrollTop` assignment |
| **When** | User switches hub projection mode — can feel like micro-jump |

### C3 — File workspace section navigation

| Field | Value |
|-------|-------|
| **File** | `components/PipelineFileWorkspace.tsx` ~1410–1420, ~608 |
| **API** | `scrollIntoView({ behavior: "auto" })` |

### C4 — Router

| Field | Value |
|-------|-------|
| **File** | `PipelinePageClient.tsx` ~326 |
| **API** | `router.replace("/pipeline", { scroll: false })` — **explicitly disables** Next scroll restore on that path |

**Instrumentation:** debug harness patches `Element.prototype.scrollIntoView` and logs `SCROLL_API_CALL` + stack.

---

## Cause D — Height recalculation (hierarchy expansion)

### Primary suspect for jump **during scroll + expand**

| Field | Value |
|-------|-------|
| **File** | `components/pipeline/PipelineHubHierarchyView.tsx` |
| **Lines** | 768–785 (`toggleClient` / `toggleProject`), 498, 696 (conditional `{expanded && (...)}` ) |
| **State** | `hubExpansion` in `PipelinePageClient.tsx` ~238, persisted ~649 |
| **Mechanism** | Expanding client/project **inserts hundreds of px** of DOM above/below viewport; browser preserves scroll anchor → **visible content shifts** (classic "jump") |
| **Not scroll-linked** | Trigger is **click**, but if user scrolls then expands (or expansion state hydrates), same effect |

**ResizeObserver watch key:** `pipeline-hub-hierarchy` — expect `HEIGHT_CHANGED` with large positive `delta` on expand.

---

## Cause E — Multiple scroll containers

### Hub `/pipeline` (table view)

| Container | Vertical? | File / selector |
|-----------|-----------|-----------------|
| **Primary** | Yes | `AppChrome` `<main data-app-main-scroll>` |
| Hub list shell | No (`overflow-y` explicitly avoided) | Comment `PipelinePageClient.tsx` 2162–2164 |
| Board view | **Horizontal only** | `[data-testid="pipeline-board-scroll"]` `overflow-x-auto` |
| Filter sheets / popovers | Nested local | e.g. `PipelineHubMobileFilterSheet.tsx` 171 |

**Verdict:** No second **vertical** scrollport on hub table path by design. Jump from scroll **handoff** is unlikely unless a sheet/popover is open.

### File `/pipeline/[fileId]`

| Container | Role |
|-----------|------|
| `<main>` | `overflow-y-hidden` (non-scrolling shell) |
| `[data-pipeline-workspace-scroll]` | Sole vertical scroll |

---

## Other kept systems (lower probability)

| Component | File | Scroll impact |
|-----------|------|---------------|
| `OperationalContentReveal` | `components/ui/OperationalContentReveal.tsx` 20–33 | Opacity 0→100 on **mount** (one frame), not scroll-driven |
| `MobileBottomNav` | fixed bottom | Does not change on pipeline (`suspendCompact`) |
| Vaul sheet | `PipelineWorkspaceMobileVaulFrame.tsx` | Mobile file only; user gesture snap — not hub |
| Filter card backdrop-blur | `PipelinePageClient.tsx` ~1561 | In-flow, not sticky |

---

## Runtime forensics harness (Phase 24.4C deliverable)

### Enable (opt-in — no logs until enabled)

```js
localStorage.setItem("dlc-pipeline-scroll-debug", "1");
location.reload();
// or: /pipeline?pipelineScrollDebug=1
```

### API

```js
window.PIPELINE_SCROLL_DEBUG.snapshot()
window.PIPELINE_SCROLL_DEBUG.bisectStickyCandidates()
window.PIPELINE_SCROLL_DEBUG.clearEvents()
```

### What it returns / logs

| Signal | Purpose |
|--------|---------|
| `activeScrollContainer` | Primary vertical owner (`main` or workspace) |
| `nestedScrollContainers` | All elements with scrollable overflow |
| `stickyElements` / `fixedElements` | Cause A candidates |
| `SCROLL_CORRECTION_DETECTED` | Sudden `scrollTop` delta while scrolling |
| `HEIGHT_CHANGED` | ResizeObserver on page root, hierarchy, orientation strip, filter card, board |
| `SCROLL_API_CALL` | Patched `scrollIntoView` / `scrollTo` + `scrollContinuity` `scrollTop` sets |
| `VISIBLE_ROW_COUNT` | DOM row count vs virtualizer indicators |

### Files added (instrumentation only)

| File | Role |
|------|------|
| `lib/debug/pipelineScrollDebug.ts` | Core harness |
| `components/debug/PipelineScrollDebugMount.tsx` | Mount on pipeline routes |
| `lib/ui/scrollContinuity.ts` | Logs `scrollTop` restore when debug on |
| `PipelinePageClient.tsx` / `PipelineFileWorkspace.tsx` | Mount debug component |

---

## Recommended reproduction script (to catch jump in the act)

1. Enable debug on prod/local `/pipeline`.
2. Open console; run `PIPELINE_SCROLL_DEBUG.clearEvents()`.
3. **Test D:** Scroll mid-list → expand a client → watch for `HEIGHT_CHANGED` on `pipeline-hub-hierarchy` **without** prior `SCROLL_API_CALL`.
4. **Test A:** Scroll through orientation strip boundary → watch sticky candidates; bisect with DevTools `position: relative` override.
5. **Test C:** Navigate to file and back (hub focus) → watch for `SCROLL_API_CALL` `scrollIntoView` stack pointing to `PipelinePageClient.tsx:1066`.
6. **Test C2:** Switch projection mode → watch double `scrollTop` from `scrollContinuity.ts`.
7. Export: `copy(JSON.stringify(PIPELINE_SCROLL_DEBUG.snapshot().recentEvents.slice(0,30), null, 2))`

---

## Hypothesis → proof matrix

| User symptom | Most likely cause | Proof event |
|--------------|-------------------|-------------|
| Jump while **scrolling** through list | **A** sticky orientation strip | Strip sticks/unsticks at `top:0`; no HEIGHT_CHANGED |
| Jump on **expand/collapse** | **D** hierarchy height | `HEIGHT_CHANGED` on `pipeline-hub-hierarchy` |
| Jump on **return from file** / focus row | **C1** scrollIntoView | `SCROLL_API_CALL` → `PipelinePageClient` 1066 |
| Jump on **projection switch** | **C2** scroll preserve | `SCROLL_API_CALL` `scrollTop` → `scrollContinuity.ts` |
| Row **teleport** / blank gaps | **B** virtualization | Would show `translateY` nodes + padding spacers — **currently N/A** |
| Jump only on **board view** | **E** horizontal + layout | `board.scrollLeft` changes; different layout path |

---

## Phase 24.4D candidates (DO NOT IMPLEMENT YET)

Only after runtime confirms:

1. **If A:** `OperationalOrientationStrip sticky={false}` on hub only.
2. **If D:** Scroll anchoring on expand (`scroll-margin` / preserve anchor / `overflow-anchor` strategy) — hierarchy only.
3. **If C1:** Remove or gate `scrollIntoView` when already in viewport.
4. **If C2:** Remove double-rAF restore or scope to non-scroll UX.

---

## Static scroll API inventory (`/pipeline` codebase)

| API | File:line |
|-----|-----------|
| `scrollIntoView` | `PipelinePageClient.tsx:1066` |
| `withOperationalScrollPreserved` | `PipelinePageClient.tsx:1575` |
| `restoreOperationalScrollTop` | `scrollContinuity.ts:54-79` |
| `scrollIntoView` | `PipelineFileWorkspace.tsx:608, 1411` |
| `router.replace(..., { scroll: false })` | `PipelinePageClient.tsx:326` |

---

*Phase 24.4C — forensics only. Use `PIPELINE_SCROLL_DEBUG` on the live jump to convert hypotheses above into a single confirmed file:line:event.*
