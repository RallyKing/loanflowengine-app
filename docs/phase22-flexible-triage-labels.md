# Phase 22 — Flexible Label Triage & Input Liberalization

Phase 22 replaces the hardcoded **Mark urgent** toggle with **admin-defined triage labels** and allows **regular tasks** (title only) without label, color, or schedule.

## Schema

### `organizationTriageLabels`

| Field | Type |
|-------|------|
| `organizationId` | `Id<"organizations">` |
| `label` | `string` (display name, e.g. "Ready for Funding") |
| `colorId` | `string` (one of the org's 8 preset ids) |

Indexed by `by_organization`.

### `tasks` (Phase 22 fields)

| Field | Purpose |
|-------|---------|
| `triageLabelId` | Optional `Id<"organizationTriageLabels">` — immediate hub highlight while open |
| `highlightColorId` | Denormalized preset id (from label or schedule default) |
| `scheduledTriggerTime` | Optional — highlight when time fires |
| `isUrgent` | **Deprecated** — retained for legacy rows only |

## Highlight rules

A task contributes to **`getHubTriageHighlightMap`** only when:

1. It is **open** (`todo` / `in_progress`), and
2. It has **`triageLabelId`** (immediate) **or** **`scheduledTriggerTime` ≤ evaluation time**.

Tasks with **no label and no schedule** are regular tasks — ignored by the highlight engine.

## API

| Function | Role |
|----------|------|
| `organizationTriageLabels.listTriageLabels` | Composer + settings list |
| `organizationTriageLabels.upsertTriageLabel` | Admin create/update label |
| `tasks.create` / `patch` | Accepts optional `triageLabelId` + `scheduledTriggerTime` only |

## UI

### Settings → Organization (admin)

**Task triage labels** panel — create labels like "Client Waiting", pick a highlight color.

### Pipeline file drawer → Tasks

1. **Task body** — required text
2. **Label pills** — optional admin labels + "Regular task"
3. **Schedule date** toggle — datetime picker only when ON
4. **Add task** — works with text only (regular task)

## Verification

1. Settings → Organization → create label "Ready for Funding"
2. Open a pipeline file → Tasks → confirm label appears in composer
3. Create **regular task** (text only) — no errors
4. Create labeled task — hub card shows highlight with label name
5. `npm run build` passes

## Deploy

```bash
cd lender-app
npm run convex:codegen
npm run convex:deploy:prod
npm run build
npx vercel@latest deploy --prod --yes --project loanflowengine
```
