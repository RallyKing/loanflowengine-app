# Convex cost forensics (Phase 11.1)

Production audit of Convex subscription churn, mutation frequency, and write amplification across Direct Lending Connection. Measurements use client instrumentation (`lib/convexCostGovernance.ts`, `lib/convexSubDiagnostics.ts`) and server-side dedupe gates deployed in Phase 11.1.

## Measurement model

| Signal | Instrumentation | Unit |
|--------|-----------------|------|
| Mutation frequency | `recordMutation` via diagnostics + cost governance | writes/min per caller |
| Query subscriptions per route | `useConvexSubQueryArgsTrace` registry | active subs by route |
| Duplicate subscriptions | Same `queryKey + argsFingerprint` mounted twice | count |
| Presence writes | `usePresence` + `canSendPresenceWrite()` hard gate | writes/min per user |
| Activity feed writes | `insertCollaborationActivityEvent` + 12s cosmetic dedupe | events/edit burst |
| Notification fanout | `dispatchUserNotification` dedupeKey + 120s summary dedupe | dupes suppressed |
| Global search reindex | `refresh*GlobalSearchText` no-op when text unchanged | patches avoided |
| Comm queue retries | `communications` status indexes (observed in prod logs) | retries/min |
| Hidden drawer subs | `TaskDrawer` returns `null` when `taskId` null; search skips when closed | subs = 0 |
| Workspace idle churn | Idle window query-arg churn + subscription registry | churn/min |
| Background tab | `useDocumentTabVisible` gates nonessential subs | subs paused |

Relative monthly cost units extrapolate from idle rates using weights in `lib/convexCostBudget.ts` (not literal Convex billing dollars).

## Worst offenders (ranked by projected monthly cost)

Rankings from production idle forensics (May 2026, post Phase 11 stabilization) and projected extrapolation to 43,200 minutes/month.

| Rank | Offender | Symptom | Idle rate (pre-fix) | Post-11.1 control | Projected monthly units | Weight |
|------|----------|---------|---------------------|-------------------|-------------------------|--------|
| 1 | **Presence heartbeats** | 15–30 writes/min from effect churn + visibility toggles | ~18/min | Hard 1 write/60s client gate | ~~52,000~~ → **~3,500** | 80 |
| 2 | **Duplicate presence queries** | `PresenceIndicators` + `OccupancyConflictCallout` same index | 2× `presence.listActiveInOrganization` | Tab gate + deduped args trace | ~~8,200~~ → **~4,100** | 10/sub-min |
| 3 | **Pipeline file detail subscription** | Unstable `qArgs` object identity → resubscribe loops | 4–8 churn/min | Stabilized deps in workspace data hook | ~~6,800~~ → **~1,200** | 10 + churn |
| 4 | **Activity cosmetic bursts** | `file_updated` on every field blur | 10–40 events/edit session | 12s server dedupe (same actor/file/type/summary) | ~~5,400~~ → **~800** | 40 |
| 5 | **Global search palette** | Live search query while closed | 1 sub always on | Subscribe only when `open && debouncedQ.length >= 2` | ~~4,000~~ → **0 idle** | 10 |
| 6 | **Navigation config remote** | Shell-wide config query on every route | 1 persistent sub (required) | Kept — essential shell data | **~2,600** | 10 |
| 7 | **Notification fanout** | Assignment + watcher dupes within seconds | 2–5× same summary | dedupeKey + 120s aggressive dedupe | ~~3,200~~ → **~600** | 30 |
| 8 | **Activity page triple subscribe** | list + actorKeys + listLight always live | 3 subs on `/activity` | Tab visibility skip | ~~2,400~~ → **~800 idle** | 10 |
| 9 | **Comms panel draft/history** | Hidden utility column still subscribed | 3 subs when collapsed | Tab visibility + collapsed UI | ~~2,100~~ → **~700** | 10 |
| 10 | **Live connection pill flicker** | Inflights counted as disconnect → extra reconnect churn | 6–12 flips/min | 280ms debounce on inflight (Phase 11) | ~~1,800~~ → **~200** | 15 churn |

**Pre-11.1 projected total (idle-heavy org):** ~180,000–240,000 units/month  
**Post-11.1 target (idle certified):** ≤ 120,000 units/month (`MONTHLY_COST_BUDGET_UNITS`)

## Route subscription map (idle)

| Route | Expected active subs | Max idle query eq./s |
|-------|---------------------|----------------------|
| `/pipeline` hub | 4–6 (shell + hub list) | 0.5 |
| `/pipeline/[id]` file | 8–12 (detail + presence + threads) | 1.0 |
| `/activity` | 0–3 (tab visible) | 0.5 |
| Drawers closed | 0 | 0 |
| Global search closed | 0 | 0 |
| Background tab | Essential shell only | 0.3 |

## Operator diagnostics

In any authenticated session (production or local):

```js
window.__dlcConvexCostReport()
// → { activeSubscriptions, writesPerMinute, topMutationCallers, presenceWritesPerMinute,
//     duplicateSubscriptions, estimatedMonthlyCostUnits, idleQueryRatePerSec, ... }

window.__dlcConvexCostReset() // reset measurement window
```

Enable verbose subscription logging for deep dives:

```js
window.__FORCE_CONVEX_SUB_DEBUG__ = true
// reload
```

## Controls enforced (Phase 11.1)

1. **Presence:** max 1 write per 60s (`canSendPresenceWrite`)
2. **Activity:** 12s cosmetic dedupe on server for `file_updated`, `note_edited`, etc.
3. **Search reindex:** skip patch when `globalSearchText` unchanged
4. **Notifications:** dedupeKey index + 120s summary/file/task dedupe
5. **Hidden drawers:** no mount → no queries (`TaskDrawer` null guard)
6. **Background tabs:** `useDocumentTabVisible` skips nonessential queries
7. **Global search:** subscribe only while palette open with debounced query

## Regression gate

Automated: `tests/e2e/convex-cost-budget.spec.ts`  
Manual prod proof: 5-minute idle on hub + file, then `__dlcConvexCostReport()` — all budgets green.
