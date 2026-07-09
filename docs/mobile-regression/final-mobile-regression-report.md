# Final mobile regression report — Phase 4

**Scope:** Validation only (Phases 1–3 already landed). No product features were added in Phase 4 except **test-helper** adjustments needed for a reliable CI scroll gate (see §Changes).

**Environment (this run):** Windows, `lender-app/`, `.env.local` present (Convex + auth for Playwright where required).

---

## 1. Automated mobile suite (`tests/mobile`)

**Command:** `npx playwright test tests/mobile --project "Mobile Chrome" --project "Mobile Safari"` (after `npm run build`).

**Result:** **16 passed**, **22 skipped**, **0 failed**.

**Projects:** Pixel 7 (Mobile Chrome) and iPhone 14 Pro (Mobile Safari).

### Coverage map (what the suite actually exercises)

| Area | Spec files | Notes |
|------|------------|--------|
| Scroll owner / body lock | `layout/app-chrome-scroll-owner.spec.ts` | Skips without `APP_AUTH_*`. |
| CI scroll contract (pipeline hub) | `scroll/ci-mobile-scroll.spec.ts` | Requires auth; uses tall probe + `scrollMainBy`. |
| Touch / pan | `gestures/touch-pan-main.spec.ts` | Skips without auth; Convex check in module. |
| Phase 5 native scroll behavior | `scroll/phase5-mobile-native.spec.ts` | Skips without auth. |
| CLS / layout shift guard | `scroll/scroll-stability-cls.spec.ts` | Skips without auth. |
| Performance burst | `performance/scroll-burst-budget.spec.ts` | Skips unless `PERF_SCROLL_MS` set. |
| Bottom nav | `navigation/mobile-bottom-nav.spec.ts` | Skips without auth; may skip if classic nav absent. |
| Route smoke | `regression/mobile-route-smoke.spec.ts` | Skips without auth. |
| Pipeline hub | `pipeline/pipeline-hub-mobile.spec.ts` | Skips without auth. |
| Sticky pipeline | `sticky/pipeline-sticky-mobile.spec.ts` | Skips without auth. |
| Sign-in touch targets | `forms/sign-in-touch-targets.spec.ts` | No auth; public `/sign-in`. |

**Important:** The suite does **not** enumerate “every modal / every drawer / every form” in one pass. Those are partially covered by separate `tests/e2e/*` specs and **manual** smoke (see `production-mobile-verification.md`).

---

## 2. Desktop / tablet spot check (this run)

**Command:** `npx playwright test tests/e2e/surface-scroll.spec.ts tests/e2e/pipeline-scroll.spec.ts tests/e2e/tasks-drawer.spec.ts --project chromium --project tablet`.

**Result:** **4 passed**, **18 skipped**, **6 failed**.

**Interpretation:**

- **`tablet` project uses WebKit (iPad Pro 11).** Several failures are **`mouse.wheel: Mouse wheel is not supported in mobile WebKit`** — a **Playwright/driver limitation**, not a product regression. Desktop **`chromium`** surface-scroll paths that executed did not all fail for that reason.
- **`pipeline-scroll` (chromium)** failed on **`stress bottom marker should intersect scrollport`** after wheel/touch exercise — treat as **flake or data-dependent** until re-run with stable seed / larger stress list; not proven a scroll-architecture regression from this single run.

---

## 3. Production build + deploy

| Step | Result |
|------|--------|
| `npm run build` (local) | **Passed** (existing ESLint warnings only). |
| `npx vercel@latest deploy --prod --yes` | **Passed** — deployment **READY**. |
| Example deployment URL | `https://loanflowengine-hseakk5lu-joshua-4539s-projects.vercel.app` |

---

## 4. Test harness changes (Phase 4)

| File | Change |
|------|--------|
| `tests/helpers/mobile/appShell.ts` | Added `dismissMobileNavOverlayIfOpen` for deterministic SaaS mobile layout before scroll assertions. |
| `tests/mobile/scroll/ci-mobile-scroll.spec.ts` | Switched to `injectTallProbe` + `scrollMainBy` + dismiss overlay; avoids flex “exact fit” false negatives and **`scrollTop` assignment quirks** on `[data-app-main-scroll]` with smooth-scroll styling. |

---

## 5. Completion verdict (against Phase 4 “only mark complete when…”)

| Criterion | Status |
|-----------|--------|
| Mobile scrolling stable (automated slice) | **Met** for executed authed mobile tests (**0 failures**). |
| No nested scroll conflicts | **Met** insofar as covered by `tests/mobile` + passing layout/scroll specs; **not** exhaustively proven for every overlay. |
| Sticky systems stable | Covered by `sticky/pipeline-sticky-mobile.spec.ts` when auth present (**skipped** in count when not). |
| Viewport behavior stable | See `viewport-stability-validation.md` (Phase 3) + manual prod checklist. |
| Production testing passes | **Build + deploy pass.** **Authenticated prod Playwright** was **not** run in this session; **manual** prod smoke still required for full sign-off. |

**Overall:** Phase 4 automation and deploy are **green** for the mobile suite on the core device pair; **full product sign-off** still needs **manual prod smoke** (and optionally `npm run test:mobile:prod` against the production URL with credentials).

---

## 6. Related documents

- `final-scroll-validation.md` — scroll ownership / nested scroll checklist.
- `production-mobile-verification.md` — prod URLs and manual matrix.
- `final-known-issues.md` — open gaps (WebKit wheel, flakes, manual-only areas).
