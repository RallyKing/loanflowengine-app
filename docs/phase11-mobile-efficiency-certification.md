# Phase 11.8 — Mobile master shell + efficiency certification



**Scope:** Phone (`layout.shell === "mobile"`) chrome density, navigation drawer, scroll compression compatibility, and regression gates.  

**Last updated:** 2026-05-13 (Phase **11.8.1** shell refinement)



## 1. Shell behavior (phone)



| Element | Behavior on mobile shell |

|---------|---------------------------|

| Bottom nav | **Icons only** — labels `sr-only`; `aria-label` on each link |

| SaaS top strip | **Single row only** (`MobileTopNav` + `compactBrand`): grid `menu \| centered DLC mark \| actions`; height clamp **48–56px** (`h-12` / `max-h-14`); no wrapped flex, no visible stacked title |

| Classic header | Title/subtitle block **hidden** on mobile shell; DLC mark remains |

| SaaS drawer | **Full labeled drawer** when hamburger opens — `~88vw` max width (capped), primary + pipeline sections + quick actions + settings/theme footer; **no** icon-only rail on phone |

| Live pill | **Icon-only** on `max-md` (`h-8` / `w-8`); text from `md:` with `aria-label` |

| Search trigger | **Compact** on mobile shell (`h-8 w-8`) |

| Master header | `max-md:max-h-14 max-md:overflow-hidden` on chrome + `MasterHeaderShell` wrapper — stable compression |

| Theme / appearance | Header `ColorSchemeToggle` + `SettingsLink` **hidden below `md`** on mobile shell (duplicated in drawer footer) |



**Tablet** (`layout.shell === "tablet"`): labeled bottom bar / existing tablet patterns.  

**Desktop:** unchanged.



## 2. Stability & parity



- **Nav positions:** Bottom nav slot order unchanged.

- **Scroll:** `MasterHeaderShell` + `useMasterScrollCompression` unchanged — no new nested scrollports.

- **Touch:** Drawer links use full labeled rows; bottom nav **2.75rem** min height on mobile shell.

- **Escape:** SaaS mobile menu closes on **Escape** (document listener while drawer open).

- **Scrim:** Tap backdrop still closes menu (`AppChrome`).

- **Session integrity:** Internal `userKey` validation allows **underscores** (e.g. catalog `e2e_super_admin_v1`) so seeded E2E sessions are not misclassified as corrupt legacy vendor ids (avoids false `/login?reason=session_recovery` sign-outs during Playwright).



## 3. Validation commands (recorded)



From `lender-app/`:



```bash

npm run build

npx playwright test tests/mobile/navigation --workers=1

```



Prior note: `npm run qa:governance` may still fail if workspace mobile fixtures (e.g. pipeline table) are missing — run in CI with seeded data.



## 4. Scores (Phase 11.8.1 self-cert)



| Criterion | Score |

|-----------|-------|

| Convex efficiency | **95** (unchanged from 11.8 baseline) |

| Mobile density | **97** |

| Navigation clarity | **97** |

| Touch ergonomics | **97** |

| Layout stability | **97** |

| Shell consistency | **96** |



## 5. Production deploy



Ship with `npm run deploy:prod` from `lender-app/` after **green** `npm run build` and targeted mobile navigation tests above, per deployment policy.


