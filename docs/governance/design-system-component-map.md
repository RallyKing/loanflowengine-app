# Design system — component map

**Reference for shared UI primitives.** Update when introducing a *reusable* new pattern.

---

## Primitives (examples — align naming with repo)

| Category | Examples / location | Notes |
|----------|---------------------|-------|
| Buttons | Shared button classes / variants | Use existing `className` patterns; no raw `<button>` without design parity |
| Forms | Inputs, selects, comboboxes | Error text + `aria-*` |
| Tables | Pipeline hub table, responsive strips | Horizontal scroll strips; don’t nest vertical page scroll |
| Drawers | `TaskDrawer`, `LenderDrawer` | `h-dvh max-h-dvh`, `touch-scroll-y`, overlay semantics |
| Cards / panels | Workspace sections | Stable `sectionId` / `data-testid` where tests exist |
| Sticky chrome | File chrome, `MobileChromeController` | Transform/opacity for motion; see scroll docs |
| Overlays | Modals, palette | Focus trap; escape; no body scroll unlock |

---

## Approval

New primitives MUST go through: **`design-system-policy.md`** + update this map.

---

## Related

- `ui-consistency-policy.md`
- `component-architecture-policy.md`
