# Sticky & fixed element audit — pipeline file + mobile chrome

**Diagnostic only.**

---

## 1. Master page chrome (outside `<main>`)

**File:** `lender-app/components/AppChrome.tsx`

| Element | Position | Notes |
|---------|----------|--------|
| Site `header` (masterpage) | Static (flex `shrink-0`) | **Not** `sticky`; stays at top of flex column while **`main`** scrolls independently below. |
| SaaS hamburger scrim | `fixed inset-0 z-40` | When `saasMenuOpen`. |
| `MobileBottomNav` | `fixed bottom-0 z-30` | See `MobileBottomNav.tsx`. |

**Interpretation:** There are **two** “headers” in play on mobile file view: (1) global master header, (2) **sticky** pipeline file header **inside** `main`.

---

## 2. Pipeline file sticky chrome

**File:** `lender-app/components/PipelineFileWorkspaceShell.tsx`

| Property | Value |
|----------|--------|
| Element | `<header role="banner">` |
| Position | `sticky top-0` |
| Z-index | Tailwind `z-[var(--pipeline-file-sticky-z)]`; token `--pipeline-file-sticky-z: 30` in `globals.css` |
| Pointer | `pointer-events-none` on header; `pointer-events-auto` on `WorkspaceContentContainer`; chrome `PipelineWorkspaceSection` uses `pointer-events-none` + content `pointer-events-auto` |
| Transitions | `mobileCompactTransition`, `mobileFocusChromeTransition` (`padding`, `gap`, `box-shadow`, `min-height`, `font-size` + focus variants with `transform`/`opacity`) |
| Dynamic height | `ResizeObserver` + layout effect on `compact` / `isSnoozed` sets `--header-height` / `--pipeline-file-sticky-height` on shell |

**Scroll-margin:** `globals.css` applies `scroll-margin-top` to pipeline sections under `[data-app-main-scroll] [data-pipeline-file-workspace-shell]` using measured height + `--pipeline-scroll-anchor-gap`.

---

## 3. Height-changing regions during scroll (mobile)

**Files:** `lender-app/lib/mobileCompactChrome.ts`, `lender-app/components/MobileChromeController.tsx`, `lender-app/components/AppChrome.tsx`

| System | What changes height | When |
|--------|---------------------|------|
| Compact / focus mode | Master header padding, button sizes, collapsed grid rows (`0fr` vs `1fr`) | `compactChrome` true on mobile (`<md`) |
| Pipeline file chrome | Padding / border emphasis | Same `isMobileCompactMode` / focus drives `PipelineFileWorkspaceShell` classes |
| `mobileScrollCollapseGridClass` | **Grid row** animation + `overflow-hidden` | Banners, utility chrome visibility strips |
| `mobileContentBottomPadTransition` | **`padding` on `<main>` inner wrapper** | Focus vs normal (bottom nav clearance vs minimal pad) |

**Layout shift risk (diagnostic):** When compact toggles, **simultaneous** changes to: master header height, file sticky header height, **main** bottom padding, bottom nav `translate-y`, and optional opacity on chrome subrows. Each can change **`main` scroll height** and **visual viewport** occupation → user may perceive “jump” if scroll position is not compensated.

---

## 4. Sticky inside overflow / transform parents

| Candidate | Sticky element | Parent chain (simplified) | Issue? |
|-----------|----------------|---------------------------|--------|
| File chrome | `header.sticky` in shell | Shell → drawer body (`overflow-x-clip`) → workspace → `main` (`overflow-y-auto`) | Sticky reference is **`main`** scrollport. **`overflow-x-clip`** on ancestors: spec-wise does not clip y; **verify WebKit**. |
| File chrome | — | Collapsible **siblings** use `overflow-hidden` **below** sticky header | Sticky header is **not** descendant of those grids — **OK**. |
| Master header | N/A (not sticky) | — | — |
| `SaasSidebar` | `md:sticky md:top-0 md:h-dvh` | Desktop column | Different breakpoint from mobile file scroll issues. |
| Pipeline **table** (list page) | `thead sticky top-0 z-10` | `PipelinePageClient.tsx` | Not file route; pattern reference. |

**Transformed parents:** `mobileScrollRevealInnerClass` applies `translateY` on **max-md** to **inner** reveal wrappers. Sticky file header is **outside** those wrappers (shell structure). **Risk** if future refactor wraps **entire** shell including sticky inside a `transform` parent — would break sticky containing block.

---

## 5. Fixed elements interacting with scroll

| Component | Position | Z | Notes |
|-----------|----------|---|-------|
| `MobileBottomNav` | fixed bottom | 30 | `translate-y-full` + opacity when `isMobileFocusMode` |
| `ContextualQuickTip` | fixed | 28 | (from prior grep) |
| `UserOnboardingChecklist` | fixed | 45 | |
| `TaskDrawer` / `LenderDrawer` | fixed inset-0 / aside | 30 | |
| `GlobalSearchPalette` | fixed overlay | 100+ | |
| `HelpCenterPanel` | fixed | 110+ | |
| `ProductTourOverlay` | fixed layers | 60–62 | |

**Overlap with sticky z=30:** Task drawer and bottom nav share **z-30** with file sticky header — stacking depends on **DOM order** and paint order.

---

## 6. Compact chrome minimization — semantics

**File:** `lender-app/components/MobileChromeController.tsx`

- **Non–pipeline-file routes:** Passive `scroll` on `<main>`, rAF-coalesced, updates `compactChrome` from `scrollTop` delta + thresholds (`TOP_EXPAND_PX`, deltas).
- **Pipeline file:** `registerMainCompactSentinel` + `IntersectionObserver` with `root: scrollEl`, `threshold: 0` — toggles compact when sentinel leaves/enters.

**Implication:** Compact behavior differs **by route** (IO binary vs scroll-direction heuristic) — possible **inconsistent feel** between pipeline hub vs file (diagnostic, not a fix proposal).

---

## 7. Animated headers summary

| Animation | Properties | File(s) |
|-----------|------------|---------|
| Master + file chrome | padding, gap, box-shadow, min-height, font-size | `mobileCompactTransition`, shell classes |
| Focus chrome | adds transform, opacity, padding | `mobileFocusChromeTransition` |
| Collapse grids | grid-template-rows | `mobileScrollCollapseGridClass` |
| Reveal inners | opacity, transform (`translateY`) | `mobileScrollRevealInnerClass` |
| Bottom nav | transform, opacity | `mobileNavTransformTransition` |
| Task drawer aside | `animate-slide-in-right` | `globals.css` keyframes `translateX` |

---

*End of sticky audit.*
