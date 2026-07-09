# Phase 25.11 — Pipeline Board Overlay Root Cause Audit

**Date:** 2026-05-28  
**Mode:** Investigation only — **no CSS/Tailwind patches applied**  
**Symptom:** Pipeline hub chrome (title, search, stage filters, controls) paints over board column headers; headers unreadable, board controls not clickable, text stacks visually.

**Production URL:** https://dlcfunds.vercel.app/pipeline  
**Board view:** Rendered only when viewport is **not** narrow (`useNarrowViewport` → `effectiveView = narrow ? "table" : view`; narrow = `max-width: 767.98px`). Mobile widths 320–430 use **table/hierarchy**, not `PipelineBoardView`.

---

## Step 1 — Exact elements (component, file, DOM, classes)

### A. Parent page container

| Field | Value |
|-------|--------|
| **Component** | `PipelinePageClient` (page root) |
| **File** | `lender-app/app/pipeline/PipelinePageClient.tsx` |
| **Lines** | 1489–1496 (open), 2610 (close) |
| **`data-*`** | `data-pipeline-page-root`, `data-clipping-parent="pipeline-page"` |

**Rendered DOM (simplified):**

```html
<div data-pipeline-page-root data-clipping-parent="pipeline-page" class="flex min-w-0 max-w-full flex-col gap-3 md:gap-4">
  <!-- page title row -->
  <!-- filter + board wrapper (B) -->
  <!-- batch bar, mobile filter sheet -->
</div>
```

**Active Tailwind:** `flex min-w-0 max-w-full flex-col gap-3 md:gap-4`

**Scroll owner:** `AppChrome` `<main id="app-main-scroll" data-app-main-scroll>` (`lender-app/components/AppChrome.tsx` ~527–575). Hub does not use `[data-pipeline-workspace-scroll]`.

---

### B. Hub content wrapper (filter card + board)

| Field | Value |
|-------|--------|
| **Component** | `PipelinePageClient` inner wrapper |
| **File** | `lender-app/app/pipeline/PipelinePageClient.tsx` |
| **Lines** | 1595–1596 (open), 2548 (close) |
| **Role** | Groups filter card and `OperationalContentReveal` with `gap-3` |

**Rendered DOM:**

```html
<div class="flex min-w-0 max-w-full flex-col gap-3">
  <!-- C: filter card -->
  <!-- D: OperationalContentReveal → orientation + board -->
</div>
```

**Active Tailwind:** `flex min-w-0 max-w-full flex-col gap-3`

---

### C. Toolbar / filter container (symptom “toolbar area”)

This is **not** the app master header. It is the **rounded filter card** plus the page **h1 “Pipeline”** row above it.

#### C1 — Page title + actions (includes “Pipeline” label)

| Field | Value |
|-------|--------|
| **Component** | `PipelinePageClient` header row |
| **File** | `lender-app/app/pipeline/PipelinePageClient.tsx` |
| **Lines** | 1497–1584 |

**Classes:** outer `flex min-h-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`; `h1` `text-xl font-semibold md:text-2xl`

#### C2 — Filter card + hub toolbar band (search, stage filters, controls)

| Field | Value |
|-------|--------|
| **Component** | `PipelinePageClient` filter card |
| **File** | `lender-app/app/pipeline/PipelinePageClient.tsx` |
| **Lines** | 1596–2214 (card), **1597–2213 (z-10 band)** |

**Rendered DOM:**

```html
<div class="min-w-0 max-w-full rounded-xl border border-border/80 bg-background shadow-sm">
  <div class="relative z-10 shrink-0 border-b border-border/80 bg-background/95 backdrop-blur">
    <div class="flex min-h-0 flex-col gap-3 p-3">
      <!-- search row: Input placeholder "Search client, project, loan, or deal fields…" -->
      <!-- ProjectionModeSwitcher, sort, table/board tabs, density, saved views -->
      <div class="max-md:min-w-0">
        <div data-testid="operational-filter-drawer">…</div>
        <!-- stage pill buttons (lines 1944–2086) -->
      </div>
      <!-- count / export row (2091–2211) -->
    </div>
  </div>
</div>
```

**Active Tailwind on the overlapping band (critical):**

- `relative z-10 shrink-0 border-b border-border/80 bg-background/95 backdrop-blur`
- Inner: `flex min-h-0 flex-col gap-3 p-3`
- Search icon: `absolute … -translate-y-1/2` (decorative, inside input row only)
- Stage pills: `inline-flex … rounded-full border px-2.5 py-1 text-xs` (in flow)

**Debug selector (existing):** `[data-pipeline-page-root] .relative.z-10.shrink-0` (`lender-app/lib/debug/pipelineLayoutDebug.ts` ~83–84)

---

### D. Board container

| Field | Value |
|-------|--------|
| **Component** | `PipelinePageClient` board scroller + `PipelineBoardView` |
| **Files** | `PipelinePageClient.tsx` 2531–2545; `PipelineBoardView.tsx` 461–570 |
| **`data-testid`** | `pipeline-board-scroll` (outer), columns `aria-label="… column"` |

**Rendered DOM:**

```html
<div data-testid="pipeline-board-scroll" class="min-w-0 max-w-full overflow-x-auto touch-pan-x">
  <div> <!-- DndContext -->
    <div class="w-full overflow-x-auto touch-pan-x touch-scroll-x">
      <div class="flex min-h-0 min-w-max gap-3 p-3">
        <section class="flex min-h-0 w-72 shrink-0 flex-col rounded-lg border-2 …">
          <header class="flex items-center gap-2 border-b-2 … bg-background/95 px-3 py-2">…</header>
          <ul class="space-y-2 p-2">…</ul>
        </section>
        …
      </div>
    </div>
  </div>
</div>
```

**Active Tailwind (outer):** `min-w-0 max-w-full overflow-x-auto touch-pan-x`  
**Active Tailwind (column header):** `flex items-center gap-2 border-b-2 border-border/60 bg-background/95 px-3 py-2`  
**Position / z-index:** none (default `position: static`, `z-index: auto`)

---

### E. Board header container

| Field | Value |
|-------|--------|
| **Component** | `BoardColumn` → `<header>` |
| **File** | `lender-app/components/pipeline/PipelineBoardView.tsx` |
| **Lines** | 66–104 (`header` at 89–101) |

**Rendered DOM:**

```html
<header class="flex items-center gap-2 border-b-2 border-border/60 bg-background/95 px-3 py-2">
  <span class="h-2 w-2 rounded-full" style="background-color: …"></span>
  <h3 class="text-sm font-semibold" style="color: …">Stage name</h3>
  <span class="ml-auto text-xs font-medium text-muted-foreground">count</span>
</header>
```

---

### F. Between toolbar and board — orientation strip

| Field | Value |
|-------|--------|
| **Component** | `OperationalOrientationStrip` |
| **File** | `lender-app/components/ui/OperationalOrientationStrip.tsx` |
| **Mounted from** | `PipelinePageClient.tsx` 2225–2244 |
| **`data-testid`** | `pipeline-hub-orientation` |

**Props (hub):** `sticky={!PHASE_24_4P_MASTER_LAYOUT_LOCKDOWN.purgeHubSticky}` → with current flags, **`sticky={false}`** (no sticky classes).

**If sticky were true, classes would include:** `sticky top-0 z-[calc(var(--dlc-z-header,20)+1)] border-b bg-background/95 backdrop-blur-sm …` (lines 155–157).

**Wrapper:** `OperationalContentReveal` (`PipelinePageClient.tsx` 2221–2224) — `flex min-w-0 max-w-full flex-col`; no vertical overflow, no position.

---

## Step 2 — Root cause classification (proven)

**Classification: I — Multiple simultaneous causes**

| Code | Role | Proven? |
|------|------|--------|
| **F — incorrect z-index** | Primary at-rest and scroll stacking | **Yes** — see §Proof |
| **C — sticky positioning** | Scroll-time header cover when lockdown off | **Yes** — conditional |
| **B — fixed positioning** | Mobile filter sheet open | **Yes** — mobile only |
| **A, D, E, G, H** | Not primary in current source | **No** — see §Ruled out |

### Proof — primary (F): `relative z-10` on filter band

1. **Source rule:** Tailwind `z-10` → `z-index: 10`; `relative` → `position: relative` on the filter band (`PipelinePageClient.tsx` **1597**).
2. **Sibling order:** Board lives in a **later** sibling subtree under the same hub wrapper (1595 → card, then `OperationalContentReveal` → board). Board headers use **no** z-index (`z-index: auto`, treated as 0 in stacking comparisons).
3. **CSS stacking spec:** When two in-flow boxes **occupy overlapping pixels**, a positioned descendant with `z-index: 10` paints above and receives **pointer events** over `z-index: auto` content.
4. **Why overlap pixels exist in the product:**  
   - **At scroll offset 0:** Document order + `gap-3` normally place the board **below** the card; overlap should be **zero** unless layout height is wrong (see H note) or the user is describing **scroll-compressed** chrome.  
   - **When overlap is reported with search/stage filters visible:** Those nodes only live inside the **z-10 band** (lines 1597–2213). Unclickable board headers mean the **z-10 band’s hit region** intersects column headers — consistent with **stacking (F)**, not merely a color contrast issue.
5. **Why z-10 was likely added:** Dropdowns inside the band use `absolute z-30` / `z-20` (e.g. 1531, 1844, 2170). The parent `z-10` creates a stacking context for those menus but also **elevates the entire opaque `bg-background/95 backdrop-blur` band** over the board.

**Not “possibly”:** The only hub-level elevated in-flow chrome above the board column tree is this band (`z-10`). Board columns do not set a competing z-index.

### Proof — secondary (C): sticky orientation (conditional)

1. `OperationalOrientationStrip` sticky classes: `OperationalOrientationStrip.tsx` **155–157**.
2. Hub disables sticky when `PHASE_24_4P_MASTER_LAYOUT_LOCKDOWN.purgeHubSticky === true` (`phase24-4P-master-layout-lockdown.ts` **10**; `PipelinePageClient.tsx` **2227–2228**).
3. **CSS backstop** when `html[data-pipeline-master-layout-lock="true"]`: `globals.css` **859–863** forces `[data-pipeline-page-root] .sticky { position: relative !important; top: auto !important; z-index: auto !important; }`.
4. **If** `data-pipeline-master-layout-lock` is missing (hydration gap, route not classified as pipeline surface) **and** `sticky` prop were true, scrolling `#app-main-scroll` (or document under 24.4R) would pin the orientation strip while column headers slide underneath — unreadable headers, dead clicks. That strip does **not** include the search row, but users often describe the whole hub chrome as “toolbar.”

### Proof — mobile (B): fixed filter sheet

`OperationalFilterDrawer.tsx` **147–184**: when open on `<md`, `fixed inset-0` sheet at `layerZIndexStyle("SHEET")` blocks the entire viewport including board/table. Symptom matches “nothing clickable below” while filters are active.

### Ruled out in current source

| Code | Reason |
|------|--------|
| **A absolute** | Hub toolbar band is `relative`, not `absolute`/`fixed` (grep `PipelinePageClient.tsx` — only menus use `absolute`). |
| **D negative margins** | No `-mt-*` on board path; count row uses `max-md:-mx-1` (horizontal only, line 2091). |
| **E transform** | No `translate-y` on board wrapper; board inner layout is flex row only. |
| **G missing parent height** | No `h-0` / `absolute` board parent; wrappers use natural height. |
| **H flex/grid failure alone** | Wrapper is valid `flex-col` + `gap-3`; no `display:grid` overlap. Native-scroll mode changes scroll owner, not column order (see Step 4). |

---

## Step 3 — Layout flow trace

```text
html
└── body[data-shell="app"]
    └── [data-app-shell-root]          flex flex-col overflow-hidden
        ├── header[data-testid="app-masterpage-chrome"]   shrink-0, h-16 locked on pipeline
        ├── main#app-main-scroll       flex-1 min-h-0 overflow-y-auto (hub)
        │   └── div                    flex-1 flex-col + max-w-7xl padding
        │       └── [data-pipeline-page-root]
        │           ├── title row (h1 Pipeline, New…)
        │           └── div.gap-3
        │               ├── filter card (.rounded-xl)
        │               │   └── .relative.z-10…  ← STACKING CONTEXT z-index 10
        │               └── OperationalContentReveal
        │                   ├── [data-testid=pipeline-hub-orientation]  (sticky OFF)
        │                   └── [data-testid=pipeline-board-scroll]
        │                       └── PipelineBoardView → section/header (z-auto)
        └── nav[aria-label="Primary"] (mobile, fixed when native scroll)
```

### Expected computed values (desktop, board view, scrollTop = 0)

Values depend on content height; relationships are what matter.

| Node | position | z-index | overflow (typical) | height |
|------|----------|---------|-------------------|--------|
| `#app-main-scroll` | static | auto | overflow-y: **auto** (desktop) | flex-1 of shell (~viewport − header) |
| `[data-pipeline-page-root]` | static | auto | visible | content-sized |
| `.relative.z-10` toolbar band | **relative** | **10** | visible | sum of search + filters + count row |
| `[data-testid=pipeline-board-scroll]` | static | auto | **overflow-x: auto**; overflow-y visible | column row height |
| `BoardColumn header` | static | auto | visible | ~40px + borders |

**Vertical relationship (in flow):**

```text
toolbarBand.bottom + gap-3 + orientationStrip.height ≤ boardScroll.top   (ideal)
boardHeader.top ≥ boardScroll.top
```

**Why the board can appear “under” the toolbar:**

1. **Stacking (F):** Any case where `boardHeader.top < toolbarBand.bottom` (layout bug, zoom, or partial scroll) makes headers draw **under** the opaque z-10 band.
2. **Scroll (C):** Sticky orientation (if enabled) fixes a chrome band at `top: 0` of the scrollport while columns move up.
3. **Hit testing:** `pointer-events` follow the topmost z-index layer — board buttons feel dead when the z-10 band overlaps them.

**Overflow contract (documented):** Do not add `overflow-x-clip` / `overflow-x-hidden` on ancestors of `[data-testid="pipeline-board-scroll"]` (`docs/phase18-step8E-pipeline-overflow-forensics.md`). Current `PipelinePageClient` obeys that.

---

## Step 4 — Responsive breakpoints

| Width | `useNarrowViewport` | Board view | Primary overlap mechanism |
|-------|---------------------|------------|---------------------------|
| 320 | true | **Hidden** (`effectiveView === "table"`) | Filter card z-10 over **hierarchy/table**, or **fixed filter sheet** if open |
| 360 | true | Hidden | Same |
| 375 | true | Hidden | Same |
| 390 | true | Hidden | Same |
| 414 | true | Hidden | Same |
| 430 | true | Hidden | Same |
| 768 | false (at 768px) | **Available** | z-10 band vs board headers; sticky if lockdown off |
| 1024+ | false | Available | Same as 768 |

**`html` attributes on pipeline routes (client mount):**

| Attribute | When | Effect relevant to overlap |
|-----------|------|------------------------------|
| `data-pipeline-master-layout-lock="true"` | Pipeline surface + 24.4P | Neutralizes `.sticky` under page root |
| `data-native-document-scroll="true"` | Mobile hub + 24.4R | `main` → `overflow-y: visible`, `height: auto`; document scroll; master header `sticky top: 0` (`globals.css` 713–784) |
| `data-pipeline-safe-area-frozen="true"` | Pipeline + 24.4P | Batch bar bottom offset only |

**Verdict:**

- **Board column overlap (described symptom):** **Desktop/tablet ≥768px** with Board tab selected.
- **Same z-10 band over list content:** **All breakpoints**.
- **Full-viewport block:** **Mobile &lt;768px** with **filter sheet open** (fixed inset-0).

---

## Step 5 — Screenshot correlation

Without the screenshot file in-repo, map symptoms to DOM as follows:

| Visible symptom | DOM node to inspect in DevTools | Component |
|-----------------|----------------------------------|-----------|
| Opaque white/blur bar over stage names | `div.relative.z-10.shrink-0` inside `.rounded-xl.border` | `PipelinePageClient` filter band |
| “Pipeline” title (page, not DLC logo) | `h1` in `[data-pipeline-page-root]` first child row | `PipelinePageClient` 1499–1500 |
| Search field | `input[aria-label="Search pipeline"]` inside z-10 band | `PipelinePageClient` 1605–1610 |
| Colored stage pills | Buttons inside `[data-testid="operational-filter-drawer"]` | `PipelinePageClient` 1978–2008 |
| Column titles under overlap | `section[aria-label="… column"] > header` | `BoardColumn` / `PipelineBoardView` 89–101 |
| Clicks do nothing on cards | Event target = element inside z-10 band or fixed sheet scrim | Stacking F or fixed B |

**Exact component responsible for board header obscuring:** the **`PipelinePageClient` filter toolbar band** (`div` at **line 1597**), not `PipelineBoardView`, not `AppChrome` master header (unless the screenshot is cropped to only the board area below the page title).

---

## Step 6 — Proposed fix (do not implement in 25.11)

### Smallest fix (recommended)

| Action | Target | Change |
|--------|--------|--------|
| Remove hub-band elevation | `PipelinePageClient.tsx` **1597** | Remove `z-10` from the filter band; keep `relative shrink-0 border-b bg-background/95 backdrop-blur` (or drop `relative` if unused). |
| Keep menu layering | Same file dropdown nodes | Retain `absolute z-30` / `z-20` on individual menus (1531, 1844, 2170) — sufficient for dropdowns. |
| Optional isolation | `PipelinePageClient.tsx` **2532–2534** or `OperationalContentReveal` | Add `relative z-0` on board scroller so board paints as an explicit lower layer if any parent stacking context remains. |

**Expected visual result:** Filter card and board column headers stack vertically with no shared pixels at scrollTop=0; board headers fully opaque and readable; column cards and buttons receive clicks. Dropdowns in the filter row still open above adjacent controls.

### If scroll sticky overlap persists

| Action | Target | Change |
|--------|--------|--------|
| Hard-disable hub sticky | `PipelinePageClient.tsx` **2227** | Pass `sticky={false}` unconditionally (or keep 24.4P flag + verify `PipelineChromeDebugMount` sets `data-pipeline-master-layout-lock` on `/pipeline`). |
| Board scroll margin | `pipeline-board-scroll` wrapper | Add `scroll-margin-top` / `padding-top` equal to measured sticky chrome if orientation strip must stay sticky in future. |

### Do not do first

- Broad `overflow-x-hidden` on hub ancestors (regresses 18.8E board pan).
- Raising board z-index above modals/global overlays.
- Nested vertical `overflow-y` on `OperationalContentReveal` (violates scroll architecture).

---

## Success criteria — answers

| # | Question | Answer |
|---|----------|--------|
| 1 | Which component is overlapping? | **`PipelinePageClient` hub filter toolbar band** (`div.relative.z-10…`, lines **1597–2213**), covering **`BoardColumn` `<header>`** in `PipelineBoardView`. |
| 2 | Why is it overlapping? | The toolbar band creates a **higher stacking context (`z-index: 10`)** than the board (`z-index: auto`). Where geometry intersects (layout edge cases or scroll), the band **paints and captures input** over column headers. Mobile filter sheet **fixed inset-0** is a separate full-screen overlap. |
| 3 | Which CSS rule causes it? | Tailwind utility **`z-10`** on the filter band → `z-index: 10; position: relative`. Secondary: **`sticky` + `top: 0` + elevated z** on `OperationalOrientationStrip` when hub sticky is not purged; **`position: fixed; inset: 0`** on mobile `OperationalFilterDrawer`. |
| 4 | Which file owns the rule? | Primary: **`lender-app/app/pipeline/PipelinePageClient.tsx`** line **1597**. Secondary: **`lender-app/components/ui/OperationalOrientationStrip.tsx`** 155–157; **`lender-app/components/ui/OperationalFilterDrawer.tsx`** 147–149; backstop **`lender-app/app/globals.css`** 859–863. |
| 5 | Layout flow, positioning, z-index, height, or multiple? | **Multiple (I):** primary **z-index (F)**; conditional **sticky (C)**; mobile **fixed sheet (B)**. Not primarily missing height or flex collapse in source. |
| 6 | Smallest possible fix? | **Remove `z-10`** from the filter band at **1597**; keep per-dropdown z-index; optionally **`relative z-0`** on `[data-testid="pipeline-board-scroll"]`. |

---

## Runtime verification note

A local probe script (`lender-app/scripts/phase25-11-layout-probe.mjs`) was prepared to log `getBoundingClientRect` + computed style at breakpoints; production run failed with **401 INVALID_CREDENTIALS** (no valid session in `.env.local` for this environment). Re-run after auth:

```bash
cd lender-app
node scripts/phase25-11-layout-probe.mjs
```

Confirm on device: `boardHeaderOverlapAreaPx === 0` at scrollTop 0 on 1024×768 with Board tab; inspect `verticalGapToolbarToBoardHeader` ≥ 0.

---

## References

- `docs/scroll-architecture-rules.md` — single `#app-main-scroll` owner on hub  
- `docs/phase18-step8E-pipeline-overflow-forensics.md` — board horizontal scroller contract  
- `docs/phase24-4A-scroll-audit.md` — hub toolbar `relative z-10` inventory  
- `docs/phase24-4R-native-scroll-pwa.md` — mobile document scroll  
- `lender-app/lib/debug/phase24-4P-master-layout-lockdown.ts` — sticky purge  
