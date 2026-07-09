# Scroll architecture rules (mandatory)

**Status:** Permanent constraints for scroll ownership, sticky regions, and mobile stability.  
**Authoritative reconciliation:** **`docs/governance/runtime-workspace-scroll-authority.md`** (mental model + deprecated patterns — read first for pipeline file).  
**Deep dives:** `docs/scroll-diagnostic/*.md`, `lender-app/AGENTS.md`, `docs/workspace-sheet-scroll-model.md`.

---

## Ownership

1. **Default signed-in routes** — **`AppChrome` `<main>`** (`data-app-main-scroll`) is the **primary** vertical scroll owner. **`html` / `body`** stay locked (**no** document scroll) in the signed-in shell.

2. **Route bodies (hub, activity, contacts, etc.)** — Primary content is in **`<main>` flow**. Do **not** wrap full-width lists/tables in **`overflow-y-auto`** — it competes with `<main>` and breaks mobile compact chrome / `ci-mobile-scroll`. **Pipeline hub table:** horizontal **`overflow-x-auto`** only; on narrow viewports use **`touch-pan-x`** so vertical pans stay on `<main>`.

3. **Pipeline file workspace (`/pipeline/[convexFileId]`)** — Vertical scroll is **delegated** to **`[data-pipeline-workspace-scroll]`** inside `PipelineFileWorkspaceShell`. On this route, **`<main>`** is **`overflow-y-hidden`** (`data-main-scroll-mode="workspace-delegated"`). **`MobileChromeProvider`** attaches sentinel / listeners to the workspace scroller via `registerPipelineWorkspaceScroll`. See **`docs/workspace-sheet-architecture.md`**.

4. **Approved exceptions (bounded regions only):** overlay **task/lender drawers** (`h-dvh … overflow-y-auto`), **modals**, and **explicit `max-h-*`** auxiliary lists (e.g. contact detail activity). Use **`min-h-0`** on flex parents of those scrollports. Anything else needs architecture approval + tests.

5. **Policy** — **Never** introduce a **full-page** nested vertical scroller that competes with the **active** scroll owner (`<main>` **or** `[data-pipeline-workspace-scroll]`) without approval. See **`docs/scroll-fix-phase-1/scroll-ownership-remediation.md`**.

---

## Animations during scroll

- **Do not animate layout dimensions during scrolling** — Avoid transitions on padding, margin, min-height, grid row heights, or sticky stack heights driven by scroll position on the critical path.
- **Prefer transform / opacity** — Chrome show/hide and compact modes should animate via compositor-friendly properties.
- **Snap sheet** — On the pipeline file route, mobile snap uses **Vaul** (`PipelineWorkspaceMobileVaulFrame`); do not drive snap exclusively from `scrollTop` math.

---

## Observers and feedback loops

- **Avoid ResizeObserver feedback loops** — Combining RO → state → padding/class toggle → RO is a known failure mode. Debounce; snapshot; prefer `transform` over layout-affecting toggles. **Implemented patterns:** `docs/scroll-fix-phase-2/resizeobserver-fixes.md`, `docs/scroll-fix-phase-2/sticky-system-remediation.md`.

---

## Mobile overlap

- **Never create overlapping mobile UI** — Compact chrome, bottom nav, and overlays must cooperate (safe areas, z-index discipline, no duplicate fixed bars fighting each other).

---

## Touch and momentum

- **`touch-action` and touch scrolling** — Preserve **`touch-scroll-y`** on the **active vertical scrollport** (`<main>` or `[data-pipeline-workspace-scroll]`). Horizontal table strips: **`touch-pan-x`** where vertical must stay on the primary scroll owner.
- **Momentum scrolling** — Use patterns consistent with iOS Safari expectations (`touch-scroll-y` utility in `globals.css`).

---

## Validation

- Automated: `tests/mobile/**`, CLS tripwire specs, pipeline scroll suites, **`tests/mobile/workspace-sheet/**`**.
- Manual: physical iPhone + Android on release-grade changes.

---

## Exceptions

Formal exceptions require **explicit written approval** in PR/agent notes **and** tests proving no scroll trap / CLS regression.

---

*Canonical enforcement summary: `.cursor/rules/project-rules.mdc` + `docs/ui-ux-rules.md` + `docs/governance/workspace-sheet-governance.md` + **`docs/governance/runtime-workspace-scroll-authority.md`**.*
