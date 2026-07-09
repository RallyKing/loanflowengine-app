# UX Audit — Component Systemization (Phase 17.5)

**Mode:** READ-ONLY  
**Builds on:** Phase 17.0 consolidation audit + Phase 17.1–17.4 implementations

## Candidate systems map

| Candidate | Status | Location | Adoption | Drift risk |
|-----------|--------|----------|----------|------------|
| **RowShell** | **Shipped** | `components/ui/RowShell.tsx` | Hierarchy headers, shared row, tasks `TaskRow` | **High** — table, hub file row, events, contacts |
| **ActionSuite** | **Shipped** | `components/ui/ActionSuite.tsx` | Hierarchy actions, shared, tasks | **High** — `hubRowActionPrimitives`, table inline |
| **DisclosureHeader** | **Partial** | `HeaderDisclosure.tsx` | File, task, event headers | CollapsibleSection, details, ProgressiveDisclosureCard |
| **MetadataLine** | **Yes** | `ResourceOwnershipLine.tsx` | Pipeline rows, search | Inline text in sharing |
| **HierarchyRow** | **Partial** | `PipelineHubHierarchyView` | Hub only | No shared export |
| **OverlayShell** | **Shipped** | `components/ui/OverlayShell.tsx` | Some modals | 28+ overlay systems (17.0) |
| **PermissionBanner** | **Yes** | `ResourceAccessBanner.tsx` | Partial routes | Ad-hoc disabled tooltips |
| **WorkspaceHeader** | **Partial** | `PipelineFileWorkspaceShell` | File only | Hub, events duplicate sticky |
| **ProjectionSwitcher** | **Yes** | `PipelineHubProjectionView` | Hub | Not reusable export |
| **StickySectionHeader** | **No** | — | Per-page sticky | Medium drift |
| **MobileActionBar** | **Partial** | `PipelineMobileWorkspaceOpsRail` | File mobile | Hub lacks equivalent |

---

## Duplicate implementations (counted)

| Pair | Files |
|------|-------|
| RowShell vs ClientRowShell | `LinkedClientsEditor.tsx` |
| RowShell vs PipelineHubFileRow | Not wrapped |
| RowShell vs PipelineTableRow | 14-col legacy |
| ActionSuite vs hubRowActionPrimitives | Both exist |
| OverlayShell vs HubModalShell | Primitives file |
| Sharing panels ×3 | File, event, task |
| Role badges ×2+ | Ownership vs event collaborator |
| Inspector headers | RecordInspector vs HeaderDisclosure patterns |

**Duplicated component clusters:** **16** (JSON metric).

---

## Easiest consolidation wins (low risk)

1. **Events list rows** → `RowShell` + `ActionSuite` (small surface).
2. **PipelineHubFileRow** → `RowShell` slots (visual only).
3. **EventCollaboratorRoleBadge** → shared role map (already 17.1 plan).
4. **New modals** → `OverlayShell` only (gate).
5. **hubRowActionPrimitives** → re-export deprecate; single import path.

---

## Dangerous drift (do not rush)

1. `PipelineTableRow.tsx` — inline Convex commit wiring.
2. `PipelineFileWorkspace.tsx` — monolith; extract shells only.
3. `IntakeEditor.tsx` — separate visual island.
4. `app/contacts/page.tsx` — large legacy.

---

## Variant inconsistency

| Component | Variants | Issue |
|-----------|----------|-------|
| Button | default, outline, ghost | OK |
| Badge | default, secondary, stage custom | Stage colors one-off |
| RowShell | zones optional | Not all zones used consistently |
| ActionSuite | `sm` / reveal hover | Table not using reveal pattern |
| HeaderDisclosure | panel vs toggle | Only 3 consumers |

---

## Systemization maturity score

| Layer | Maturity |
|-------|----------|
| Primitives (ui/*) | **70%** |
| Pipeline hub | **35%** |
| File workspace | **55%** |
| Tasks/events/shared | **50%** |
| CRM (contacts/lenders) | **25%** |

---

## Phase 18 component roadmap (reference)

1. Formalize `RowShell` contract doc + eslint import preference.
2. Migrate `PipelineHubFileRow` + mobile card.
3. Extract `WorkspaceHeader` from file shell → hub orientation strip.
4. `CollaboratorSharePanel` presentational from sharing triad.
5. `StickySectionHeader` for ledger/lenders/events.
6. Table row last.
