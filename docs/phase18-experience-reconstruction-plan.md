# Phase 18 — Experience Reconstruction Plan

**Status:** Phase **18.1 COMPLETE** — see `docs/phase18-step1-operational-shell-stabilization.md`. Phase **18.2+** not started.  
**Prerequisite:** Operator review of `docs/ux-audit-*.md` + `migration-reports/phase17-5-product-experience-audit.json`  
**Constraints inherited:** No ACL/schema/graph logic in UI program unless explicitly scoped; preserve scroll contracts; mobile QA + deploy per governance when shipping.

---

## Executive intent

Transform Direct Lending Connection from a **dense admin workspace** into a **fluid operational cockpit** by standardizing orientation, disclosure, rows, and visual dialect on the **pipeline hub** and **CRM surfaces**, using the file workspace (post–17.3/17.4) as the reference pattern.

---

## 1. Safest migration order

| Order | Work package | Risk |
|-------|--------------|------|
| 1 | Hub orientation strip (read-only metadata, no data changes) | Low |
| 2 | Events/shared rows → `RowShell` | Low |
| 3 | Role badge unification | Low |
| 4 | Sharing panel presentational extract | Medium |
| 5 | `PipelineHubFileRow` → `RowShell` | Medium |
| 6 | Hub toolbar disclosure + overflow (mirror 17.3) | Medium |
| 7 | Delete confirm pattern unification | Medium |
| 8 | Hub filter drawer (collapse chips) | Medium |
| 9 | Mobile hub default cards + parent path | Medium |
| 10 | `PipelineTableRow` trailing actions / density only | **High** |
| 11 | Contacts responsive rows | High |
| 12 | Intake visual island | High (defer optional) |

---

## 2. Highest UX pain points

1. **Pipeline hub toolbar** — simultaneous filters, projection, views.
2. **Table vs card vs board affordance split** for same loan file.
3. **Projection vs `/tasks` / `/lenders`** duplicate entry.
4. **Missing parent path** on projection rows at scale.
5. **14-column mobile table** mode.
6. **Three sharing dialects**.
7. **Operations vs Activity** nav confusion.
8. **Contacts legacy density**.

---

## 3. Highest visual instability points

1. `PipelinePageClient` hub chrome (dialect B dominant).
2. `PipelineTableRow` analyst density.
3. Stage chip rainbow wrap.
4. Intake/deal workspace island.
5. Ad-hoc `shadow-sm` cards vs `dlc-surface-card`.

---

## 4. Lowest-risk wins

- Hub context strip (labels only).
- Events list `RowShell` migration.
- `hubRowActionPrimitives` deprecation re-exports.
- Saved-view CTA copy (link existing settings).
- Nav catalog description tooltips (Operations vs Activity).
- Parent path text on `PipelineHubFileRow` (data already in graph index).

---

## 5. Progressive disclosure rollout

| Phase | Surface | Action |
|-------|---------|--------|
| 18.1 | Hub toolbar | HeaderDisclosure pattern for filters |
| 18.2 | Hub stage chips | Collapse to menu when >8 stages |
| 18.3 | Task drawer | Default collapse secondary sections |
| 18.4 | Sharing | Collapse invite form |
| 18.5 | Table | Column picker; analyst columns off by default mobile |

---

## 6. Workspace focus stabilization

- **Default:** hub filters collapsed to “Active stages” + search only.
- **File:** keep utilities collapsed; promote focus mode hint on mobile.
- **Notifications:** batch digest UI (future) — reduce reactive noise.
- **Single Create** on hub — reduce modal scatter.

---

## 7. Responsive reconstruction order

1. Pipeline hub mobile cards default + kill table-on-phone.
2. Hub toolbar single-row collapse behavior.
3. Tasks page filter sheet polish.
4. Contacts card layout.
5. Ledger/analytics tablet breakpoints.
6. Intake overflow (optional track).

---

## 8. Interaction standardization plan

1. Destructive → `ConfirmActionSheet` / `OverlayShell` matrix documented.
2. All row actions → `ActionSuite` + hover reveal policy doc.
3. Disclosure → `HeaderDisclosure` | `ProgressiveDisclosureCard` only.
4. Overlay inventory gate (no new raw `fixed inset-0`).
5. Snooze → shared `SnoozeMenu` entry points list in AGENTS.md.

---

## 9. Hierarchy visualization improvements

1. Breadcrumb on hub when client/project filtered.
2. Parent path on every projection row.
3. Relationship badge glossary (tooltip).
4. Board ↔ hierarchy filter link.
5. URL sync for `hubClient` / `hubProject` / projection mode.

---

## 10. Design language unification sequence

1. UI primitives 100% DLC tokens.
2. Hub cards + toolbar → `dlc-surface-*`, `shadow-dlc-1`.
3. Shared/events rows.
4. Hub stage chips → tokenized pills.
5. Table row heights tied to `tableDensity`.
6. Intake sub-theme (later).

---

## 11. Operational cockpit transformation strategy

| Pillar | Tactic |
|--------|--------|
| **Orient** | Context strip on every list route |
| **Focus** | One primary action; overflow the rest |
| **Depth** | Layered disclosure, not flat stacks |
| **Scale** | Search-first + saved views + pagination on sharing |
| **Coherence** | One row dialect, one confirm dialect, one sharing UI |
| **Measure** | Extend governance smoke with hub orientation assertions |

---

## Recommended Phase 18 scope (MVP)

**In scope (18.0–18.2):**

- Hub orientation + toolbar disclosure
- `PipelineHubFileRow` / events rows systemization
- Mobile hub cards default + parent path
- Sharing UI presentational merge (no ACL changes)
- Nav copy / Operations vs Activity clarification

**Out of scope (defer 18.3+):**

- Pipeline table column redesign
- `PipelineFileWorkspace` block registry split
- Full contacts rewrite
- Global calendar route
- Backend graph/index changes
- Intake visual overhaul

---

## Regression surfaces (dangerous)

1. `PipelinePageClient.tsx`
2. `PipelineFileWorkspace.tsx`
3. `PipelineTableRow.tsx`
4. `RecordInspectorShell.tsx` / scroll contract
5. `graphProjection.ts` (if URL sync touches filters — read-only UI preferred)

---

## Validation per shipped slice

From `lender-app/`:

- `npm run qa:governance`
- `npm run deploy:prod`
- Manual: hub projection switches, file open, mobile scroll, sharing read-only flows

**Phase 18 must not start until operator approves this plan.**
