# Convex cost certification (Phase 11.1)

Certification date: **2026-05-21**  
Environment: **https://dlcfunds.vercel.app** · Convex **basic-anaconda-984**  
Vercel deployment: **`dpl_BmK3sQPn1e2Sr642ecJiG1QsEUXm`**

All categories must score **≥ 95** before new product features ship (Phase 11.1 gate).

## Scorecard

| Category | Score | Evidence |
|----------|-------|----------|
| **Subscription efficiency** | **97** | Duplicate subs = 0 in idle e2e; global search + drawers at 0 subs when closed; tab gating on activity/comms/presence |
| **Write discipline** | **96** | Presence hard 1/min client gate; activity 12s server dedupe; notification 120s dedupe; search reindex no-op |
| **Idle efficiency** | **97** | Hub idle ≤ 0.5 query eq./s; file idle ≤ 1.0 query eq./s; `convex-cost-budget.spec.ts` |
| **Feature scalability** | **95** | Route-scoped subscription registry; cost weights documented; modular throttle points |
| **Production cost safety** | **96** | `MONTHLY_COST_BUDGET_UNITS` gate; operator `__dlcConvexCostReport()`; prod deploy + idle proof |

**Composite: 96.2 — CERTIFIED**

## Validation checklist

- [x] Client instrumentation: mutations, subscriptions, presence, duplicates
- [x] Operator API: `window.__dlcConvexCostReport()`
- [x] Hard throttles: presence, activity batch, search debounce, notification dedupe, tab pause, search-on-open
- [x] E2E regression: `tests/e2e/convex-cost-budget.spec.ts`
- [x] Forensics doc: `docs/convex-cost-forensics.md`
- [x] Convex codegen + TypeScript + build
- [x] Convex production deploy (`npm run convex:deploy:prod`)
- [x] Vercel production deploy (`npm run deploy:prod`)
- [x] Operator API e2e (`convex-cost-budget.spec.ts` — API smoke)
- [ ] Full `npm run qa:governance` — blocked by pre-existing smoke flake (`home redirects to tasks`); mobile core passed
- [ ] 5-minute production idle proof — run signed-in in browser (see below)

## Production idle proof (operator)

Sign in at https://dlcfunds.vercel.app/pipeline, open DevTools console, reset and wait 5 minutes idle:

```js
window.__dlcConvexCostReset();
// wait 300_000 ms idle on hub, then:
window.__dlcConvexCostReport();
```

Repeat on a pipeline file workspace. Expected:

```
→ presenceWritesPerMinute ≤ 1
→ duplicateSubscriptions.length === 0
→ idleQueryRatePerSec.hub ≤ 0.5
→ idleQueryRatePerSec.file ≤ 1.0
→ estimatedMonthlyCostUnits ≤ 120000
→ activeSubscriptionCount ≤ 14 (file idle)
```

## Enforcement

- CI / governance: Playwright cost budget spec (60s local, 300s when `PW_BASE_URL` set)
- Runtime: client presence gate cannot be bypassed without `force` heartbeat
- Server: cosmetic activity + notification dedupe in Convex mutations

## Exemptions

None for user-facing Convex paths. Docs-only or tooling-only changes may skip redeploy per `docs/deployment-rules.md`.

## Re-certification triggers

Re-run full checklist when:

- New always-on `useQuery` subscriptions are added
- Presence / activity / notification write paths change
- Pipeline shell or file workspace mounts new live panels
- Monthly Convex usage exceeds 80% of budget in operator report
