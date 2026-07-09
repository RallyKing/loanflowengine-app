# Phase 24.4G — Pipeline Scroll Ownership Forensics

**Date:** 2026-05-28  
**Status:** Forensic audit only — **no patches, no deploy**  
**Prior eliminations:** Mobile chrome (24.4F) — jump persists with static chrome proven via `window.__PIPELINE_CHROME_DEBUG()`.

**Goal:** Identify exactly who owns vertical scrolling on pipeline routes and every code path that **writes** scroll position or attaches scroll/resize listeners that can run during user scroll.

---

## Executive summary (evidence)

| Route | Primary vertical scroll owner | `<main>` scrolls? | Competing full-page vertical scrollports |
|-------|------------------------------|-------------------|------------------------------------------|
| **`/pipeline` hub** | `#app-main-scroll` / `[data-app-main-scroll]` | **Yes** (`overflow-y-auto`) | **None** in default table/hierarchy path |
| **`/pipeline/[fileId]`** | `[data-pipeline-workspace-scroll]` | **No** (`overflow-y-hidden`, delegated) | **None** full-page; nested max-height panels only |

**During passive hub scroll (24.4F static chrome, debug off):**

- Product **scroll listeners on primary owner:** **0** (`MobileChromeController` suspended; `useMasterScrollCompression` disabled on pipeline).
- Product **scrollTop / scrollTo / scrollIntoView writes:** **0** unless user triggers projection change, focus row, or navigation.
- **ResizeObserver in product code on pipeline:** **0** (debug harnesses only when opt-in).

If jump persists, evidence points **away from scroll ownership mutation** and toward **layout reflow inside the primary scrollport** (DOM height change without programmatic scroll write) — out of scope for this doc except where noted.

---

## 1. Vertical scroll container inventory

### Document contract (`globals.css` + `app/layout.tsx`)

| Element | File | Lines | Vertical scroll | Role |
|---------|------|-------|-----------------|------|
| `html` | `app/globals.css` | 429–438 | No (`overflow-x: clip`) | Sizing root |
| `body` | `app/globals.css` | 441–459 | **Locked** (`overflow-y: hidden`) | Shell; does not scroll |
| `body` | `app/layout.tsx` | 112 | `overflow-hidden` | Flex column shell |

Contract comment: `globals.css:633` — *body does not scroll; `[data-app-main-scroll]` remains the primary scroller* (hub). File route delegates to workspace scrollport.

---

### `/pipeline` hub — active scroll chain

**Visual hierarchy (classic + SaaS; hub uses primary `<main>` scroll):**

```
html
└── body[data-shell="app"]                    overflow-y: hidden
    └── div.flex.flex-1                       (layout.tsx:120)
        └── AppChrome
            └── div[data-app-shell-root]      overflow: hidden
                ├── header[data-testid=app-masterpage-chrome]   shrink-0 — NOT a scrollport
                ├── main#app-main-scroll
                │       [data-app-main-scroll]                 ★ PRIMARY vertical owner
                │       overflow-y-auto, touch-scroll-y, overscroll-contain
                │       touch-action: pan-y (via .touch-scroll-y)
                │   └── div (saasMainPad / classicMainPad)     NO overflow-y
                │       └── PipelineTriageClockShell
                │           └── PipelinePageClient
                │               └── div[data-pipeline-page-root]   NO overflow-y
                │                   ├── page title / actions
                │                   ├── filter toolbar card        relative z-10 — scrolls WITH main
                │                   └── OperationalContentReveal
                │                       ├── OperationalOrientationStrip (sticky top-0 in main)
                │                       └── hierarchy OR projection OR board
                │                           board: div[data-testid=pipeline-board-scroll]
                │                                    overflow-x-auto ONLY (horizontal)
                └── MobileBottomNav (fixed)                        outside scroll chain
```

| Component | File | Line(s) | Parent scroll owner | Child scroll? | Notes |
|-----------|------|---------|---------------------|---------------|-------|
| **`AppChrome` `<main>`** | `components/AppChrome.tsx` | 347–362 (SaaS hub), 499–514 (classic hub) | `body` (locked) | **Yes — primary** | `data-main-scroll-mode="primary"` |
| Page padding wrapper | `AppChrome.tsx` | 364–371, 516–523 | `<main>` | No | Bottom nav padding only |
| `PipelinePageClient` root | `app/pipeline/PipelinePageClient.tsx` | 1443–1450 | `<main>` | No | Explicit comment L2171–2173: no nested overflow-y |
| Filter dropdown list | `PipelinePageClient.tsx` | 1813 | `<main>` | **Nested** (max-h-48) | Only when `<details>`/dropdown open |
| Board horizontal strip | `PipelinePageClient.tsx` | 2461–2464 | `<main>` | **Horizontal only** | `overflow-x-auto touch-pan-x` |
| `PipelineBoardView` inner | `components/pipeline/PipelineBoardView.tsx` | 463 | board strip | Horizontal only | |
| Mobile filter sheet body | `components/pipeline/PipelineHubMobileFilterSheet.tsx` | 171 | Overlay | Nested when sheet **open** | Not active during closed hub scroll |
| `GlobalSearchPalette` results | `components/GlobalSearchPalette.tsx` | 418 | Overlay | Nested when palette **open** | |
| `MobileBottomNav` “More” sheet | `components/MobileBottomNav.tsx` | 227 | Fixed overlay | Nested when **open** | |

**Hub default path (`effectiveView === "table"`, hierarchy):** User vertical pan → **only** `[data-app-main-scroll]`. No full-height nested vertical scrollport between body and list content.

**CSS scrollport tokens** (`globals.css:667–682`): `[data-app-main-scroll]` has `overscroll-behavior: contain`, `overflow-anchor: none`, `scroll-behavior: auto` when `:has([data-pipeline-page-root])`.

---

### `/pipeline/[fileId]` — active scroll chain

**Visual hierarchy:**

```
html
└── body                                      overflow-y: hidden
    └── AppChrome (minimal file branch)
        └── div[data-pipeline-file-workspace-chrome=minimal]   overflow: hidden
            └── main#app-main-scroll
                    [data-main-scroll-mode=workspace-delegated]
                    overflow-y-hidden                          ★ NOT a vertical scroller
                └── PipelineFileWorkspace
                    └── PipelineWorkspaceMobileVaulFrame       mobile: Vaul snap host
                        └── PipelineFileWorkspaceShell
                            ├── header[data-mobile-workspace-chrome=expanded]  shrink-0
                            └── div[data-pipeline-workspace-scroll]              ★ PRIMARY vertical owner
                                    overflow-y-auto, touch-scroll-y
                                └── WorkspaceContentContainer / blocks / drawers
                                    └── [data-nested-scroll] panels (max-height, conditional)
                            └── PipelineMobileWorkspaceOpsRail (fixed dock, file mobile/tablet)
```

| Component | File | Line(s) | Parent scroll owner | Child scroll? | Notes |
|-----------|------|---------|---------------------|---------------|-------|
| **`AppChrome` `<main>`** | `AppChrome.tsx` | 228–236, 390–398 | body | **No** (delegated) | `overflow-hidden` |
| **Workspace scroller** | `PipelineFileWorkspaceShell.tsx` | 166–174 | `<main>` (non-scrolling flex) | **Yes — primary** | `data-testid="pipeline-workspace-scroll"` |
| Sticky access banner | `PipelineFileWorkspaceShell.tsx` | 177–179 | inside workspace scroll | Sticky child | `sticky top-0` inside scroller |
| Activity list nested | `PipelineFileActivityPanel.tsx` | 195–196 | workspace scroll | max-h-72 nested | `[data-nested-scroll]` |
| Lender search results nested | `PipelineFileWorkspace.tsx` | 3628–3629 | workspace scroll | max-h nested | `[data-nested-scroll]` |
| Vaul drawer content | `PipelineWorkspaceMobileVaulFrame.tsx` | 124–151 | host container | Snap **height** changes | Mobile only; drag/snap — not hub |

**File route:** Vertical user pan → **`[data-pipeline-workspace-scroll]`** only. `<main>` does not accumulate `scrollTop`.

---

## 2. Nested scroll analysis

### Can the user scroll `main` inside another vertical scroll parent?

**Hub:** **No.** `body` and `[data-app-shell-root]` are `overflow-y: hidden`. The only ancestor of `<main>` that could scroll vertically is `body`, and it is locked (`globals.css:459`, `layout.tsx:112`).

### Can the user scroll inside a child while `main` also scrolls?

**Hub — yes, but only in bounded nested panels (not full-page):**

| Nested vertical scroll | Condition | DOM chain |
|------------------------|-----------|-----------|
| Filter `<ul max-h-48 overflow-y-auto>` | Dropdown open | `main` → `PipelinePageClient` → filter card → `ul` |
| `PipelineHubMobileFilterSheet` body | Sheet open | `main` → … → sheet overlay → scroll body |
| `GlobalSearchPalette` results | Palette open | fixed overlay → scroll region |

**Default closed UI, continuous list scroll:** **Single owner** — no nested full-page vertical chain.

**File route — yes, bounded:**

| Nested | Condition | Chain |
|--------|-----------|-------|
| `[data-pipeline-workspace-scroll]` → activity panel | Panel expanded + long list | workspace → `[data-nested-scroll]` |
| Workspace → lender picker list | Block UI open | workspace → nested max-h div |

**Horizontal-only nested (does not compete for vertical):** hub board `overflow-x-auto` (`PipelinePageClient.tsx:2462`).

---

## 3. Every scroll write (repo-wide, pipeline relevance)

### Product code — can execute on `/pipeline*`

| File | Line | API | Trigger | Route | Class |
|------|------|-----|---------|-------|-------|
| `PipelinePageClient.tsx` | 1064–1075 | `scrollIntoView` | `hubFocusFileId` set + row in filtered list; 80ms timeout | **Hub** | **HIGH RISK** when focus/deep-link active; **SAFE** during passive scroll if `hubFocusFileId` null |
| `PipelinePageClient.tsx` | 1582–1588 | `withOperationalScrollPreserved` → `scrollTop` ×2 (double rAF) | User changes **projection mode** | **Hub** | **HIGH RISK** on mode switch; **SAFE** during passive scroll |
| `PipelineFileWorkspace.tsx` | 430–441 | `scrollTop = 0`, `scrollLeft = 0` | `useLayoutEffect` on **fileId change** | **File** | **SAFE** on navigation; not continuous scroll |
| `PipelineFileWorkspace.tsx` | 602–606 | `scrollIntoView` | URL `?block=fileNotes\|tasks` | **File** | **HIGH RISK** when query present |
| `PipelineFileWorkspace.tsx` | 1398–1417 | `scrollIntoView` + double rAF + 320ms timeout | User taps **workspace dock** section jump | **File** | **HIGH RISK** on user action |
| `lib/ui/scrollContinuity.ts` | 53–88 | `scrollTop` / `scrollTo` | Called from `withOperationalScrollPreserved` | **Hub** (via projection) | **HIGH RISK** (indirect) on projection change |
| `lib/ui/scrollContinuity.ts` | 102–108 | `scrollTop` | `restorePipelineWorkspaceScrollTop` | **File** | **SAFE** — **no callers** in app (grep: definition only) |

### Product code — pipeline-adjacent (overlay / row widgets on hub)

| File | Line | API | Trigger | Class |
|------|------|-----|---------|-------|
| `components/pipeline/ClientMomentumStars.tsx` | 150 | `window` scroll listener (capture) | Popover reposition when stars UI open | **SUSPICIOUS** if open during hub scroll — reposition only, no scroll write in handler (verify: read file) |

### Not on pipeline passive path

| File | Notes | Class |
|------|-------|-------|
| `MobileChromeController.tsx` | `scrollTop` read + state; **suspended on pipeline** (24.4F) | **SAFE** on pipeline |
| `useMasterScrollCompression.ts` | `main.scrollTop` read; **`enabled: false` on pipeline** | **SAFE** on pipeline |
| `GlobalSearchPalette.tsx:246` | scrollIntoView | Only when palette open | SAFE if closed |
| `ProductTourOverlay.tsx` | scrollIntoView + scroll listener | Tour active only | SAFE if inactive |

### Debug-only (opt-in)

| File | Patches `scrollTop` / `scrollIntoView` / `scrollTo` when enabled |
|------|-------------------------------------------------------------------|
| `lib/debug/pipelineLayoutDebug.ts` | Patches prototypes; logs writes |
| `lib/debug/pipelineScrollDebug.ts` | Passive scroll listeners + correction detection |

### Tests / scripts

All `scrollTop` / `scrollIntoView` in `tests/**`, `scripts/**` — not production runtime.

---

## 4. Scroll listeners on pipeline routes (product)

| File | Line | Target | Purpose | Active on `/pipeline` hub? | Active on file? | Mutates scroll? |
|------|------|--------|---------|---------------------------|-----------------|-----------------|
| `MobileChromeController.tsx` | 268 | `<main>` or workspace | Compact/focus | **No** (`suspendCompact`) | **No** | No (disabled) |
| `useMasterScrollCompression.ts` | 123 | `[data-app-main-scroll]` | Header morph | **No** (`enabled: false`) | **No** | No (disabled) |
| `PipelineMobileWorkspaceOpsRail.tsx` | 122 | `[data-pipeline-workspace-scroll]` | Active dock chip | No | **Yes** | **No** — `setActiveSection` only |
| `PipelineMobileWorkspaceOpsRail.tsx` | 110–115 | IO on section ids | Same | No | **Yes** | No |
| `useResponsiveNavLayout.ts` | 177 | `visualViewport` scroll | Viewport signals / keyboard inset | Global | Global | **No** scrollTop write |
| `ClientMomentumStars.tsx` | 150 | `window` scroll capture | Popover position | When popover open | Rare on file rows | Reposition overlay |
| Debug harnesses | — | main / workspace | Forensics | Opt-in only | Opt-in only | Log only |

**Evidence:** 24.4F reported `scrollListeners: 0` and `intersectionObservers: 0` for mobile chrome. **`PipelineMobileWorkspaceOpsRail`** adds scroll+IO on **file route only** — does not write scroll position.

---

## 5. Resize-driven rerenders

### ResizeObserver

| File | Line | Watched elements | State updated | During passive scroll? |
|------|------|------------------|---------------|------------------------|
| `lib/debug/pipelineLayoutDebug.ts` | 233–250 | Pipeline debug targets | Debug event buffer | Only if `dlc-pipeline-layout-debug=1` |
| `lib/debug/pipelineScrollDebug.ts` | 429+ | Hub/workspace heights | Debug HEIGHT_CHANGED | Only if scroll debug enabled |

**Product runtime on pipeline (debug off):** **Zero** `ResizeObserver` instances.

### `clientHeight` / `scrollHeight` / `getBoundingClientRect` (pipeline paths)

| File | Line | Usage | During scroll? |
|------|------|-------|----------------|
| `PipelineMobileWorkspaceOpsRail.tsx` | 77–89 | Section visibility scoring | **Yes** on file workspace scroll (read-only geometry) |
| `scrollContinuity.ts` | 44 | `main.scrollHeight > main.clientHeight` | On restore call only |
| Debug harnesses | various | Snapshots | Opt-in |

**No `useMeasure` / `useResizeObserver` hooks** in production codebase (grep: zero matches).

### Viewport / visualViewport (not ResizeObserver)

| File | Line | Trigger | State | Scroll write? |
|------|------|---------|-------|---------------|
| `useResponsiveNavLayout.ts` | 153–198 | resize, vv resize/**scroll**, orientation | `keyboardInsetBottom`, shell signals | No |
| `useVisualViewportMaxHeightStyle.ts` | 27 | vv scroll/resize | max-height style | No |
| `PipelineMobileWorkspaceOpsRail.tsx` | 44–58 | vv resize/scroll | `keyboardInset` for dock `bottom` | No |

These can rerender chrome/dock **position** but do not assign `scrollTop` on pipeline owners.

---

## 6. Scroll ownership report

### `/pipeline` hub

| Tier | Owner | Selector | Evidence |
|------|-------|----------|----------|
| **Primary** | AppChrome `<main>` | `[data-app-main-scroll]` | `AppChrome.tsx:357–361`, `globals.css:667–676` |
| Secondary | None (full-page) | — | No competing vertical scrollport in default UI |
| Tertiary | Conditional nested | `max-h-* overflow-y-auto` in open overlays/dropdowns | See §2 |

**Scroll writers (hub):**

| Writer | When | Risk during passive scroll |
|--------|------|---------------------------|
| `scrollIntoView` (focus row) | `hubFocusFileId` | Only if focus active |
| `withOperationalScrollPreserved` | Projection mode change | User click only |
| Next.js `router.replace(..., { scroll: false })` | Hub URL sync | **No DOM scroll** (`PipelinePageClient.tsx:323`) |

**Resize-driven state (hub, debug off):** None via ResizeObserver. Convex/React list updates can change **content height** inside `<main>` without scroll API calls.

---

### `/pipeline/[fileId]`

| Tier | Owner | Selector | Evidence |
|------|-------|----------|----------|
| **Primary** | Workspace sheet body | `[data-pipeline-workspace-scroll]` | `PipelineFileWorkspaceShell.tsx:167–174` |
| Secondary | `<main>` | `[data-app-main-scroll]` | **Non-scrolling** shell (`overflow-y-hidden`) |
| Tertiary | `[data-nested-scroll]` panels | Activity, lender lists | max-height bounded |

**Scroll writers (file):**

| Writer | When | Risk during passive scroll |
|--------|------|---------------------------|
| `scrollTop = 0` | File id change (mount) | Navigation only |
| `scrollIntoView` | `?block=`, dock jump, drawer expand | User / URL driven |
| `restorePipelineWorkspaceScrollTop` | — | **Uncalled** in app |

**Scroll listeners (file, passive scroll):**

- `PipelineMobileWorkspaceOpsRail` — updates active chip state (rerender), **no scroll write**.

**Mobile Vaul snap (`PipelineWorkspaceMobileVaulFrame`):** Changes **sheet height fraction** on drag — layout mutator, not `scrollTop` write. Can affect perceived position inside workspace scroller when user snaps sheet.

---

## 7. Classification matrix — scroll writes (pipeline routes)

| Classification | Meaning | Pipeline instances |
|----------------|---------|-------------------|
| **SAFE** | Navigation-only, disabled on pipeline, or no callers | File mount `scrollTop=0`; disabled compression/chrome listeners; uncalled `restorePipelineWorkspaceScrollTop` |
| **SUSPICIOUS** | Runs during scroll but unclear scroll mutation | `ClientMomentumStars` window scroll listener (reposition); ops rail geometry reads + `setState` on file scroll |
| **HIGH RISK** | Direct scroll position mutation | `scrollIntoView` (hub focus, file block/dock); `withOperationalScrollPreserved` (hub projection) |

**Critical evidence for ongoing jump on hub passive scroll:**

If `hubFocusFileId` is null and user is not switching projection mode, **no HIGH RISK scroll writer is scheduled** in hub product code. Jump without any `scrollTop`/`scrollIntoView` in Performance timeline → **not scroll ownership theft** → investigate **content height reflow** inside `[data-app-main-scroll]` (Phase 24.4H scope).

---

## 8. Verification commands (runtime, no code changes)

### Hub — confirm single scroll owner

```js
(() => {
  const main = document.querySelector("[data-app-main-scroll]");
  const chain = [];
  let el = main;
  while (el) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY)) chain.push(el.tagName + (el.id ? "#"+el.id : "") + " " + [...el.classList].slice(0,3).join(" "));
    el = el.parentElement;
  }
  return {
    path: location.pathname,
    mainScrollTop: main?.scrollTop,
    mainScrollHeight: main?.scrollHeight,
    mainClientHeight: main?.clientHeight,
    verticalOverflowAncestors: chain,
    workspaceScroll: document.querySelector("[data-pipeline-workspace-scroll]")?.scrollTop ?? null,
  };
})();
```

### File — confirm delegated scroll

```js
({
  mainMode: document.querySelector("[data-app-main-scroll]")?.getAttribute("data-main-scroll-mode"),
  mainOverflow: getComputedStyle(document.querySelector("[data-app-main-scroll]")).overflowY,
  wsScrollTop: document.querySelector("[data-pipeline-workspace-scroll]")?.scrollTop,
  wsOverflow: getComputedStyle(document.querySelector("[data-pipeline-workspace-scroll]")).overflowY,
});
```

### Detect scroll writes during repro (enable layout debug)

```js
localStorage.setItem("dlc-pipeline-layout-debug","1"); location.reload();
// scroll until jump
window.__PIPELINE_LAYOUT_DEBUG.snapshot().recentEvents.filter(e => e.type === "SCROLL_WRITE")
```

---

## 9. Decision tree (post-24.4G)

```
Jump on /pipeline hub during passive scroll
│
├─ SCROLL_WRITE events in layout debug
│   └─ Trace stack → PipelinePageClient / scrollContinuity (projection or focus)
│
├─ No SCROLL_WRITE; mobile chrome static (24.4F ✓)
│   └─ Primary owner unchanged; content height reflow inside <main>
│       (Convex list update, hierarchy expand, sticky band — excluded topics)
│
└─ File route jump
    ├─ scrollIntoView / dock jump / ?block= active → HIGH RISK writers
    ├─ Vaul snap drag → sheet height change (not scrollTop)
    └─ Ops rail setState on scroll → rerender only
```

---

## 10. Files referenced

| Path | Role |
|------|------|
| `app/layout.tsx` | Body scroll lock |
| `app/globals.css` | Scrollport CSS contract |
| `components/AppChrome.tsx` | `<main>` vs delegated file shell |
| `app/pipeline/PipelinePageClient.tsx` | Hub content; scroll writes |
| `components/PipelineFileWorkspace.tsx` | File workspace; scroll writes |
| `components/PipelineFileWorkspaceShell.tsx` | Workspace scroll owner |
| `components/PipelineWorkspaceMobileVaulFrame.tsx` | Mobile sheet snap |
| `lib/ui/scrollContinuity.ts` | Scroll restore helpers |
| `components/pipeline/PipelineMobileWorkspaceOpsRail.tsx` | File scroll listener (state only) |

---

*Phase 24.4G — scroll ownership forensics. Investigation only. Mobile chrome eliminated (24.4F). Next phase should target layout reflow inside primary scrollport if scroll writes are absent during repro.*
