# Component-by-Component Scorecard

**Scale:** **1 = poor**, **10 = excellent**.  
**Cognitive load:** **10 = low load / clear** (higher is better).  
**Disposition:** KEEP / MODIFY / REPLACE / DELETE (for product architecture — not literal delete without migration).

**Legend:** Scores reflect **current shipped posture** and **known governance** (workspace sheet, blocks, Convex), not aspirational futures.

---

## Summary matrix (compressed)

| System | M | D | Ops | MD3 | A11y | Trust | Perf | Scale | Arch | Reuse | Maint | Cog↑ | Hier | Flow | Anim | **Disposition** |
|--------|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|-----------------|
| **AppChrome** | 8 | 9 | 8 | 6 | 7 | 8 | 7 | 8 | 8 | 6 | 7 | 8 | 8 | 9 | 7 | MODIFY |
| **MobileChromeController** | 7 | 6 | 7 | 6 | 6 | 7 | 8 | 7 | 7 | 5 | 6 | 7 | 7 | 8 | 7 | MODIFY |
| **Classic shell / branding** | 7 | 9 | 7 | 5 | 6 | 8 | 7 | 7 | 7 | 5 | 6 | 7 | 8 | 8 | 6 | MODIFY |
| **SaaS shell / branding** | 8 | 9 | 8 | 7 | 7 | 8 | 7 | 7 | 7 | 5 | 6 | 8 | 8 | 8 | 7 | MODIFY |
| **Bottom navigation** | 8 | 5 | 8 | 6 | 7 | 7 | 8 | 8 | 8 | 7 | 7 | 8 | 7 | 8 | 6 | KEEP |
| **Navigation rail (opportunity)** | 4 | 7 | 6 | 8* | 6 | 7 | 8 | 8 | 7 | — | — | 6 | 7 | 7 | 7 | MODIFY* |
| **Pipeline hub** | 5 | 8 | 7 | 6 | 6 | 7 | 5 | 4 | 7 | 6 | 6 | 6 | 7 | 7 | 6 | MODIFY |
| **Pipeline file workspace** | 9 | 9 | 9 | 7 | 7 | 9 | 6 | 6 | 5 | 8 | 5 | 6 | 8 | 9 | 8 | MODIFY |
| **Workspace snap (Vaul frame)** | 9 | 7 | 9 | 7 | 6 | 8 | 7 | 8 | 8 | 6 | 6 | 7 | 8 | 9 | 8 | KEEP |
| **`pipelineBlockRegistry` / blocks** | 7 | 9 | 9 | 6 | 6 | 8 | 7 | 8 | 9 | 9 | 7 | 6 | 7 | 8 | 6 | KEEP |
| **Task matrix (app)** | 6 | 9 | 9 | 6 | 5 | 7 | 6 | 5 | 7 | 6 | 6 | 5 | 7 | 8 | 6 | MODIFY |
| **TaskDrawer** | 7 | 8 | 8 | 6 | 6 | 8 | 7 | 8 | 6 | 5 | 6 | 7 | 7 | 8 | 7 | MODIFY |
| **LenderDrawer** | 7 | 8 | 8 | 6 | 6 | 8 | 7 | 8 | 6 | 5 | 6 | 7 | 7 | 8 | 7 | MODIFY |
| **Lenders directory** | 6 | 8 | 8 | 6 | 6 | 7 | 6 | 5 | 7 | 6 | 6 | 6 | 7 | 7 | 6 | MODIFY |
| **Contacts (multi-surface)** | 5 | 7 | 6 | 6 | 6 | 5 | 7 | 6 | 6 | 5 | 5 | 5 | 5 | 5 | 6 | REPLACE* |
| **Documents** | 6 | 8 | 7 | 6 | 6 | 7 | 6 | 6 | 7 | 6 | 6 | 6 | 7 | 7 | 6 | MODIFY |
| **Messaging** | 6 | 8 | 7 | 6 | 6 | 7 | 6 | 6 | 7 | 6 | 6 | 5 | 6 | 6 | 6 | MODIFY |
| **Portal (client)** | 6 | 8 | 7 | 6 | 6 | 6 | 7 | 7 | 7 | 5 | 6 | 6 | 7 | 7 | 6 | MODIFY |
| **GlobalSearchPalette** | 7 | 9 | 7 | 6 | 7 | 7 | 8 | 8 | 7 | 7 | 7 | 8 | 8 | 8 | 7 | MODIFY |
| **Modals / Dialogs** | 6 | 8 | 7 | 7 | 7 | 7 | 8 | 8 | 7 | 7 | 7 | 8 | 7 | 7 | 7 | KEEP |
| **Tables (hub/lenders/tasks)** | 5 | 8 | 8 | 6 | 5 | 7 | 5 | 4 | 6 | 5 | 5 | 5 | 7 | 7 | 6 | MODIFY |
| **Forms / fields** | 7 | 8 | 7 | 6 | 6 | 7 | 7 | 7 | 7 | 5 | 6 | 6 | 7 | 7 | 6 | MODIFY |
| **Theme / tokens** | 7 | 8 | 7 | 6 | 6 | 7 | 8 | 8 | 7 | 8 | 6 | 7 | 8 | 8 | 6 | MODIFY |
| **`fileSharedState`** | 8 | 9 | 10 | 5 | 8 | 10 | 8 | 9 | 9 | 8 | 7 | 9 | 9 | 10 | 5 | KEEP |
| **FieldSyncIndicator UX** | 7 | 8 | 8 | 6 | 7 | 8 | 8 | 8 | 8 | 7 | 7 | 7 | 8 | 8 | 6 | KEEP |
| **Convex subscription patterns (as used)** | 6 | 6 | 7 | 5 | 8 | 8 | 6 | 6 | 6 | 5 | 6 | 7 | 7 | 8 | 5 | MODIFY |

\*Navigation rail: **potential** MD3 score if adopted; today **partial**.  
\*Contacts **REPLACE**: replace **fragmented UX** with unified **ContactInspector** + links-first IA—not delete data.

---

## Detailed cards

### AppChrome
**Disposition: MODIFY** — Master shell is strong; needs **semantic token** pass and **navigation rail** strategy on large screens.  
**Future pattern:** MD3 **NavigationBar** + optional **NavigationRail** (breakpoint); unified **scrim** for overlays.

### MobileChromeController / focus compact mode
**Disposition: MODIFY** — **Behavior** must stay predictable for trust; document **escape hatches**.  
**Future pattern:** Compact height tokens + **reduced motion** matrix for chrome transitions.

### Pipeline hub
**Disposition: MODIFY** — **Mobile** scanning pain; **scale** risk.  
**Future pattern:** **Virtualized** table + **card** mode + **saved views**.

### Pipeline file workspace (orchestrator)
**Disposition: MODIFY** — **Architecture** score low due to monolith; **UX** scores high post sheet.  
**Future pattern:** **Region** components + **data shell** hook; preserved **delegated scroll**.

### Workspace snap (Vaul + delegated scroll)
**Disposition: KEEP** — Reference **mobile operational** implementation.  
**Future pattern:** Expand to **hub/scenario** with same **scroll handoff** discipline.

### TaskDrawer / LenderDrawer
**Disposition: MODIFY** → converge to **RecordInspectorShell**.  
**Future pattern:** Shared header/footer/actions; **context subtitle** when opened from file.

### Contacts (cross-surface)
**Disposition: REPLACE (UX)** — Unify narrative around **contactFileLinks**; single inspector.  
**Future pattern:** **ContactInspector** + **Activity** tab; deprecate confusing alternate entry.

### GlobalSearchPalette
**Disposition: MODIFY** — Add **actions** parity with Linear.  
**Future pattern:** Scoped modes + **keyboard** help overlay.

### Theme / tokens / elevation
**Disposition: MODIFY** — Split **brand** vs **semantic** roles.  
**Future pattern:** MD3 **color roles** map + **state layers**.

### Tables aggregate
**Disposition: MODIFY** — Virtualization + **density** toggle + **mobile** row cards.

### Portal (client-facing)
**Disposition: MODIFY** — Trust parity with **Mercury**/institutional calm.  
**Future pattern:** Branded loading, scoped copy, **audit** hints for operator visibility.

---

## Systems with highest maintenance drag

1. `PipelineFileWorkspace` size.  
2. Drawer pair without shared shell.  
3. Contacts dual paths.  
4. Doc drift upkeep.

---

## Systems to protect (do not regress)

- `fileSharedState`  
- Block registry modularity  
- Workspace delegated scroll  
- Governance tests

---

*See: `final-ranked-action-matrix.md`, `system-unification-report.md`.*
