# Mobile scroll validation — Phase 1

## Automated (local)

**Recommended commands** (`cwd: lender-app/`):

```bash
npm run build
npm run test:mobile
```

**Core gate:** `tests/mobile/scroll/ci-mobile-scroll.spec.ts` — **`Mobile Chrome` + `Mobile Safari`** — verifies `<main>` scrolls on `/pipeline` with `APP_AUTH_*` set.

**Broader:** `npm run test:mobile:matrix` — extended handsets on `tests/mobile/**`.

**Note:** Playwright **WebKit on Windows** may flake against `localhost`; use macOS/Linux CI or `PW_BASE_URL` to a deployment if needed.

**Stale server / missing CSS:** If `PW_BASE_URL` or a long-lived `next start` points at an **older** `.next` build than your latest `npm run build`, the HTML may reference a CSS chunk that **no longer exists** (`<link rel="stylesheet">` never gets a `sheet` object, globals never apply, and `getComputedStyle(document.body).overflowY` stays `visible`). By default Playwright **does not** reuse an existing server (`reuseExistingServer` is only when `PW_REUSE_EXISTING_SERVER=1`). Prefer `npm run test:mobile` after a fresh build, or align `PW_BASE_URL` with the same build you just compiled. Helpers `waitForLinkedStylesheets` / `waitForAppShellBodyScrollLock` fail fast with pending stylesheet URLs when this happens.

**Mobile Safari + `http://`:** The Playwright-managed `next start` sets `PW_ALLOW_INSECURE_SESSION_COOKIE=1` so `/api/auth/login` can omit the `Secure` flag on the session cookie (WebKit rejects `Secure` cookies for `http://127.0.0.1` while `NODE_ENV` is `production`). Production deployments over HTTPS are unchanged.

---

## What Phase 1 validates

| Check | How |
|-------|-----|
| Single vertical scroller on hub | `ci-mobile-scroll` programmatic `scrollTop` on `[data-app-main-scroll]` |
| `touch-action` on `<main>` | Expect `pan-y` in same spec |
| No nested hub table `overflow-y` | Code inspection + scroll test |
| Horizontal table still works | Manual: pan table on Pixel profile |
| Compact chrome | Manual / follow-up: scroll hub on iPhone — `MobileChromeController` now receives main scroll |

---

## Manual matrix (required for release sign-off)

- [ ] **iPhone Safari** — `/pipeline` vertical scroll entire page; table pans horizontally; sticky thead vs main.
- [ ] **Android Chrome** — same.
- [ ] **Rotate** portrait/landscape — no dead zones on hub/activity/contacts.
- [ ] **Keyboard** — ensure no regression on search inputs (no Phase 1 keyboard changes expected).

---

## Known residual risk

- **Very long pages** + **`flex-1` page roots** — if any route still caps height without visible overflow, file a follow-up; Phase 1 removed the known competing `overflow-y-auto` shells on hub/activity/contacts list.
- **`SaasSidebar` nav scroll** — orthogonal rail; document if UX feels “double scroll” on desktop.

---

*Remediation index: `scroll-ownership-remediation.md`.*
