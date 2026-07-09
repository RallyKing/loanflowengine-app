# Responsive layout audit

**Audit date:** 2026-05-07 · **Diagnostic only.**

---

## 1. Breakpoint strategy

- **Tailwind defaults** (`sm`/`md`/`lg`…) — documented as standard in `docs/material-design-system.md`.
- **`useNarrowViewport()`** forces **pipeline** into **table** mode on narrow screens — a **major behavioral breakpoint**, not just CSS.

---

## 2. Pipeline hub

| Behavior | Finding |
|----------|---------|
| Table | `min-w-[1500px]` — **always horizontal scroll** on phones |
| Sticky thead | Inside inner vertical scroll — thead sticks **within** table panel |
| Toolbar / filters | Wrapped with `flex-wrap` patterns — generally OK; verify **long filter rows** on SE |
| Board | **Unavailable** on narrow — desktop/tablet only |

**Issue:** Mobile users **never** get board/kanban — may be intentional; document product-wise.

---

## 3. Pipeline file workspace

- Uses `WorkspaceContentContainer` for width alignment — **good** for consistency.
- Utilities **collapsible** — reduces vertical clutter.
- Parallel blocks / drawer layout — **tablet** may show two columns; **phone** must stack — verify **every** block.

---

## 4. Tasks (`/tasks`)

- Subtask panels use **`max-h-[min(70vh,520px)] overflow-y-auto`** — nested scroll on mobile.
- Quadrant layout — likely **dense** on small screens; verify **readability** and **drag** on touch (if supported).

---

## 5. Contacts / lenders / ledger

- **Contacts** page: bordered list container with `flex-1 overflow-y-auto` — full-height list pattern.
- **Lenders** directory — expect **wide** tables or split panes; **horizontal scroll** risk (grep shows lender-related components with overflow patterns elsewhere).
- **Ledger** — print + table; **print** routes may ignore mobile.

---

## 6. Settings

- Long form stacks — **spacing** and **section headers** must carry mobile rhythm; accordion density unknown without device pass.

---

## 7. Portal

- Separate routes under `app/portal/**` — **must not assume** signed-in shell patterns identical; audit **each** page for `min-h-0` chains.

---

## 8. Systemic responsive smells (static)

- **`min-w-*` on tables** without mobile-specific column hiding — **desktop-first**.
- **`-mx-*` + `overflow-x-auto`** patterns — correct mitigation but **cognitive** cost.
- **`sm:` layout jumps** — verify no **orphaned** horizontal padding when overflow wrappers engage.

---

## 9. Android tablet gap

- No first-class preset; use **custom viewport** and verify **split view** if supported by OS.

---

*Issues: RESP-\* in inventory.*
