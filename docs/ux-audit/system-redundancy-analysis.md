# System Redundancy Analysis — Direct Lending Connection

**Goal:** Find **duplicated concepts, UI, and workflows** that inflate cognitive load and maintenance cost.

---

## 1. Data model redundancies

| Duplication | Locations | UX impact | Direction |
|-------------|-----------|-----------|-----------|
| **Contacts** embedded on `pipeline` vs `contacts` + `contactFileLinks` | Both active | Users unsure which is “real” | **UX:** default to **links** in new flows; **migrate** embedded as read-only legacy |
| **Lender representation** | File array + lender directory row | Expected | Keep **directory** as source of truth |
| **Notes / activity** | Multiple surfaces | **Risk** of “where did that note go?” | Unified **timeline** narrative in activity + deep links |

---

## 2. UI pattern redundancies

| Duplication | Examples | Unification |
|-------------|----------|-------------|
| **Record inspect** | `LenderDrawer`, future contact panels | **RecordSideSheetShell** (conceptual) |
| **Task entry** | Matrix, file block, drawer | **One** task composer spec; others **open** it |
| **Search** | Global palette vs page filters | **Scope** search affordance by route |
| **Snooze** | File + task | Shared **SnoozeMenu** metaphor — already noted in code comments |

---

## 3. Navigation redundancies

| Issue | Mitigation |
|-------|------------|
| **Multiple paths to lenders** (hub, file block, scenario) | Acceptable if **same** lender drawer opens |
| **Settings vs header toggles** | Document **single** home for appearance (Settings copy already references header) |

---

## 4. Configuration redundancies

| Item | Risk |
|------|------|
| **Block defaults** in registry + global config + user prefs | Must have **clear precedence** doc for support |
| **Stage styles** | Org vs user vs global — document merge |

---

## 5. Documentation redundancies

| Item | Note |
|------|------|
| `project-intelligence-summary.md` § pipeline scroll | **Out of date** vs `workspace-sheet-*` — **sync** to avoid team drift |

---

## 6. What can be deleted (future, not now)

- **Legacy** embedded-only contact flows — only after data migration story.  
- **One-off** modal implementations that duplicate drawer behavior.

---

## Prioritization

| Rank | Unification |
|------|-------------|
| 1 | Contact UX + data story |
| 2 | Side sheet shell for record types |
| 3 | Task entry surfaces |
| 4 | Docs sync (scroll / workspace) |

---

*See: `full-fintech-ux-audit.md`, `side-sheet-conversion-opportunities.md`.*
