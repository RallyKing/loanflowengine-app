# UI consistency policy

**Binding.** All product UI MUST feel like one platform (`platform-philosophy.md`, `docs/ui-ux-rules.md`).

---

## MUST

- **Shared layout** — `AppChrome` / SaaS shell; **one vertical scroll owner for route content** — default `<main>`; pipeline **file** route: **`[data-pipeline-workspace-scroll]`** (`runtime-workspace-scroll-authority.md`).
- **Shared spacing & grid** — Tailwind tokens; no one-off magic numbers except documented exceptions.
- **Material-aligned patterns** — motion, elevation, ripples/focus where applicable (`design-system-policy.md`, `.cursor/rules/material-design-rules.mdc`).
- **Overlays** — drawers/modals use shared primitives (**`RecordInspectorShell`**); do not steal route/workspace scroll ownership.
- **Tables & forms** — reuse shared table/form components where they exist; extend before forking.

---

## MUST NOT

- Introduce **parallel design dialects** (second button system, unrelated radius scale).
- Ship **overlapping chrome** that fights `AppChrome` or pipeline shell.

---

## Approval path

**New visual patterns** require: design-system rationale, mobile check, and update to `design-system-component-map.md` when introducing a primitive.

---

## Related

- `component-architecture-policy.md`
- `accessibility-policy.md`
