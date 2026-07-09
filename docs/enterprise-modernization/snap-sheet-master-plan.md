# Snap Sheet — Master Plan (Direct Lending Connection)

**Definition:** **Snap sheet** = sheet with **discrete vertical snap points** and **persistent partial context** (peek, half, full). **Primary implementation today:** Vaul `direction="top"` + `snapPoints` on **pipeline file workspace** (`PipelineWorkspaceMobileVaulFrame.tsx`), embedding in `AppChrome` `<main>` with `modal={false}`, `dismissible={false}`.

---

## 1. Canonical mobile sheet architecture

| Layer | Responsibility |
|-------|----------------|
| **Embed host** | `div` with `ref` passed to Vaul `container` — snap fractions relative to **host**, not full window |
| **Sheet chrome** | Optional `Drawer.Handle`; safe-area padding |
| **Identity strip** | Lowest snap must show **file name** or **tool title** |
| **Content** | `[data-pipeline-workspace-scroll]` **owns** vertical scroll — **never** duplicate |
| **Drag vs scroll** | `data-vaul-no-drag` on scrollport; **`handleOnly`** when motion OK |

---

## 2. Mobile workflows → snap sheet

| Workflow | Snap points (suggested) | Persistent context | Notes |
|----------|-------------------------|--------------------|-------|
| **File workspace** (today) | ~22% / ~58% / 100% | Pipeline + app chrome | Canonical reference |
| **Hub filters + saved views** | peek / half / full | Hub list visible above | Use **bottom** sheet variant or top sheet — pick **one** per design spec |
| **Scenario criteria (dense)** | collapsed / form / full | File chrome badge | Prefer **top** or **bottom** based on thumb; test |
| **Lender browse + attach** | list peek / full | File summary strip | Reduces “lost in modal” |
| **Messaging thread** | composer short / thread+composer | File identity | Chat metaphor |
| **Quick task add** | title-only / full | **Or** defer to side sheet — **one** pattern only | **Avoid duplication** with TaskDrawer |
| **Export / share preview** | preview / full | — | Short-lived sheet |

---

## 3. Peek vs persistent context

| Concept | Definition |
|---------|------------|
| **Peek** | Shows **status** + **one** CTA — no nested scroll |
| **Persistent context** | User always knows **which file** tools apply to — subtitle or pinned chip |

---

## 4. Workflows violating ergonomics today (candidates)

| Workflow | Violation | Snap remedy |
|----------|-----------|-------------|
| **Full-screen modal** for filters on phone | Loses list context | Bottom snap with list behind |
| **Long scenario form** on phone | Keyboard overlap | Snap to max + `repositionInputs` |
| **Messaging** in short utility panel | Cramped history | Dedicated snap conversation |

---

## 5. Safe area handling

- Apply `env(safe-area-inset-*)` on sheet chrome and **composer** strips.  
- **Footer** actions clear home indicator — padding token shared with workspace scroller.

---

## 6. Keyboard handling

- Vaul **`repositionInputs`** — validate against **iOS Safari** + Android Gboard.  
- **Focus** first field **after** snap settles to largest point (avoid IME + mid-snap jank).

---

## 7. Scroll handoff rules

1. **One** vertical scroll owner per overlay branch.  
2. Scrollports inside snap sheet **must** carry `data-vaul-no-drag` if `handleOnly={false}`.  
3. **Hub `<main>`** remains owner when sheet is **over** hub — sheet body scroll **isolates** from hub (sheet-internal only).

---

## 8. Motion rules

- **Snap animation:** token-aligned; **no** layout animation on `height` of main route.  
- **Cross-fade** utilities when snap changes — optional, **opacity/transform** only.

---

## 9. Reduced-motion behavior

- **`handleOnly={false}`** may be required when reduced motion — document QA matrix.  
- Prefer **instant** snap set + **no** handle animation glitter.

---

## 10. Vaul standardization strategy

| Topic | Rule |
|-------|------|
| **Version** | Pin major; track security advisories |
| **CSS** | Use **`app/vaul-drawer.css`** (cssnano-safe) not broken upstream import |
| **Direction** | `top` for file workspace; **`bottom`** for hub tools — document |
| **Snap point count** | **≤ 3** for operational tools |

---

## 11. Anti-patterns to ban

1. Snap sheet as **only** navigation pattern (breaks desktop integrated workspace).  
2. **Nested** snap sheets.  
3. Snap **without** identity at minimum height.  
4. Full **route** content inside snap **without** delegated scroll contract.

---

## 12. Relationship to scroll governance

- **Approved:** Vaul file sheet + delegated workspace scroll (`docs/governance/workspace-sheet-governance.md`).  
- **Banned:** Competing `overflow-y-auto` bands that fight workspace scroll owner.

---

*See: `mobile-operations-audit-v2.md`, `side-sheet-master-plan.md`, `master-enterprise-modernization-report.md`.*
