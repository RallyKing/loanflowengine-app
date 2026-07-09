# Verified scroll owners — Phase 1

**Canonical vertical scroll:** `AppChrome` → `<main data-testid="app-main-scroll" data-app-main-scroll>` — `overflow-y-auto`, `touch-scroll-y`, `min-h-0`, `flex-1` (column shell).

**Registration:** `ref={registerMainScrollContainer}` on `<main>` — **`MobileChromeController`** uses this element for scroll listeners / `IntersectionObserver` `root`.

---

## Authenticated routes — verified behavior

| Route / surface | Vertical scroll owner | Notes |
|-----------------|----------------------|-------|
| Global shell | `<main>` | Header / nav / bottom nav are siblings |
| `/pipeline` | `<main>` | Table: horizontal strip only |
| `/pipeline/[fileId]` | `<main>` | Sticky file chrome inside flow |
| `/activity` | `<main>` | Feed list in document flow |
| `/contacts` | `<main>` | List column in flow; detail `max-h-64` list still nested |
| `/tasks` | `<main>` | Errand sub-panel bounded exception |
| Drawer overlays | Aside element | `h-dvh max-h-dvh min-h-0 overflow-y-auto` |
| Auth (`/sign-in`) | `<body data-shell="auth">` | Documented exception — not this matrix |

---

## Horizontal scroll (not vertical owners)

| Element | Overflow |
|---------|----------|
| `#pipeline-table-scroll` | `overflow-x-auto` only |
| Pipeline board strip | `overflow-x-auto` |
| Wide tables elsewhere | Prefer `overflow-x-auto` + `touch-pan-x` on mobile where vertical must stay on `<main>` |

---

## Tests referencing scroll contract

- `tests/mobile/scroll/ci-mobile-scroll.spec.ts` — expects `<main>` `scrollTop` to change on `/pipeline` after login.
- `tests/mobile/layout/app-chrome-scroll-owner.spec.ts` — main present.
- `tests/helpers/mobile/scroll.ts` — helpers assume main scroller.

---

*Phase 1 complete as of code + doc merge; physical iOS/Android spot-check still recommended.*
