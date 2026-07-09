# Side Sheet Conversion Opportunities — Direct Lending Connection

**Definition:** **Side sheet** = contextual panel (often modal over backdrop on mobile, fixed right rail on desktop) for **record-scoped** work without navigating away. Aligns with MD3 side sheet + Salesforce Lightning inspector patterns.

**Existing primitives:** `LenderDrawer.tsx`, `TaskDrawer.tsx` — **behaviorally** close; opportunity is **unification** (shared shell, motion, header/actions, a11y).

---

## 1. Conversion candidates (high frequency)

| Current pattern | User pain | Side sheet benefit | Notes |
|-----------------|-----------|-------------------|-------|
| **Lender** profile from table / scenario | Context loss | Keep pipeline or file visible (desktop); full letter-reading on mobile | Extend `LenderDrawer` consistency |
| **Task** create/edit from file or matrix | Modal overload | Same task chrome everywhere | `TaskDrawer` as **canonical** task surface |
| **Contact** detail from file | Duplicate “contact mini UI” in blocks | Single contact inspector | **New or extend** drawer |
| **File share / team** | If modal-heavy | Persistent actions footer | Reduces “did it save?” anxiety |
| **Document** metadata / link | Scattered | One document inspector | **Medium** priority |

---

## 2. Conversion candidates (medium frequency)

| Area | Recommendation |
|------|----------------|
| **Notes** — long compose | Optional side sheet for “focus write” while keeping file visible on ultrawide |
| **Scheduling** detail | Side sheet with calendar + participants |
| **Portal** invite management | Side sheet from quick panel |
| **Generate terms / export** review | Side sheet preview + copy actions |

---

## 3. Desktop vs mobile behavior

| Viewport | Suggested behavior |
|----------|---------------------|
| **≥ md** | Right **docked** drawer (fixed width), **push** or **overlay** — product choice; **overlay** matches current architecture |
| **< md** | Full-height **modal side sheet** (MD3), **swipe** down dismiss — align with Vaul or shared drawer primitive |

---

## 4. Anti-patterns to avoid

- **Side sheet inside side sheet** without breadcrumb — max **one** level; deeper goes to **full page** or **stacked** navigation with back.  
- **Side sheet** for **binary confirm** — use dialog.  
- **Losing file context** — title bar must show **file name** + **stage** when opened from file.

---

## 5. Architectural enabler

Introduce **`RecordSideSheetShell`** (conceptual name):

- Slots: `title`, `subtitle`, `actions`, `body`, `footer`.  
- Props: `entityType`, `entityId`, `origin` (`file` | `hub` | `global`).  
- Motion: tokenized enter/exit.  
- Maps **LenderDrawer** / **TaskDrawer** / future **ContactDrawer** to one pattern.

---

## Prioritization

| Rank | Item |
|------|------|
| 1 | Shared shell + migrate TaskDrawer/LenderDrawer |
| 2 | Contact inspector from file |
| 3 | Document inspector |
| 4 | Share/session panel |

---

*See: `workspace-architecture-review.md`, `system-redundancy-analysis.md`.*
