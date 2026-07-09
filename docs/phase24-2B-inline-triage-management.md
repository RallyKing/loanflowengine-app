# Phase 24.2B — Inline triage label management

**Status:** Implemented (UX only — no bubbling / status engine changes).

## Goal

Brokers manage triage labels **inside the pipeline file workspace** without visiting Settings. Label create/edit/archive/reorder and per-task label assignment update hub highlights reactively (Convex subscriptions from Phase 24.2A).

## Entry points

| Surface | Actions |
|---------|---------|
| **Task composer** | Label pills with ··· edit, **New label**, **Manage labels** (desktop inline; mobile overflow menu) |
| **Tasks toolbar** | **Manage triage labels** above the feed |
| **Empty state** | **Create your first triage label** CTA |
| **Task row** | Click label pill → quick edit; **Add label** on unlabeled open tasks |

## Components

| File | Role |
|------|------|
| `TaskTriageLabelManagerSheet.tsx` | Full manager: list, create, edit, archive, reorder |
| `TaskTriageQuickEditPopover.tsx` | Desktop anchored panel / mobile bottom sheet |
| `TriageColorPresetPicker.tsx` | 8 preset colors only |
| `TriageSeverityEditor.tsx` | Slider + numeric severity |
| `TriageLabelPillEditor.tsx` | Composer selection pills |

## Backend (minimal)

- `organizationTriageLabels`: optional `sortOrder`, `archivedAt`
- `upsertTriageLabel` — permission: `settings.manage` **or** `files.edit`
- `archiveTriageLabel`, `reorderTriageLabels`
- `listTriageLabels` — active labels by default; `includeArchived` optional

**Not changed:** `getHubTriageHighlightMap`, bubbling algorithm, pipeline stages, operational status.

## Interaction notes

- **Archive** hides label from composer; tasks keep assignment until cleared.
- **Reorder** uses up/down controls (touch-safe, no drag library).
- **Quick edit** — swap label, clear, edit severity (label-level), open full manager.
- **No** hex/RGB pickers — preset ids only.

## Manual verification

1. Open pipeline file → Tasks block.
2. **New label** → create with color + severity → appears in composer immediately.
3. Add task with label → file/project/client highlights update without refresh.
4. Row pill → change label / severity → highlights update.
5. Complete task → highlights clear.
6. Repeat on mobile width: overflow menu + bottom sheets.

## Related

- Phase 24.2A: `docs/phase24-2A-triage-bubbling.md`
- Settings panel (`OrganizationTriageLabelsPanel`) remains for org admins; not removed.
