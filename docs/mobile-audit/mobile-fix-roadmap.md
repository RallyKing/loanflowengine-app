# Mobile fix roadmap (prioritized — planning only)

**Audit date:** 2026-05-07  
**Important:** This roadmap **does not** implement fixes; it sequences work after stakeholder sign-off.

---

## Phase 0 — Align truth (fast, low risk)

| Item | Approach | Risk | Effort | Dependencies |
|------|----------|------|--------|----------------|
| Fix `AGENTS.md` / comments vs real scroll model | Docs + delete misleading comment in `PipelinePageClient` | Low | **S** | None |
| Update `ci-mobile-scroll` | Either assert inner scrollport **or** move scroll to `<main>` | Low–Med | **S–M** | Product decision |
| Add Playwright preset **iPhone 15 Pro Max** + **Android tablet** | `playwright.config.cjs` | Low | **S** | None |

---

## Phase 1 — Critical production issues

| Item | Approach | Risk | Effort | Dependencies |
|------|----------|------|--------|----------------|
| **SCR-CRIT-001** scroll owner | **A)** Make `<main>` the vertical scroller on hub (remove inner `overflow-y-auto`), *or* **B)** Keep inner scroller and **formalize** “dual model” + tests | Med | **L** | UX approval |
| **SCR-HIGH-002** chrome jitter | Measure on device; apply hysteresis / sequence padding vs sticky height | Med | **L** | Profiler evidence |
| **PER-HIGH-001** large table | Pagination, lazy rows, or virtualization | Med–High | **L–XL** | Data API shape |

**Safest order:** Phase 0 → repro on iPhone → pick **A vs B** for hub scroll → only then touch chrome jitter (avoid two moving parts).

---

## Phase 2 — UX & responsive

| Item | Approach | Risk | Effort | Dependencies |
|------|----------|------|--------|----------------|
| **UX-HIGH-001** mobile pipeline | Ship **card/list** view for `narrow` *or* invest in mobile board | Med | **L–XL** | Design |
| Column prioritization | Hide low-value columns under `md` | Low | **M** | Product rules |
| **RESP-HIGH-001** intake/settings | Stack sections, increase tap targets | Med | **M–L** | None |

---

## Phase 3 — Performance

| Item | Approach | Risk | Effort | Dependencies |
|------|----------|------|--------|----------------|
| Profiler-driven fixes | CPU throttle traces | Low | **S** (analysis) | Device access |
| Tour listeners | Gate / passive / idle | Med | **M** | Product |

---

## Phase 4 — Material Design polish

| Item | Approach | Risk | Effort | Dependencies |
|------|----------|------|--------|----------------|
| Typography migration | `text-dlc-*` on hot mobile routes | Low | **M** | Design QA |
| Motion audit | `prefers-reduced-motion` sweep | Low | **M** | None |

---

## Phase 5 — Architecture (if needed)

| Item | Approach | Risk | Effort | Dependencies |
|------|----------|------|--------|----------------|
| Unify scroll strategy | Single documented model per route family | High | **XL** | Org buy-in |
| Extract pipeline table | Isolate scroll + virtual layer | High | **XL** | Phase 1 decision |

---

## Recommended sequencing (1–10)

1. Documentation + CI truth (Phase 0)  
2. Product decision: **hub scroll model**  
3. Implement hub scroll fix OR test realignment  
4. Device verify iPhone Safari + Galaxy  
5. Column hiding / responsive table MVP  
6. Profiler + chrome jitter fix  
7. Portal mobile test pack + bugfix wave  
8. Virtualization / pagination spike  
9. Intake/settings mobile pass  
10. MD typography + motion sweep  

---

*Issue IDs reference `mobile-issue-inventory.md`.*
