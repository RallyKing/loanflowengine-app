# Phase 21.5 — Triage Engine: Autonomous Time-Release Activation

Phase 21 reactive bubbling used server `Date.now()` inside Convex queries. That only re-evaluates when **another** mutation or argument change triggers a query re-run — scheduled highlights would not appear at trigger time while the user idles on the hub.

Phase 21.5 adds a **passive frontend clock synchronizer** that advances a minute-rounded timestamp into highlight queries, forcing Convex to recompute activation without polling the database or background workers.

## Problem

```
User on hub → scheduled task trigger passes → query args unchanged → no re-run → no glow
```

## Solution

```
TriageClockProvider (pipeline layout)
  → currentTriageTime updates every minute (nearest 60s bucket)
  → useQuery(getHubTriageHighlightMap, { ..., currentTriageTime })
  → Convex re-runs query → scheduledTriggerTime <= currentTriageTime → card highlights
```

## Components

| Path | Role |
|------|------|
| `lib/triageClock.ts` | `roundTriageTimeToNearestMinute`, `resolveTriageEvaluationTime` (±2 min skew guard) |
| `components/providers/TriageClockProvider.tsx` | Minute-aligned `setTimeout` + `setInterval`; `useTriageClockTime()` |
| `app/pipeline/PipelineTriageClockShell.tsx` | Client shell wired in `app/pipeline/layout.tsx` |
| `convex/taskHighlights.ts` | All highlight queries accept required `currentTriageTime: number` |

## Server evaluation

`buildHubTriageHighlightMap` uses:

```typescript
const now = resolveTriageEvaluationTime(currentTriageTime);
// isTaskHighlightActive(task, now) — scheduledTriggerTime <= now
```

If client clock skew exceeds **2 minutes**, server falls back to `Date.now()` to avoid hydration mismatch abuse.

## What did NOT change

- 8-color preset limit and schema
- Hub card visuals (`HubTriageHighlightFrame`)
- Task composer UI
- No client-side database polling
- No Convex cron / heavy background workers

## Certification

1. Pipeline hub → client view
2. Add task with scheduled follow-up **~1 minute ahead** (pick next minute boundary)
3. Return to hub — **do not click or refresh**
4. When the minute rolls over, client card shows 4px left border + “Action required” badge automatically

## Validation

```bash
cd lender-app
npm run build
```
