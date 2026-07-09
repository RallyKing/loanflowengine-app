# Enterprise UX / MD3 / Architecture Modernization — Audit Index

**Status:** Diagnostic and strategy only. **No code** in this folder.  
**Product:** Direct Lending Connection (`lender-app` + `convex/`).  
**Prior art:** Downstream of `docs/ux-audit/*` and binding policy (`docs/ai-development-rules.md`, `docs/scroll-architecture-rules.md`, `docs/workspace-sheet-*.md`, `docs/governance/*`, `lender-app/AGENTS.md`).

---

## Audit map

| # | Document | Purpose |
|---|----------|---------|
| 1 | [`master-enterprise-modernization-report.md`](master-enterprise-modernization-report.md) | Executive synthesis, top-25 lists, roadmap, leverage |
| 2 | [`material-design-3-system-map.md`](material-design-3-system-map.md) | Per-surface MD3 mapping; KEEP/MODIFY/REPLACE scores |
| 3 | [`side-sheet-master-plan.md`](side-sheet-master-plan.md) | Canonical side-sheet architecture + workflow conversions |
| 4 | [`snap-sheet-master-plan.md`](snap-sheet-master-plan.md) | Mobile snap canon + Vaul + scroll handoff |
| 5 | [`information-density-rebalance.md`](information-density-rebalance.md) | Crowded/sparse workflows, pins, progressive disclosure |
| 6 | [`fintech-trust-psychology-report.md`](fintech-trust-psychology-report.md) | Trust, professionalism, anxiety, portal |
| 7 | [`mobile-operations-audit-v2.md`](mobile-operations-audit-v2.md) | Operational vs responsive; ergonomics |
| 8 | [`performance-scale-ux-report.md`](performance-scale-ux-report.md) | Render/subscription/scroll/motion risks |
| 9 | [`system-unification-report.md`](system-unification-report.md) | Duplication, canonical primitives, deprecation |
| 10 | [`future-state-enterprise-blueprint.md`](future-state-enterprise-blueprint.md) | 12/24/36-mo blueprint; what not to rebuild |
| 11 | [`component-scorecard.md`](component-scorecard.md) | Major systems scored 1–10 + disposition |
| 12 | [`final-ranked-action-matrix.md`](final-ranked-action-matrix.md) | Prioritized action matrix |

---

## Priority order (execution-oriented)

1. **Critical:** Doc ↔ implementation reconciliation; `PipelineFileWorkspace` decomposition; hub table scale; unified **RecordInspectorShell**; contacts **links-first** closure.  
2. **High:** Semantic color roles; subscription **single-flight** patterns; **automation** + **portal** trust; **mobile hub** + **scenario** ergonomics.  
3. **Medium:** Tablet split experiments; tasks matrix virtualization; documents preview lifecycle; settings IA.  
4. **Low / Future:** Keyboard help overlay; Material You optional; persistent inspector rail on ultra-wide.

---

## Recommended reading order

1. **master-enterprise-modernization-report.md** — orientation + top risks/opportunities.  
2. **final-ranked-action-matrix.md** — execution-oriented sort.  
3. **material-design-3-system-map.md** — design-system grounding.  
4. **side-sheet-master-plan.md** + **snap-sheet-master-plan.md** — overlay architecture.  
5. **system-unification-report.md** + **component-scorecard.md** — engineering scope.  
6. **mobile-operations-audit-v2.md** + **performance-scale-ux-report.md** + **fintech-trust-psychology-report.md** — bar-raising pillars.  
7. **future-state-enterprise-blueprint.md** — north star.

---

## Cross-document relationships

| Theme | Primary docs |
|-------|----------------|
| Scroll governance | `snap-sheet-master-plan.md`, `performance-scale-ux-report.md`, policy: `docs/scroll-architecture-rules.md`, `docs/governance/workspace-sheet-governance.md` |
| MD3 adaptation | `material-design-3-system-map.md`, `master-enterprise-modernization-report.md` |
| CRM density | `information-density-rebalance.md`, `side-sheet-master-plan.md` |
| Mobile ops | `mobile-operations-audit-v2.md`, `snap-sheet-master-plan.md` |
| Trust | `fintech-trust-psychology-report.md` |
| Duplication | `system-unification-report.md`, `component-scorecard.md` |

---

## Highest-leverage findings (preview)

1. **Unified record inspector / side-sheet shell** for lender, task, contact, document metadata — one motion, elevation, header, footer pattern.  
2. **`PipelineFileWorkspace` decomposition** + subscription discipline — scale and cognitive load.  
3. **Semantic color system** decoupled from brand + SaaS scheme — fintech trust.  
4. **Hub virtualization + saved views** — operational CRM at 1k+ files.  
5. **Contacts model UX closure** (embedded vs links) — redundancy and operator confusion.

---

## Most dangerous issues (preview)

1. **Doc ↔ runtime drift** — **Reconciled** in **`docs/governance/runtime-workspace-scroll-authority.md`** + `docs/project-intelligence-summary.md` §3; keep maps aligned when changing shell code.  
2. **Monolithic file orchestrator** → rerender and regression risk.  
3. **Inconsistent high-frequency edit surfaces** (drawer vs modal vs inline) → training burden and trust dips.  
4. **Table scale** without virtualization on hub/lenders → mobile + desktop fragility.  
5. **Scheme/tint explosion** without semantic roles → mistaken confidence in state colors.

---

## Suggested implementation sequence (non-binding)

1. **Governance + tokens:** semantic palette spec; align docs.  
2. **Infrastructure:** `RecordInspectorShell` (conceptual) + motion/elevation contracts.  
3. **Migrate** TaskDrawer/LenderDrawer onto shell.  
4. **Split** `PipelineFileWorkspace` data/orchestration vs presentational regions.  
5. **Hub** performance (virtualize, views).  
6. **Snap** expansion (filters, scenario mobile).  
7. **Portal** trust pass.  
8. **Automation** transparency surfaces.

---

## Note on paths in the original audit brief

Earlier audits live under **`docs/ux-audit/`**, not `docs/full-fintech-ux-audit.md`. This modernization pack **assumes** those files as input.
