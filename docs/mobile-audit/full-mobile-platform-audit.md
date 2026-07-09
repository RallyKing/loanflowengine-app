# Full mobile platform audit — Direct Lending Connection

**Document type:** Production-grade mobile diagnostic (read-only).  
**Date:** 2026-05-07  
**Scope:** Entire `lender-app` surface — auth, shell, pipeline, tasks, contacts, lenders, ledger, documents, messaging, portal, settings, analytics, activity, intake, print/share flows.  
**Explicit exclusions:** No code fixes, refactors, or deploys as part of this audit.

---

## 1. Methodology

| Layer | What we did | Limits |
|-------|-------------|--------|
| **Static / code archaeology** | Mapped all `app/**/page.tsx` routes; traced `AppChrome`, `MobileChromeController`, `MobileBottomNav`, pipeline shell, drawers; grep for `overflow-y`, `sticky`, `fixed`, `dvh`, nested scroll; reviewed `AGENTS.md`, `docs/scroll-diagnostic/*`, `docs/material-design-system.md` | Does not prove runtime FPS or physical Safari quirks |
| **Automated Playwright** | Ran `tests/mobile/scroll/ci-mobile-scroll.spec.ts` on **Mobile Chrome** (Pixel 7 profile) with local `.env` auth | **Failed** — see §7; WebKit/Galaxy/iPad matrix not fully re-run in this pass (time + Windows WebKit caveats) |
| **Prior diagnostics** | Merged findings from `docs/scroll-diagnostic/final-scroll-diagnostic-summary.md` and related R1–R9 work | Some items predate current `PipelinePageClient` |

**What this audit does not replace:** Physical device testing (iPhone 15 Pro Max, real address-bar collapse, real keyboard), Lighthouse/CrUX in production, and React Profiler sessions with user flows.

---

## 2. Required device matrix (Section 1 spec vs tool reality)

| Requested | Playwright / automation equivalent | Gap |
|-----------|--------------------------------------|-----|
| iPhone SE | `devices["iPhone SE (3rd gen)"]` — `Mobile Safari SE` project | OK for small viewport |
| iPhone 14 Pro | `devices["iPhone 14 Pro"]` — `Mobile Safari` | OK |
| iPhone 15 Pro Max | **No stock preset** — recommend add `viewport: { width: 430, height: 932 }`, `deviceScaleFactor: 3`, `userAgent` iPhone | Not in default config; **manual / custom project required** |
| Pixel 7 | `Mobile Chrome` | OK |
| Galaxy S-series | `Galaxy S24` preset — `Mobile Chrome Galaxy` | OK as Samsung-class WebView/Chromium proxy |
| iPad | `iPad Pro 11` — `tablet` / `iPad` projects | OK |
| Android tablet | No dedicated preset in config | Use **custom viewport** (~800×1280) + Mobile Chrome; **gap** |
| Desktop baseline | `chromium`, `webkit` | OK |

**Orientation / resize / URL bar:** Playwright does not fully simulate iOS Safari dynamic chrome; rank confidence **medium** until manual iPhone passes.

---

## 3. Route inventory (every `page.tsx`)

| Route area | Path(s) | Mobile risk notes (summary) |
|------------|---------|-------------------------------|
| Home / redirect | `/` | Usually shell-dependent |
| Auth | `/sign-in`, `/sign-up` | `data-shell="auth"` — body scroll exception; touch targets tested in `sign-in-touch-targets.spec.ts` |
| Pipeline hub | `/pipeline` | **Forced table** on narrow viewports; **nested vertical scroll** + **wide table** (`min-w-[1500px]`); **CI scroll failure** on `<main>` |
| Pipeline file | `/pipeline/[fileId]`, `/pipeline/file/[fileId]/*` | Sticky chrome, ResizeObserver, compact mode — see scroll diagnostic |
| Intake | `/pipeline/intake/[[...slug]]` | Heavy forms, dropdowns, nested lists |
| Library / licenses | `/pipeline/library`, `/pipeline/licenses` | Tables / dense UI |
| Tasks | `/tasks` | Quadrants, subtasks, scroll regions (`max-h-[min(70vh,520px)]`), print |
| Contacts | `/contacts` | List + detail split; nested `overflow-y-auto` |
| Lenders | `/lenders` | Directory, scenario, discover, CSV — likely wide tables |
| Ledger | `/ledger`, `/print/ledger` | Tables, print |
| Documents | `/documents` | Uploads, previews |
| Activity | `/activity` | Feed + `overflow-y-auto` region |
| Analytics | `/analytics` | Charts — resize/SSR sensitivity |
| Settings | `/settings` | Long forms, accordions, block admin |
| Portal | `/portal`, `/portal/login`, `/portal/files`, `/portal/file/[fileId]`, `/portal/magic` | Separate UX; mobile client workflows |
| Share | `/share/[token]` | Public — limited chrome |
| Print terms | `/print/terms/[id]` | Print CSS |

---

## 4. Cross-cutting systems (shell)

- **`AppChrome`:** Multiple `<main data-app-main-scroll>` code paths with `touch-scroll-y`, `overflow-y-auto`, `min-h-0`.
- **`MobileBottomNav`:** `fixed bottom-0` — safe area + focus mode interaction.
- **`MobileChromeController`:** Scroll-linked compact chrome — **documented risk** (R1/R2/R3).
- **Drawers:** `TaskDrawer`, `LenderDrawer` — `h-dvh max-h-dvh min-h-0 overflow-y-auto` (bounded scrollports — correct pattern per `AGENTS.md`).
- **Global overlays:** `GlobalSearchPalette`, notifications bell, modals — each introduces secondary scroll/focus traps if mis-sized.

---

## 5. Automated test coverage vs platform breadth

**Covered (partial):** `tests/mobile/**` — pipeline hub heading smoke (auth), bottom nav, touch pan, CLS tripwire, sticky pipeline file, sign-in targets, scroll burst budget.

**Gaps:** No systematic per-block drawer tests; no ledger/documents/settings/portal matrix; no keyboard open/close automation; no orientation sweep; no iPhone 15 Pro Max preset.

---

## 6. Architectural headline (preview)

1. **Scroll ownership is inconsistent between “ideal contract” and pipeline list implementation** — `<main>` may not scroll when the pipeline **table** uses an inner `overflow-y-auto` scrollport (see `mobile-scroll-audit.md`, `mobile-issue-inventory.md`).
2. **Many legitimate secondary scrollports** (drawers, modals, max-height lists) — touch handoff and **scroll chaining** risk on iOS.
3. **Mobile chrome / sticky / RO** stack remains the highest systemic risk for jitter and CLS (prior R1–R3).

---

## 7. Automated evidence (this session)

**Command:** `npx playwright test tests/mobile/scroll/ci-mobile-scroll.spec.ts --project "Mobile Chrome"`

**Result:** **FAILED** — `expected scrollTop to change` on `[data-app-main-scroll]` after programmatic scroll on `/pipeline` post-login.

**Interpretation (high confidence):** Pipeline hub content is shorter than viewport **on `<main>`** *or* vertical overflow is absorbed by a **child** scroll container (see `PipelinePageClient.tsx` `overflow-y-auto` wrapper around the table). The test encodes the **single-scroll-owner** expectation; the product **violates** that expectation on pipeline list/table mode.

**Artifacts:** `lender-app/test-results/mobile-scroll-ci-mobile-sc-*` (screenshot, video, trace) — retain for engineering review.

---

## 8. Touch & interaction testing (Section 8 — assessment)

**Automated:** `tests/mobile/gestures/touch-pan-main.spec.ts` (core touch projects); pipeline scroll specs when auth is configured.

**Static risk patterns:**

- **`touch-pan-xy`** on pipeline table scroll region may **steal** diagonal gestures from `<main>`.
- **Drawers:** slide-in + internal scroll — test **edge swipe** vs browser back gesture (iOS).
- **Long-press / drag:** task matrix, board (desktop) — **not** validated for mobile; errands/subtasks use scroll regions — **conflict risk** unverified.
- **Keyboard:** no Playwright coverage for **`visualViewport`** resize on sign-in, intake, messaging composer.

**Recommendation:** Manual matrix: tap targets on smallest SE, keyboard open on `/tasks` compose and `/portal/messages`, drawer open while scrolling file.

---

## 9. Visual regression & stability (Section 9)

**Existing automation:** `npm run test:visual` — `tests/visual/mobile-shell.spec.ts` (authenticated shell baselines for desktop + Pixel + iPhone + iPad projects).

**Gap:** No visual baselines for **portal**, **ledger**, **settings**, **pipeline list table**, **compact vs expanded chrome states**, or **drawer open** states.

**Stability hypotheses (need captures):**

- **Compact chrome** transitions — watch for **flash** when crossing IO threshold.
- **Sticky file header** — snapshot after scroll stop vs mid-scroll (only if tests allow).
- **Modal open** — backdrop + panel repaint on low-end Android.

**Captured in this session:** Playwright **failure artifacts** for `ci-mobile-scroll` (screenshot, video, trace) under `lender-app/test-results/` — useful for **before/after** once scroll model is fixed. Update snapshots only in a **dedicated** fix pass, not during audit.

---

## 10. Deliverables index

| File | Contents |
|------|----------|
| `mobile-ux-assessment.md` | Usability, touch, workflows |
| `mobile-scroll-audit.md` | Scroll/sticky/viewport/safe-area |
| `mobile-performance-audit.md` | Perf hypotheses + profiling plan |
| `responsive-layout-audit.md` | Breakpoints, tables, overflow |
| `material-design-audit.md` | MD3-style compliance scoring |
| `mobile-issue-inventory.md` | Full categorized issues |
| `mobile-architecture-assessment.md` | Systemic patterns, health |
| `mobile-fix-roadmap.md` | Prioritized remediation |
| `mobile-critical-issues.md` | Critical-only fast path |

---

*End of full platform audit cover document.*
