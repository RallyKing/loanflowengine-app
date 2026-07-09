# Mobile scroll & viewport audit

**Audit date:** 2026-05-07 · **Diagnostic only.**

---

## 1. Declared architecture (target state)

From `AGENTS.md` + `docs/scroll-diagnostic/final-scroll-diagnostic-summary.md`:

- `html`/`body` **locked** — no document scroll in signed-in shell.
- **`AppChrome` `<main data-app-main-scroll>`** intended as **primary** vertical scroll for most routes.
- **Pipeline file** uses **sticky** header inside `<main>` (not `fixed` document header) — valid.
- **Drawers/modals** are **bounded** secondary scrollports — expected.

---

## 2. Observed implementation conflicts

### 2.1 Pipeline list (`/pipeline`) — nested vertical scroll

**Source:** `app/pipeline/PipelinePageClient.tsx`

- Table mode wraps content in:
  - `div.min-h-0.flex-1.overflow-y-auto` (vertical scrollport)
  - Inner `data-testid="pipeline-table-scroll"` with `overflow-x-auto`, wide `min-w-[1500px]` table.
- Comment in file claims: *“Single vertical scrollport is AppChrome `<main>`. No nested overflow-y here”* — **incorrect for `effectiveView === "table"`**, which **always applies on narrow viewports** (`effectiveView = narrow ? "table" : view`).

**Consequence:**

- Vertical scroll **may occur inside the table wrapper**, not on `<main>`.
- **`ci-mobile-scroll` failure** (main `scrollTop` unchanged) **confirms** the mismatch under automation.

**Severity:** **High** (contract + CI + real user scroll physics).

### 2.2 Pipeline board vs table on mobile

- **Board view disabled** when `narrow` — users **cannot** use kanban on phone; they get **table**. Product choice with major UX implications.

### 2.3 Other nested scroll surfaces (expected but high-touch)

| Surface | Pattern | Risk |
|---------|---------|------|
| `TaskDrawer` / `LenderDrawer` | `h-dvh … overflow-y-auto` | Low if `min-h-0` chain intact |
| `PipelineFileActivityPanel` | `max-h-72 overflow-y-auto` | Medium — list inside already complex page |
| `contacts/page.tsx` | Main list `overflow-y-auto` + inner lists | Medium |
| `activity/page.tsx` | `flex-1 overflow-y-auto` | Medium |
| `SaasSidebar` `nav` | `overflow-y-auto` | Low (aside) |
| Intake `IntakeEditor` dropdown | `max-h-[min(24rem,70dvh)] overflow-y-auto` | Medium — portal stacking |

### 2.4 Sticky regions

- **Pipeline file shell** — sticky chrome + ResizeObserver-driven CSS vars (`--header-height`). Prior diagnostics: **R3** dynamic sticky height → scroll-margin + reflow risk.
- **Pipeline table `<thead>`** — `sticky top-0` **inside inner scrollport** — correct *for that scrollport* but **two sticky layers** exist (app header vs table header) depending on scroll position — **verify** no clash on small screens.
- **`ShareView` header** — `sticky top-0` — verify against app chrome.

### 2.5 Mobile compact / focus modes

- `MobileChromeController` — scroll listeners + IO; **transform-only** bottom nav — good.
- **Risk:** Simultaneous **main padding** + chrome measurement still linked to scroll (prior **R1**).

### 2.6 Viewport units & Safari

- Mix of `dvh`, `vh`, `min(90dvh,…)` in modals — generally good for mobile.
- **iOS Safari** dynamic toolbars still cause **100vh** edge cases — grep shows some `vh` in modals (`max-h-[min(90vh,640px)]`) — **medium risk**.

### 2.7 Safe areas

- Pipeline file workspace applies `pb-[max(1.5rem,env(safe-area-inset-bottom))]` — good pattern.
- **Verify** all `fixed bottom` layers (bottom nav, FABs) compose with safe area.

### 2.8 Momentum & `touch-action`

- `<main>` uses `touch-scroll-y`; table region uses `max-md:touch-pan-xy` — **horizontal + vertical** competition possible on diagonal swipes.

---

## 3. Scroll trap checklist (hypotheses to verify on device)

- [ ] Pipeline list: user tries to scroll “the page” but only table body moves (or vice versa).
- [ ] Pipeline list: user reaches end of inner scroll but expects more content below filters.
- [ ] Drawer open: `<main>` scroll locked — focus management OK?
- [ ] iOS: rubber-band at wrong container.

---

## 4. Visual stability (scroll-linked)

- CLS tripwire spec: `tests/mobile/scroll/scroll-stability-cls.spec.ts` — use as **regression**, not full guarantee.
- Watch **font loading**, **sticky height measurement**, **image** loads on first paint.

---

## 5. Recommendations (for future fix phase — not executed here)

1. **Reconcile** pipeline list scroll model with governance docs — either **move** vertical scroll ownership to `<main>` (remove inner `overflow-y-auto`) **or** formally demote `<main>` for `/pipeline` and update tests + `AGENTS.md`.
2. **Add Playwright** that scrolls **`pipeline-table-scroll`** / inner wrapper — not only `<main>`.
3. **Custom project** iPhone 15 Pro Max + Android tablet viewport.

---

*Linked: `mobile-issue-inventory.md` (SCR-\*), `mobile-architecture-assessment.md`.*
