# Scroll ownership remediation — Phase 1

**Date:** 2026-05-07  
**Scope:** Canonical vertical scroll owner = **`AppChrome` `<main data-app-main-scroll>`** for authenticated route bodies.  
**Out of scope (this phase):** UI redesign, Material Design refactors, animation system changes beyond touch/scroll gesture stability (`touch-pan-x` on hub table).

---

## Problem statement

Several routes wrapped primary content in **`overflow-y-auto`** + **`flex-1`**, creating a **second vertical scrollport** inside `<main>`. Effects:

- **`[data-app-main-scroll]`** did not change `scrollTop` while users scrolled the page (`ci-mobile-scroll` failure).
- **`MobileChromeController`** listens on `<main>` — compact chrome could **desync** from perceived scroll on those routes.
- iOS **momentum** and **sticky** `thead` were tied to the **inner** scroller instead of the shell.

---

## Canonical rule (post–Phase 1)

| Layer | Vertical scroll |
|-------|-----------------|
| **`AppChrome` `<main>`** | **Yes** — sole owner for route content |
| Pipeline hub table | **No** — `overflow-x-auto` only; `max-md:touch-pan-x` |
| Activity feed list | **No** — flows in `<main>` |
| Contacts list column | **No** — flows in `<main>` |
| Task / lender drawers | **Yes** (exception) — aside `h-dvh … overflow-y-auto` |
| Modals | **Yes** (exception) — capped `max-h-*` + internal scroll |
| Auxiliary `max-h-*` lists | **Yes** (exception) — e.g. contact detail activity |

---

## Code changes (summary)

| File | Change |
|------|--------|
| `app/pipeline/PipelinePageClient.tsx` | Removed `min-h-0 flex-1 overflow-y-auto` wrapper around table; merged horizontal scroll container; `touch-pan-xy` → **`touch-pan-x`** on narrow. |
| `app/activity/page.tsx` | Removed `flex-1 overflow-y-auto` from feed `<ul>`. |
| `app/contacts/page.tsx` | Removed `flex-1 overflow-y-auto` from list column wrapper. |

---

## Documentation updates

- `lender-app/AGENTS.md` — Contract §2–5 and checklists aligned with implementation.  
- `docs/scroll-architecture-rules.md` — Ownership section rewritten; pointer to this folder.  
- `docs/project-intelligence-summary.md` — Pipeline section 3 scrolling ownership line corrected.

---

## Sticky + observers

- Pipeline **table `thead`** `sticky top-0` now resolves against **`<main>`** (same as pipeline file chrome sticky).
- **`registerMainScrollContainer`** in `AppChrome` — unchanged; now receives scroll events when users scroll hub/activity/contacts.

---

## Follow-up (not Phase 1)

- Audit **`SaasSidebar` `nav`** (`overflow-y-auto`) — rail beside `<main>`, document as intentional if kept.  
- Grep remaining **`overflow-y-auto`** in `components/` for future route-adjacent wrappers.  
- Optional: **`tests/e2e`** specs that assumed inner pipeline scroll.

---

*Companion: `removed-scroll-containers.md`, `verified-scroll-owners.md`, `mobile-scroll-validation.md`.*
