# Snap Sheet Conversion Opportunities — Direct Lending Connection

**Definition:** **Snap sheet** = persistent or semi-persistent surface with **discrete vertical snap points** (Material sheet + iOS mental model). **Current:** `PipelineWorkspaceMobileVaulFrame.tsx` implements Vaul **`direction="top"`** snap for the **entire file workspace** on `< md`.

---

## 1. Already converted

| Surface | Implementation |
|---------|----------------|
| **Pipeline file workspace (mobile)** | Vaul snap: ~22% / 58% / 100% of embed height; `WorkspaceSheetSnapContext` |

---

## 2. Strong candidates for *additional* snap surfaces

| Surface | Why snap fits | Caveat |
|---------|---------------|--------|
| **Hub filters & saved views** | Frequent thumb interaction; keeps list visible above sheet | Don’t steal `<main>` scroll — use **modal bottom sheet** pattern with handle |
| **Scenario criteria editor (mobile)** | Dense fields; users want to peek pipeline context | Ensure **keyboard** safe (`repositionInputs` or custom) |
| **Lender attach / browse (mobile)** | Long lists inside modal feel trapping | Snap **medium** + **full** states |
| **Messaging thread (mobile)** | Input bar + history — classic chat sheet | Align with **safe area** + keyboard |
| **Task quick-add** | Medium snap for “title + due” then expand | Don’t conflict with **TaskDrawer** — pick **one** primary task entry pattern |

---

## 3. Weak candidates (prefer side sheet or inline)

- **Destructive confirm** — use **dialog**, not snap.  
- **Short single-field edit** — **inline** (already strong in file chrome).  
- **Global search** — **palette** remains appropriate.

---

## 4. Interaction rules (fintech)

1. **Snap points ≤ 3** for operational tools (users must predict rhythm).  
2. **Lowest snap** still shows **identity**: file name or tool title — never “mystery strip.”  
3. **Reduced motion:** snap **or** instant state change — never conflicting (`docs/workspace-sheet-mobile-rules.md`).  
4. **Scroll handoff:** inner lists use **`data-vaul-no-drag`** pattern (same as workspace scroller).

---

## 5. Desktop note

**Snap sheets** are **mobile-first**. On desktop, prefer **docked side sheets** or **inline** expansions — **do not** force floating bottom sheets over dense tables (violates “integrated workspace” policy).

---

## Prioritization

| Priority | Opportunity |
|----------|-------------|
| High | Mobile **scenario** / **lender browse** snap |
| Medium | Hub **filters** snap |
| Medium | **Messaging** composer sheet |
| Low | Task **quick-add** snap (if not redundant with drawer) |

---

*See: `mobile-operational-workflow-audit.md`, `workspace-architecture-review.md`.*
