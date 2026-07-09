# Mobile critical issues (fast path)

**Audit date:** 2026-05-07 · **Diagnostic only.**

This document lists **only** items that are **blocking** or **high-confidence production risks** for mobile. For the full set see `mobile-issue-inventory.md`.

---

## C1 — Pipeline hub: `<main>` does not vertically scroll (CI failing)

- **ID:** SCR-CRIT-001  
- **Why critical:** Breaks documented **single-scroll-owner** contract; **Playwright CI gate fails** (`ci-mobile-scroll`); users experience **unexpected scroll physics** (nested scroller).  
- **Evidence:** Automated test failure + `PipelinePageClient.tsx` `overflow-y-auto` table wrapper.  
- **Next step:** Product + eng choose: **move scroll to `<main>`** *or* **change governance + tests** to endorse nested scroll for hub.

---

## C2 — Governance / docs / tests contradict implementation

- **ID:** SCR-CRIT-002  
- **Why critical:** Teams will ship regressions because **mental model** is wrong; agents following `AGENTS.md` may **refactor incorrectly**.  
- **Evidence:** `AGENTS.md` vs nested scroll in `PipelinePageClient`; contradictory inline comment (~1065 vs ~1127).  
- **Next step:** Update **`AGENTS.md`**, **remove false comment**, align **`ci-mobile-scroll`** with chosen architecture.

---

## C3 — Mobile pipeline UX is a wide desktop table

- **ID:** UX-HIGH-001 (critical product impact)  
- **Why critical-for-users:** Phones **forced to table** + **`min-w-[1500px]`** — extreme horizontal panning; **not** competitive mobile CRM behavior.  
- **Evidence:** `effectiveView = narrow ? "table" : view` + table classes.  
- **Next step:** Design **mobile-first list** (cards) or **column-stripped** table; long-term board/tablet parity.

---

## C4 — Scroll-linked chrome instability (prior R1–R3)

- **ID:** SCR-HIGH-002  
- **Why critical on iPhone Safari:** Jank and CLS undermine trust in **core money workflow** (pipeline file).  
- **Evidence:** Prior `docs/scroll-diagnostic/*`; needs **fresh** device traces before coding.  
- **Next step:** iPhone Performance capture on file scroll + drawer open.

---

## Immediate action checklist (no code in audit)

- [ ] Preserve Playwright **artifacts** from failed `ci-mobile-scroll` run.  
- [ ] Schedule **physical** iPhone + Android pass for `/pipeline`, `/pipeline/[fileId]`, `/tasks`.  
- [ ] Decide **scroll ownership** policy for hub vs file vs tasks.  
- [ ] Add **missing** Playwright devices (15 Pro Max, Android tablet).  

---

*Full audit: `full-mobile-platform-audit.md` · Roadmap: `mobile-fix-roadmap.md`.*
