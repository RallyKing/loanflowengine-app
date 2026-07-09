# Scroll ownership map — Pipeline File Workspace (mobile focus)

**Scope:** Diagnostic only. Describes **observed** scroll architecture from source as of repo inspection.  
**Primary route:** `/pipeline/file/[fileId]/deal` → `PipelineFileWorkspace` (and SaaS `/pipeline/...` equivalents under same shell).

---

## Executive summary

| Layer | Vertical scroll owner? |
|-------|-------------------------|
| `document` / `window` | **No** (body locked) |
| `<main data-app-main-scroll>` | **Yes — canonical** |
| `PipelineFileWorkspace` drawer body (`data-testid="pipeline-drawer-scroll"`) | **No** (`overflow-x-clip` only) |
| `PipelineFileWorkspaceShell` content column | **No** |
| Task / Lender drawers (when open) | **Yes — separate scrollports** (`aside` or inner div) |
| SaaS mobile sidebar | **Yes** (`nav` inside fixed aside) |

---

## 1. HTML / body (root)

**Files:** `lender-app/app/layout.tsx`, `lender-app/app/globals.css`

| Attribute / rule | Value |
|------------------|--------|
| `<html>` | `className` includes `h-full min-h-0` |
| `<body>` | From layout: `h-dvh min-h-0 overflow-hidden antialiased` (+ theme classes). |
| `globals.css` `body` | `height: 100%`, `overflow-x: clip`, **`overflow-y: hidden`** |
| Auth exception | `body[data-shell="auth"]` → `overflow-y: auto`, `-webkit-overflow-scrolling: touch`, `touch-action: pan-y` |

**Scroll ownership:** None on body in the signed-in shell.

---

## 2. `AppChrome` — classic scheme (non-SaaS)

**File:** `lender-app/components/AppChrome.tsx`

Approximate DOM:

```
div.flex.min-h-0.min-w-0.flex-1.flex-col.overflow-hidden
├── header[data-testid="app-masterpage-chrome"]   ← shrink-0, NOT inside <main>
│   ├── (expanded chrome grid)
│   └── (compact chrome grid — md:hidden)
├── (banner strip: ConvexConnectionStatus + OfflineSyncBanner in mobileScrollCollapseGridClass)
├── main[data-testid="app-main-scroll"][data-app-main-scroll]   ← ★ PRIMARY VERTICAL SCROLL OWNER
│   class: flex min-h-0 flex-1 flex-col touch-scroll-y overflow-y-auto overflow-x-clip overscroll-contain
│   ref: registerMainScrollContainer (MobileChromeProvider)
│   └── div (padding + mobileContentBottomPadTransition; pipeline-wide: max-w-none px-0 pt-0 …)
│       └── PageErrorBoundary → {children}
├── MobileBottomNav   ← fixed bottom-0 z-30
└── UserOnboardingChecklist
```

**Scroll ownership:** **`main` only** for page content.

**Fixed / non-scrolling chrome:**

- `MobileBottomNav`: `fixed bottom-0 left-0 right-0 z-30` (Classic + SaaS where rendered).
- Master `header`: flex sibling above `main`; does not scroll with pipeline content.

---

## 3. `AppChrome` — SaaS scheme

**File:** `lender-app/components/AppChrome.tsx`

```
div.relative.flex.min-h-0.min-w-0.flex-1.overflow-hidden
├── (mobile menu scrim: fixed inset-0 z-40 when saasMenuOpen)
├── SaasCollapsedNavRail (conditional)
├── SaasSidebar (max-md:fixed, h-dvh, nav with overflow-y-auto)   ← secondary scroll when open
├── div.flex.min-h-0.flex-1.flex-col
│   ├── header (masterpage chrome — SaaS variant)
│   └── main[data-app-main-scroll]   ← ★ PRIMARY for workspace column
│       └── … same pattern as classic
```

**Overlap:** When mobile drawer menu is open, **`suspendCompact`** is true on `MobileChromeProvider` (`scheme === "saas" && saasMenuOpen`), altering compact-mode logic (see `scroll-rerender-analysis.md`).

---

## 4. Mobile chrome context (not a scroll container)

**File:** `lender-app/components/MobileChromeController.tsx`

- Registers **`scrollEl`** = the `<main>` DOM node via `registerMainScrollContainer`.
- Does **not** create a scrollable element; only **observes** `scrollEl` (or `IntersectionObserver` with `root: scrollEl`) for compact/focus mode.

---

## 5. `PipelineFileWorkspace` (file deal page)

**File:** `lender-app/components/PipelineFileWorkspace.tsx`

Key classes:

```text
workspaceRootClass =
  "flex min-h-0 w-full min-w-0 flex-1 flex-col bg-background …"

workspaceBodyClass =
  "flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip pb-[max(1.5rem,env(safe-area-inset-bottom))]"
```

Structure:

```
PipelineWorkspaceSection (workspace-root)
  div[data-testid="pipeline-drawer-scroll"]   ← ★ NOT overflow-y; comment in code: "no nested overflow-y"
    PipelineFileWorkspaceShell
```

**Programmatic scroll:** `main.scrollTop = 0` when targeting `[data-testid="app-main-scroll"]` (navigation reset).  
**`jumpToDrawerSection`:** `scrollIntoView` on section ids (`#file-details`, etc.) inside **main** scrollport; double `rAF` + `setTimeout(..., 320)` for post-collapse reconcile.

---

## 6. `PipelineFileWorkspaceShell`

**File:** `lender-app/components/PipelineFileWorkspaceShell.tsx`

```
div[data-pipeline-file-workspace-shell]
├── header (sticky top-0, z from --pipeline-file-sticky-z, pointer-events-none on shell)
│   └── WorkspaceContentContainer (pointer-events-auto) → file chrome
├── div.relative.z-0.min-h-0.overflow-x-clip
│   ├── div[data-dlc-main-compact-sentinel] (1px, pointer-events-none)
│   └── WorkspaceContentContainer → utilities, layout strip, modular blocks
```

**Sticky:** File chrome `<header>` is **`position: sticky`** with **`top: 0`** relative to **`main`**’s scrollport (not `body`).

---

## 7. `WorkspaceContentContainer`

**File:** `lender-app/components/WorkspaceContentContainer.tsx`

- Classes: `mx-auto w-full min-w-0 max-w-full overflow-x-clip` + `max-w-[1400px]` + horizontal padding.
- **Not** a vertical scroll owner; **`overflow-x-clip`** only.

---

## 8. Collapsibles and cards (pipeline)

**Files:** `lender-app/components/CollapsibleSection.tsx`, `lender-app/lib/pipelineWorkspaceCard.ts`

- Animated collapse uses **`grid` + `grid-rows-[0fr]/[1fr]`** and inner **`min-h-0 overflow-hidden`** (`pipelineWorkspaceCollapseInner`).
- **Vertical scroll:** still delegated to `<main>`; inner regions **clip** while animating, not a second page scroll.

---

## 9. Overlays that take scroll ownership when open

| Surface | Scroll owner | File |
|---------|----------------|------|
| Task drawer (full screen) | Inner `div` with `flex-1 touch-scroll-y overflow-y-auto` | `TaskDrawer.tsx` `DrawerShell` |
| Task drawer (aside) | `aside` `h-dvh … overflow-y-auto` | `TaskDrawer.tsx` |
| Lender drawer | Same pattern | `LenderDrawer.tsx` |
| Global search | Inner list `overflow-y-auto` | `GlobalSearchPalette.tsx` |
| Help center | `overflow-y-auto` panels | `HelpCenterPanel.tsx` |
| Settings popovers / block settings | Captive `window` scroll listeners (positioning); panel may be `fixed` | Various |

When these are **closed**, they do not compete with `<main>`.

---

## 10. Visual hierarchy (classic pipeline file)

```text
viewport
 ├─ body [overflow-y hidden]
 │   └─ AppChrome column [overflow-hidden]
 │       ├─ header.masterpage [shrink-0] — does not scroll
 │       ├─ main [overflow-y AUTO] ◄══════════ SINGLE PAGE SCROLL
 │       │   └─ PipelineFileWorkspace
 │       │       └─ div.pipeline-drawer-scroll [overflow-x clip only]
 │       │           └─ PipelineFileWorkspaceShell
 │       │               ├─ header.file [STICKY top 0]
 │       │               └─ content (sections, collapsibles)
 │       └─ MobileBottomNav [FIXED bottom]
 └─ (portals: modals, tour, search — may be fixed + internal scroll)
```

---

## 11. Transforms / GPU layers touching scroll (pointer)

`mobileScrollCollapseGridClass` / `mobileScrollRevealInnerClass` apply **`translateY`** and **`opacity`** on **max-md** (see `transform-audit.md`). These wrap **masterpage chrome sections** and **pipeline regions**, not the `<main>` element itself.

---

## 12. Note vs `AGENTS.md`

`lender-app/AGENTS.md` still states `PipelineFileWorkspace` body uses `overflow-y-auto`. **Current** `workspaceBodyClass` is **`overflow-x-clip` only** (vertical scroll intentionally on `<main>`). Treat as **documentation drift**; architecture is “single main scroll” in code.

---

*End of scroll ownership map.*
