# UX Audit — Interaction Consistency (Phase 17.5)

**Mode:** READ-ONLY  
**Post–Phase 17:** `RowShell`, `ActionSuite`, `HeaderDisclosure`, `OverlayShell`, `touchTargetIconClass`

## Interaction subsystems inventoried

| Subsystem | Implementations | Consistent? |
|-----------|-----------------|-------------|
| Row actions | `ActionSuite`, `hubRowActionPrimitives`, inline table icons, events text buttons | **Partial** |
| Hover reveal | `actionSuiteRevealOnRowHover`, table always-on, events always-on | **No** |
| Disclosure | `HeaderDisclosure`, `CollapsibleSection`, `ProgressiveDisclosureCard`, `<details>` | **No** |
| Sticky headers | File shell, event detail, ledger, lenders, hub stage strip | **Partial** (z-index mostly normalized 17.1) |
| Expand/collapse | Hierarchy tree, hub expansion localStorage, drawer sections | **Partial** |
| Permission | `ResourceAccessBanner`, view-only tooltips, inline disabled | **Partial** |
| Delete | `HierarchyCascadeDeleteConfirm`, `ConfirmActionSheet`, `window.confirm` legacy | **No** |
| Sharing | 3 panel dialects | **No** |
| Search | Global palette vs hub search vs projection search | **No** |
| Drawers | `RecordInspectorShell`, Vaul mobile frame, event share fixed panel | **Partial** |
| Overlays | `OverlayShell`, `HubModalShell`, raw `fixed inset-0` | **Partial** |
| Inline edit | `InlineText`, table cells, intake fields | **No** |
| Keyboard | ⌘K search, inspector Esc | **Partial** |
| Mobile gestures | Vaul snap, bottom nav, inspector sheet | **Improved 17.4** |

**Inconsistent interaction systems (counted):** **19** distinct patterns (see JSON report).

---

## Muscle memory breakers

| Pattern A | Pattern B | Where users stumble |
|-----------|-----------|---------------------|
| Icon `h-8` desktop | `touchTargetIconClass` 44px mobile | Table rows not fully migrated |
| Hover to show actions | Always visible actions | Hub hierarchy vs table |
| Overflow `⋯` menu | Inline icon cluster | File header vs hub row |
| Confirm sheet (bottom) | Center modal | Mobile delete flows |
| Open in drawer | Navigate to page | Task vs event vs file |
| Snooze menu portal | Inline date on file | Tasks vs pipeline |
| Native `<select>` sort | Button groups elsewhere | Hub toolbar |
| Checkbox bulk left | No bulk on board | Table only |

---

## Duplicated implementations (interaction layer)

1. `hubRowActionPrimitives.tsx` still exists alongside `ActionSuite.tsx` — export bridge, drift risk.
2. `HubModalShell` vs `OverlayShell` vs `AttachmentPreviewDialog`.
3. Three sharing flows (invite + role + revoke).
4. `EventCollaboratorRoleBadge` vs `ResourceOwnershipBadge`.
5. `ClientRowShell` vs `RowShell`.
6. `PipelineTableRow` inline commit vs hub card navigation.

---

## Confirmations audit

| Pattern | Files (sample) |
|---------|----------------|
| `ConfirmActionSheet` | `m3/ConfirmActionSheet.tsx`, lender drawer |
| `HierarchyCascadeDeleteConfirm` | Dedicated multi-step |
| Hub modals | `NewPipelineFileDialog`, hierarchy create |
| Inline confirm text | Ledger, contacts, settings |

**Risk:** Destructive hierarchy delete feels different from task delete — users cannot build one mental model.

---

## Sticky + scroll interactions (post-17.4)

- `[data-nested-scroll]` on inspector, activity, lender search — **documented exception**.
- File route: delegated scroll — **do not break** when standardizing sticky section headers.

---

## Phase 18 interaction standardization (order)

1. Delete/destructive → single confirm pattern (sheet on mobile, modal desktop).
2. Complete `ActionSuite` adoption on `PipelineHubFileRow`, `PipelineTableRow` trailing zone (read-only hover rules).
3. All new disclosure → `HeaderDisclosure` or `ProgressiveDisclosureCard`.
4. Sharing → one interactable list component.
5. Remaining `fixed inset-0` → `OverlayShell` gate.
