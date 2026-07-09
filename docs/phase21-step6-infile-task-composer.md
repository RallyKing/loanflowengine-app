# Phase 21.6 — In-File Task Triage Composer & Feed

UI/UX overhaul of the pipeline file drawer task block. No schema or backend changes — wires the Visual Triage Engine into the in-file experience.

## Components

| Component | Role |
|-----------|------|
| `FileTasksTriageBlock` | Orchestrates feed + composer (`TasksOnFileSection` alias) |
| `FileTaskTriageComposer` | Title input, urgent/schedule toggles, datetime picker, 8 preset swatches |
| `FileTaskTriageFeedRow` | Colored left border + 10% tint, metadata labels, completion fade |
| `lib/inFileTaskTriageUi.ts` | Visual state helpers, tint formatting, payload type |

## Composer flow

1. User types task description in the main input.
2. **Mark urgent** (`Flame`) or **Schedule** (`CalendarClock`) toggles in the action bar.
3. Schedule toggle reveals native `datetime-local` for `scheduledTriggerTime`.
4. When either toggle is on, a horizontal row of **8 circular swatches** appears (from `getTaskColorPresets`). Selection is required before save.
5. Submit calls existing `tasks.create` with `isUrgent`, `scheduledTriggerTime`, `highlightColorId`.

No custom hex/RGB picker — presets only.

## Feed row design

| State | Visual |
|-------|--------|
| Active triage (urgent or scheduled trigger fired) | 4px left border + ~10% background tint |
| Scheduled pending | 3px dashed left border + lighter tint |
| Done | Strike-through title, opacity fade, highlight removed |
| Metadata | **Urgent** or **Scheduled for: …** below title |

Evaluation time uses `useTriageClockTime()` so scheduled rows activate in-drawer on minute rollover (same as hub).

## Mutation wiring

`PipelineFileWorkspace` unchanged — still passes triage fields into `createTask` via `onAdd` payload. Complete checkbox still uses `runPatchTask` / status toggle (not broken).

## Certification

- [x] 8 swatches from org presets in composer
- [x] Urgent task renders with assigned color in feed immediately
- [x] Completing task dims/removes highlight
- [x] Legacy checkbox/datetime composer replaced

## Validation

```bash
cd lender-app
npm run build
```
