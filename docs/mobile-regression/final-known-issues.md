# Final known issues — Phase 4 mobile regression

Issues listed here are **gaps or tooling limitations** observed during Phase 4. They are **not** necessarily product bugs.

---

## 1. Playwright: `mouse.wheel` unsupported on iPad WebKit project

**Symptom:** `Error: mouse.wheel: Mouse wheel is not supported in mobile WebKit` when running `tests/e2e/surface-scroll.spec.ts` and parts of `pipeline-scroll.spec.ts` under the **`tablet`** project (WebKit).

**Impact:** Tablet WebKit E2E cannot use wheel synthesis today; assertions that rely solely on `page.mouse.wheel` will fail even if the app behaves correctly.

**Mitigation (future test work, not done in Phase 4):** Fall back to `scrollMainBy` / `scrollBy` on `<main>` (see `tests/helpers/mobile/scroll.ts`) inside `assertMainScrollRespondsToWheel` when `browserName` is `webkit`, or skip wheel tests on that project with an explicit reason.

---

## 2. `pipeline-scroll` stress marker flake (chromium)

**Symptom:** Intermittent failure: `stress bottom marker should intersect scrollport` in `tests/e2e/pipeline-scroll.spec.ts` after scroll exercise.

**Impact:** Possible **data volume**, **timing**, or **scroll clamp** edge case — needs a second run or tighter wait for stress list rendering before scrolling.

**Mitigation:** Re-run the single spec; consider increasing scroll steps or marker wait if it persists.

---

## 3. `scrollTop` direct assignment on `<main>`

**Symptom:** Direct `main.scrollTop = main.scrollHeight` was unreliable in CI during investigation (including small `max` vs `0` scrollTop).

**Resolution in tests:** `ci-mobile-scroll.spec.ts` now uses **`scrollMainBy`** (`scrollBy`) after **`injectTallProbe`**, matching the gesture suite.

**Product note:** If similar patterns appear in app code, prefer **`scrollBy`** / `scrollTo({ behavior: "auto" })` for imperative scroll on elements with global `scroll-behavior: smooth` ancestors.

---

## 4. Mobile suite skips

Many `tests/mobile` cases require:

- `APP_AUTH_USERNAME` + `APP_AUTH_PASSWORD`, and/or
- `PERF_SCROLL_MS` (performance gate), and/or
- WebKit-on-Windows skip helper.

**Impact:** “22 skipped” in a full run is **expected** when optional env is missing or constraints apply. CI should pin required secrets for mandatory gates (`ci-mobile-scroll.spec.ts`, etc.).

---

## 5. Manual-only coverage

Not fully automated in Phase 4:

- Every **modal** variant and **form** wizard step  
- **iOS** keyboard overlap edge cases (vs Android `interactiveWidget: resizes-content`)  
- **Production** authenticated flows without running `run-mobile-prod-playwright.mjs`  

See `production-mobile-verification.md` for the manual matrix.

---

## 6. ESLint warnings (pre-existing)

`npm run build` reports **react-hooks/exhaustive-deps** warnings in several files. They are **not** Phase 4 regressions but remain **tech debt** for a clean CI gate if warnings are promoted to errors later.
