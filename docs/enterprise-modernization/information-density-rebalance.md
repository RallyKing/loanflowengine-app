# Information Density — Rebalance Report

**Objective:** Identify **crowded**, **sparse**, **over-chromed**, and **under-utilized** viewports; prescribe **collapse**, **pin**, **summarize**, **lazy expand**, and **inspector offload**.

---

## 1. Crowded workflows (reduce in-flow surface)

| Workflow / viewport | What crowds | Rebalance |
|---------------------|-------------|-----------|
| **File — first paint** | App chrome + file chrome + utilities header + layout strip | **Pin** economics strip; **default collapse** more blocks via phase template |
| **File — utilities expanded** | Quick panels stack | **Tabs** (Messages | Portal | Email | …) |
| **Tasks — matrix** | 4 quadrants + row meta | **Compact density** mode; **filter** chips persistent |
| **Lenders — directory** | Columns + filters | **Saved views**; hide rare columns |
| **Contacts — detail** | Profile + activity + links | **Tabs** or inspector for activity |
| **Scenario match** | Criteria + results + explain | **Stepper** on mobile; **summary chip** on desktop |
| **Settings** | Long vertical sections | **Left nav / anchor** (already partial) + search |

---

## 2. Sparse workflows (add operational value)

| Workflow | Current | Opportunity |
|----------|---------|-------------|
| **Tablet landscape file** | Single column | **Parallel blocks** + optional **inspector rail** |
| **Desktop ultra-wide** | `max-w` container | **Optional** wider grid for blocks (tenant setting) |
| **Hub** (empty org) | Empty pipeline | **Onboarding** CTA density — guided first file |

---

## 3. Overloaded viewports

| Viewport | Load | Fix |
|----------|------|-----|
| **Mobile file — expanded utilities** | Full stack | **Snap to compact** after action complete (optional smart behavior) |
| **Modular blocks all expanded** | Long scroll | **Collapse others** when one expands (optional user pref) |

---

## 4. Underutilized desktop layout

| Area | Issue | Fix |
|------|-------|-----|
| **Right 30%** on 1920px | Empty when no drawer | **Optional pinned “Next steps”** or **insights** |
| **Hub** without side peek | No record continuity | **Split preview** experiment |

---

## 5. Poor mobile hierarchy

| Issue | Fix |
|-------|-----|
| **Stage + file name** compete | Typography scale: name = title large, stage = chip |
| **Utilities** before blocks | Correct progressive disclosure — ensure **“Jump to deal”** affordance |

---

## 6. Unnecessary chrome layers

| Layer | Verdict |
|-------|---------|
| **Duplicate** back affordances (app compact + file) | **Tolerable** if visual hierarchy clear — audit redundancy |
| **Insight + activity** both “status” | Merge narrative or **tab** |

---

## 7. Redundant control groups

| Duplication | Unify |
|-------------|-------|
| **Stage** in chrome + in block | One **source**; block **read-only** summary or deep link |
| **Lender attach** in scenario + lenders block | Same **picker** primitive |

---

## 8. What should **collapse** (default off)

- Workspace utilities (already).  
- **Advanced** scenario fields.  
- **Archive/danger** until intentional expand.

---

## 9. What should **persist** (always visible on file)

- **File identity** + **stage** + **chosen lender** (or explicit “none”).  
- **Primary economics** one-liner (amount / rate / term) — trust.  
- **Next task** or **empty state** (“No open tasks — add”).

---

## 10. What should **pin**

- **Summary rail** (desktop) — optional user toggle.  
- **Action bar** for file: attach lender, message, task — **not** duplicated 3× in blocks.

---

## 11. What should **summarize**

- **Activity** → last 5 + “Full log”.  
- **Lender list** → chosen + count + “Show all”.  
- **Documents** → recent + “Library”.

---

## 12. What should **lazy expand**

- Heavy blocks (`contacts`, `documents`, `scenario`) — **IntersectionObserver** mount (where not already).

---

## 13. What moves into **inspectors**

- **Full lender record** edits.  
- **Task** long description + subtasks.  
- **Contact** full CRM fields.  
- **Document** ACL / sharing (if complex).

---

## 14. Progressive disclosure replacements

| Instead of | Use |
|------------|-----|
| Full fee grid inline | **Summary** + inspector |
| Full webhook payload | **Summary** + “Technical” accordion |

---

*See: `material-design-3-system-map.md`, `side-sheet-master-plan.md`, `master-enterprise-modernization-report.md`.*
