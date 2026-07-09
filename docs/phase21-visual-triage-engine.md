# Phase 21 — Visual Triage Engine

Task highlights and hierarchy bubbling: time-released, color-coded attention signals that flow **reactively** from file tasks up to project and client hub cards.

## Architecture constraints

- **No duplicated highlight state** on `clients` or `projects` rows — only `tasks` store highlight fields; hub cards subscribe to Convex queries.
- **Exactly 8 org presets** — stable ids (`triage-urgent-red`, …); users pick from swatches, not custom hex.
- **Operational visuals** — 4px left border + glowing badge; no full-card background paint.

## Schema

### `organizationSettings`

| Field | Type | Notes |
|-------|------|--------|
| `organizationId` | `Id<"organizations">` | One row per org |
| `taskColorPresets` | 8 × `{ id, label, hexCode }` | Seeded on first read |
| `updatedAt` | number | |
| `updatedByUserKey` | optional string | Set on admin update |

### `tasks` (additive)

| Field | Type | Notes |
|-------|------|--------|
| `highlightColorId` | optional string | Must match org preset id |
| `isUrgent` | optional boolean | Active immediately while open |
| `scheduledTriggerTime` | optional number | Active when `<= now` while open |

## Active highlight logic

Open statuses: `todo`, `in_progress` (product has no `"open"` literal).

A highlight is **active** when:

```
status ∈ { todo, in_progress }
AND highlightColorId is set
AND (isUrgent OR scheduledTriggerTime <= Date.now())
```

Scheduled tasks with a future `scheduledTriggerTime` do **not** bubble until the trigger time passes.

## Backend modules

| Module | Responsibility |
|--------|----------------|
| `convex/organizationSettings.ts` | `getTaskColorPresets`, `updateTaskColorPresets` (requires `settings.manage`) |
| `convex/taskHighlights.ts` | `getHierarchyHighlights`, `getHubTriageHighlightMap`, `getFileTriageHighlight` |
| `lib/taskColorPresets.ts` | Default 8 presets + validation |
| `lib/taskHighlightEngine.ts` | Shared `isTaskHighlightActive` (client + server) |

### Priority (highest wins)

1. Urgent tasks beat scheduled-only tasks.
2. Among scheduled tasks, more overdue wins.
3. Preset list order breaks ties (Urgent Red first).

## UI

| Surface | Component | Behavior |
|---------|-----------|----------|
| File task composer | `TasksOnFileSection` | Urgent toggle, datetime follow-up, 8 swatches when either is set |
| Hub client/project rows | `HubTriageHighlightFrame` on `RowShell` | Left border + “Action required” badge |
| Hub loan rows | `LoanStackRow`, `PipelineHubFileRow` | Same frame; reactive via `getHubTriageHighlightMap` |

Completing a task sets `status: done` → highlight drops from hub instantly (Convex subscription).

## Certification checklist

- [x] 8-color preset limit enforced server-side on create/patch and admin update
- [x] Urgent file task bubbles to parent client card
- [x] Completing task removes client highlight reactively
- [x] Scheduled future tasks do not show until trigger time

## Validation

```bash
cd lender-app
npm run build
```

Manual: pipeline hub (client mode) → open file → add urgent task with color → confirm client card border/badge → mark done → confirm removal.
