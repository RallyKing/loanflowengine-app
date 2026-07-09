# System Redundancy + Unification Report

**Objective:** Inventory **duplicated patterns** and name **canonical** primitives so DLC stops accruing **N variants** of the same concern.

---

## 1. UX patterns — duplicated

| Pattern | Variants observed | Canonical target |
|---------|-------------------|------------------|
| **Record edit chrome** | TaskDrawer, LenderDrawer, modals, inline | **`RecordInspectorShell`** |
| **“Saving…” / sync** | FieldSyncIndicator, toasts, inline text | **One** field feedback primitive |
| **Empty states** | Per-route illustrations + copy drift | **EmptyState** component + **content** table |
| **Filter bars** | Hub, lenders, contacts | **`FilterToolbar`** (chips + overflow) |
| **Row actions** | kebab vs icon buttons | **ActionMenu** pattern |
| **Search** | Global palette, in-table, directory | **Scoped search** contract |

---

## 2. Data concepts — duplicated / dual

| Concept | Issue | Resolution (UX + data) |
|---------|-------|------------------------|
| **Contacts** | Embedded vs `contactFileLinks` | **UI** privileges links narrative; **deprecate** confusing embedded flows in copy |
| **Lender** “chosen” vs scenario match | Multiple surfaces show overlap | **Single** chosen chip in chrome; scenario shows match **detail** |
| **Stage** | Chrome + blocks | **One** write surface; others read-only or deep-link |

---

## 3. Editing systems

| System | Unify |
|--------|-------|
| **Inline fields** in blocks | Keep for **light** edits |
| **Drawers** | Heavy edits → **inspector** |
| **Modals** | **Confirm** only |

---

## 4. Overlay systems

| Today | Target |
|-------|--------|
| **Radix Dialog** + custom | **Dialog** for confirm/legal |
| **Vaul** + **Drawer** | **Snap** (workspace) vs **side inspector** — **two** allowed, not five |

---

## 5. Drawer systems

| Component | Action |
|-----------|--------|
| `TaskDrawer` | Merge chrome with **LenderDrawer** |
| `LenderDrawer` | Same |
| Future drawers | **Implement** via shell only |

---

## 6. Validation systems

| Risk | Unify |
|------|-------|
| Zod in some places, ad hoc in others | **Shared schema** export for client messages |
| Different error copy for same rule | **Central** message map |

---

## 7. Table systems

| Surface | Drift risk |
|---------|------------|
| Hub vs lenders vs contacts | Column resize, density, sort affordances differ |

**Canonical:** **DataTable** primitive with **density** + **sticky header** + **mobile card** toggle.

---

## 8. Form systems

| Drift |
|-------|
| Label placement, required markers, hint text |

**Canonical:** `Field`, `FieldLabel`, `FieldError` from shared UI kit path.

---

## 9. Search systems

| Unify |
|-------|
| **Command palette** = navigation + actions |
| **Scoped search** in list routes = local state + URL params |

---

## 10. Motion systems

| Classes | Apply everywhere overlays animate |
|---------|-------------------------------------|
| `chrome` / `sheet` / `content-reveal` | Document in `ui-ux-rules` |

---

## 11. Loading systems

| Anti-drift |
|------------|
| **Route** skeleton spec per major route |
| **Button** loading = spinner + disabled |

---

## 12. Empty states

| Entity | One template |
|--------|--------------|
| pipeline / task / lender / contact | Title, body, primary CTA, secondary link |

---

## 13. Navigation patterns

| Duplication |
|-------------|
| **Back** in compact chrome vs browser back |
| **Deep links** from notifications vs in-app |

**Document** expected behavior matrix.

---

## 14. Task entry systems

| Paths |
|-------|
| Tasks app, file block, notifications, command palette |

**All** should open **same** inspector shell.

---

## 15. Contact systems

| Surfaces |
|----------|
| Contacts app, file embedded list, links-only flows |

**Merge** entry to **inspector** from file.

---

## 16. Messaging systems

| Channels |
|----------|
| In-app thread, email mention, portal |

**Unified** “Correspondence” mental model in IA (long-term).

---

## 17. What becomes canonical (summary)

1. **RecordInspectorShell**  
2. **DataTable** + **FilterToolbar**  
3. **EmptyState**  
4. **Motion tokens** + three classes  
5. **Semantic color roles**

---

## 18. What to deprecate

- **Ad hoc** modal record editors for **long** forms.  
- **Second** contact creation path that fights links model.  
- **Per-route** spinner-only loading for **primary** entity pages.

---

## 19. What to merge

- Task + lender drawer **chrome**  
- **Insights** + **activity** narrative (optional single “Status” tab)

---

## 20. Framework-level primitives (platform)

| Primitive | Rationale |
|-----------|-----------|
| **Inspector shell** | Every record workflow |
| **Overlay registry** | z-index + focus |
| **Scroll owner** helpers | Governance compliance |
| **Finance fields** | Trust in numbers |

---

*See: `component-scorecard.md`, `final-ranked-action-matrix.md`, `material-design-3-system-map.md`.*
