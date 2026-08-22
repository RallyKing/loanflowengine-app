# Resource & cost consumption policy

**Status:** Binding platform policy. Applies to **every** change that touches Convex functions, crons, schedulers, `useQuery`/`useMutation` call sites, or effects that write.

**Architectural correctness** (push vs pull, React deps, mutation retry-safety, who owns which state) is a **separate layer**: **`convex-reactivity-policy.md`**. This file stays the cost/loop policy. Cross-reference; do not copy those clauses here.

**Verification:** `npm run verify:resource-safety` (from `lender-app/`; also runs inside `npm run build`; invokes `verify:convex-reactivity` after a green cost gate) + `npm run verify:governance:docs`.

**Why this exists:** production Convex usage exceeded the account spend cap on **2026-08-17**. The failures were not load — they were **loops**. Every rule below is traceable to a specific function that burned real money.

---

## 1. The incident (cite this when reviewing)

Convex Insights, one billing window:

| Function | Calls | Root cause |
|----------|-------|------------|
| `pipelineAutoArchiveSweep.sweepDueAutoArchives` | **~1,300,000** | 30-minute cron **plus** `ctx.scheduler.runAfter(0, self)` that re-scheduled itself **even when no work remained** — an idle pump with no stop condition |
| `analytics.dashboard` | **~637,000** | Live `useQuery` whose args embedded `Date.now()` → new args every render → re-subscribe → re-render → repeat. The query **also** called `Date.now()` internally (defeats Convex caching) and `.collect()`'d the whole `pipeline` table for global admin |
| `pipelineContacts.saveBorrowerIdentityDualWrite` | **~36,000** | Cleanup effect re-flushed whenever the server doc's `updatedAt` changed — the write changed the dep that triggered the write (write amplification) |
| `communications.sweepDueOutboundMessages` | **~33,000** | 1-minute cron; almost every tick found nothing |
| `integrationJobs.sweepDueJobs` | **~33,000** | 1-minute cron; almost every tick found nothing |
| `webhookOutbound.sweepOutboundWebhookDeliveries` | **~33,000** | 1-minute cron; almost every tick found nothing |

**Remediations shipped** (do not regress them):

| Area | Current canonical behavior |
|------|----------------------------|
| Auto-archive | **Manual only** — `pipelineAutoArchiveSweep.runDueAutoArchives` from the Pipeline hub button. `sweepDueAutoArchives` is an `internalMutation` **no-op sink** for stragglers from the old chain. No cron. |
| Analytics | One-shot **Load / Refresh** via `convex.query(...)` on `/analytics` only — never a subscription. `now` is an **argument**. |
| Backup sweeps | `DURABLE_JOB_BACKUP_SWEEP_MINUTES = 15` in `lender-app/lib/convexCronIntervals.ts` |
| Dual-write | Debounced queue + **unmount-only** flush (`useEffect(() => () => {…}, [])` with refs) in `lib/contacts/borrowerTabWriteAdapter.ts` |

Product Updates: `2026-08-17-convex-usage-archive-analytics`, `2026-08-17-convex-no-runaway-loops`.

---

## 2. Non-negotiable principle

> **Convex costs are driven by function-call count and DB bandwidth, not by user count.**
> A single bad dependency array or a single idle cron can generate more calls in a day than the entire user base does in a year.

Every rule below is **mandatory**. Exceptions require an entry in [§8 Approved exceptions](#8-approved-exceptions) **and** a `// resource-safety-allow: <reason>` annotation at the call site.

---

## A. Frontend data fetching

### A.1 Canonical data paths (MUST)

| Need | Canonical mechanism |
|------|---------------------|
| Read live server state | Convex **native reactive `useQuery`** from `convex/react` (already enforced by `scripts/verify-convex-query-architecture.mjs`) |
| Write | `useMutation` |
| Expensive / on-demand aggregate | `useConvex()` + `convex.query(...)` behind an explicit user action (see `app/analytics/AnalyticsPageClient.tsx`) |
| External system events | **Webhook-triggered** mutations/actions (`convex/http.ts` → `integrationInboundPipelineLead`, `webhookInternals`) |

Convex subscriptions are **push-based**. If you find yourself asking "how do I refresh this?", the answer is: you don't. The server pushes.

### A.2 FORBIDDEN — polling

- `setInterval` / `setTimeout` loops that call any Convex query, mutation, or action.
- `refetchInterval`, `pollingInterval`, or any equivalent option.
- SWR / TanStack Query / `react-query` polling against Convex (import of `useQuery` from anything but `convex/react` already fails the build).
- Manual "refresh every N seconds" UI, auto-refresh toggles, or `router.refresh()` timers.
- A `useEffect` that re-invokes a query on a timer to "keep it fresh".

The **only** allowlisted client timers are recorded in `SET_INTERVAL_ALLOWLIST` in `lender-app/scripts/verify-resource-safety.mjs`. Adding to that list requires an approved exception.

### A.3 FORBIDDEN — unstable `useQuery` args

Convex keys a subscription on `(function, args)`. A new args object with a **different value** tears down the subscription and creates a new one; that is a fresh billed query execution plus a re-render, which can produce the next new value. That is the `analytics.dashboard` loop.

**BAD** — this is the 637k-call bug:

```tsx
// Every render produces a new `now` → new args → re-subscribe → re-render → …
const data = useQuery(api.analytics.dashboard, {
  organizationId,
  now: Date.now(),
  startMs: Date.now() - 30 * 86_400_000,
  endMs: Date.now(),
});
```

**GOOD** — quantized clock from a stable provider, memoized args:

```tsx
// components/providers/TriageClockProvider.tsx rounds to the minute and only
// setState()s when the bucket actually changes.
const currentTriageTime = useTriageClockTime();

const args = useMemo(
  () =>
    organizationId && memberUserKey
      ? { organizationId, memberUserKey, currentTriageTime }
      : ("skip" as const),
  [organizationId, memberUserKey, currentTriageTime],
);

const highlights = useQuery(api.taskHighlights.getHubTriageHighlightMap, args);
```

**GOOD** — heavy aggregate, explicit user action, no subscription at all:

```tsx
const convex = useConvex();

const loadStats = useCallback(async () => {
  const now = Date.now(); // fine: one-shot, not a subscription key
  const result = await convex.query(api.analytics.dashboard, {
    organizationId, memberUserKey, startMs, endMs, now, timeField,
  });
  setDashboard(result);
}, [convex, organizationId, memberUserKey, /* … */]);
```

Rules:

1. **Never** call `Date.now()` / `new Date()` inside a `useQuery` argument expression.
2. Time-dependent subscriptions take a **quantized** value (minute bucket or coarser) supplied by a stable provider — currently only `TriageClockProvider`.
3. Build args with `useMemo` over **primitive** deps, or pass the literal `"skip"`. Do not construct fresh arrays/objects inline for non-trivial queries.
4. Use `"skip"` — not conditional hook calls — when prerequisites are missing.

### A.4 FORBIDDEN — effect-driven write loops

**BAD** — the dual-write bug: the mutation updates `updatedAt`, which is a dep, which re-runs the effect:

```tsx
useEffect(() => {
  return () => {
    void flushBorrowers(); // fires on every updatedAt change, not on unmount
  };
}, [dealBundle?.pipeline?.updatedAt, flushBorrowers]);
```

**GOOD** — genuine unmount-only flush; latest callbacks reached through refs so the dep array stays empty:

```tsx
const flushBorrowersRef = useRef(flushBorrowers);
flushBorrowersRef.current = flushBorrowers;

useEffect(() => {
  return () => {
    if (borrowerTimerRef.current) clearTimeout(borrowerTimerRef.current);
    void flushBorrowersRef.current();
  };
}, []);
```

Rules:

1. An effect that triggers a mutation **must not** depend on any server field that the mutation itself writes (`updatedAt`, `lastActivityAt`, version counters, `_creationTime`).
2. Cleanup-flush patterns are **unmount-only** (`[]` deps + refs) **or** guarded by an explicit dirty flag **and** a value-equality check against the last submitted payload.
3. Autosave debounces on the client (`intakeAutosaveDelayMs`) and dedupes on the server.
4. No mutation may run as an unconditional consequence of rendering.

### A.5 Always-mounted shell (MUST)

Expensive aggregate queries are **forbidden** in `app/layout.tsx`, `AppChrome`, `ConvexClientProvider`, `NavigationConfigProvider`, `LiveConnectionProvider`, or any other always-mounted surface. Subscribe from the **route that renders the data**.

A subscription in the shell is billed on **every page of every session for the whole session**. Route-scoped subscription budgets are already codified in `lender-app/lib/convexCostBudget.ts`:

| Budget | Value |
|--------|-------|
| `HUB_IDLE_MAX_QUERY_SUBS` | 6 |
| `FILE_IDLE_MAX_QUERY_SUBS` | 12 |
| `HUB_IDLE_MAX_QUERY_RATE_PER_SEC` | 0.5 |
| `FILE_IDLE_MAX_QUERY_RATE_PER_SEC` | 1.0 |
| `FILE_IDLE_MAX_WRITES_PER_MIN` | 2 |
| `HUB_IDLE_MAX_WRITES_PER_MIN` | 0.5 |
| `PRESENCE_MAX_WRITES_PER_MIN` | 1 |

Heavy analytics and reporting surfaces use **explicit user-triggered load**, not subscriptions.

### A.6 Presence / heartbeat timers

Allowed **only** where already canonical (`hooks/usePresence.ts`), throttled server- and client-side (`convexCostGovernance.canSendPresenceWrite()` hard-gates to 1 write/60s), paused on `visibilitychange`, and documented. **No new heartbeat systems** without an approved exception — see `no-shadow-systems-policy.md`.

---

## B. Backend fail-safes

### B.1 Pagination and bounded reads (MUST)

| Situation | Required |
|-----------|----------|
| Any table that grows with usage (`pipeline`, `contacts`, `tasks`, `documentVault*`, `activity`, `outboundMessages`, `userNotifications`, audit logs) | `.paginate(paginationOptsValidator)` **or** `.take(N)` on an index |
| Provably bounded set (single-org config row, stage list, enum-backed lookup) | `.collect()` **with** a `// bounded: <why>` comment stating the bound |
| Org-wide or cross-tenant scan | **FORBIDDEN** in user-facing queries. Operator/migration only, behind `DATA_MIGRATION_ADMIN_SECRET`, paginated. |

**BAD** — the analytics bug: whole table into memory, billed as bandwidth on every re-subscribe:

```ts
const rows = await ctx.db.query("pipeline").collect();
```

**GOOD** — indexed page with an explicit ceiling:

```ts
const candidates = await ctx.db
  .query("pipeline")
  .withIndex("by_org_autoArchiveAfter", (q) =>
    q.eq("organizationId", organizationId).lte("autoArchiveAfterAt", now),
  )
  .take(AUTO_ARCHIVE_SWEEP_BATCH);
```

**GOOD** — cursor pagination for list surfaces:

```ts
export const listFiles = query({
  args: { organizationId: v.id("organizations"), paginationOpts: paginationOptsValidator },
  returns: /* … */,
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey ?? "");
    return await ctx.db
      .query("pipeline")
      .withIndex("by_org_updated", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
```

`verify:resource-safety` **ratchets** `.collect()`: the current count per file is recorded in `scripts/resource-safety-baseline.json`. Any new unannotated `.collect()` fails the build. Fix it, annotate the bound, or regenerate the baseline **only** when you have genuinely reduced debt.

### B.2 Indexes (MUST)

Use `withIndex`. `.filter()` on a growth table is a full scan and is **forbidden** — it is billed as bandwidth for every document read. Add the index to `convex/schema.ts` in the same change.

### B.3 No wall clock inside queries (MUST)

`Date.now()` / `new Date()` inside a `query` or `internalQuery` handler makes the result non-deterministic, so Convex **cannot cache it** and every subscriber re-executes it.

**BAD:**

```ts
export const dashboard = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const now = Date.now(); // uncacheable
    // …
  },
});
```

**GOOD** — time is an argument, documented at the validator:

```ts
export const dashboard = query({
  args: {
    organizationId: v.id("organizations"),
    startMs: v.number(),
    endMs: v.number(),
    /** Client clock for snooze filtering — never Date.now() inside this query. */
    now: v.number(),
  },
  returns: dashboardResultV,
  handler: async (ctx, args) => { /* uses args.now */ },
});
```

Mutations, actions, and crons **may** read the clock — they are not cached. Pre-existing offenders are frozen in `knownQueryClockDebt` in the baseline file; that list may **shrink**, never grow.

### B.4 Idempotency for external effects (MUST)

Applies to outbound HTTP, email, SMS, payments, signature envelopes, and every inbound webhook.

| Requirement | Implementation in this repo |
|-------------|------------------------------|
| Stable idempotency key | `dedupeKey` on `userNotifications`; `logId` threaded through `webhookDispatcher.dispatchWebhook` |
| Dedupe by external id | `findLinkedPipelineFile(...)` matches `dealData.integrationInbound.externalId` before creating a file — inbound `upsert_pipeline_lead` re-delivery updates instead of duplicating |
| Safe retry with backoff | `webhookDispatcher`: `isRetryableFailure` + `retryDelayMs(attempt)` + `MAX_WEBHOOK_DELIVERY_ATTEMPTS`, re-scheduled via `scheduler.runAfter(delayMs, self)` |
| At-most-once side effects | Status transitions (`queued → sending → sent`) guarded by compare-and-set before the side effect, plus stale-recovery crons |

Retries must be **capped**. A poison message that retries forever is the same bug class as an idle pump.

### B.5 Background task execution limits (MUST)

Every scheduled or queued job needs **all five**:

| # | Requirement |
|---|-------------|
| 1 | **Bounded page size per run** — e.g. `.take(64)`, `AUTO_ARCHIVE_SWEEP_BATCH`, `DATA_BACKUP_PAGES_PER_ACTION` |
| 2 | **Max attempts + backoff** — `MAX_WEBHOOK_DELIVERY_ATTEMPTS` style cap |
| 3 | **A stop condition** — the job must be able to say "done" and stop |
| 4 | **Justified interval** — see [§C](#c-cron--schedule-registry); floor is 15 minutes |
| 5 | **Event-driven enqueue** — `scheduler.runAfter` at the moment work is created, with a slow cron only as a **backup** sweep |

**Self-`runAfter` is allowed only when work provably remains.**

**BAD** — the 1.3M-call pump. It re-schedules unconditionally, so an empty queue costs the same as a full one, forever:

```ts
export const sweepDueAutoArchives = internalMutation({
  handler: async (ctx) => {
    const due = await ctx.db.query("pipeline")./* … */.take(BATCH);
    for (const row of due) await archive(ctx, row);
    // No stop condition — runs forever whether or not anything was found.
    await ctx.scheduler.runAfter(0, internal.pipelineAutoArchiveSweep.sweepDueAutoArchives, {});
  },
});
```

**GOOD** — `dataBackup.executeBackupPass`: continues **only** while unprocessed tables remain, and returns (stops) at completion:

```ts
if (tableIndex >= DATA_BACKUP_TABLE_ORDER.length) {
  await ctx.runMutation(internal.dataBackup.markComplete, { /* … */ });
  await ctx.runMutation(internal.dataBackup.pruneOldBackups, {});
  return; // ← terminates the chain
}

await ctx.scheduler.runAfter(0, internal.dataBackup.executeBackupPass, { snapshotId });
```

**GOOD** — enqueue-time fan-out with a bounded backup sweep (`communications.sweepDueOutboundMessages`): the sweep reads one bounded page and schedules a **different** worker per row; it never re-schedules itself.

`verify:resource-safety` fails any function that schedules **itself** unless it is listed in `SELF_SCHEDULE_ALLOWLIST` with the reason it terminates.

### B.6 Function hygiene (MUST)

- Schedule **`internal*`** functions only — never `api.*`.
- `await` every promise (`ctx.db.*`, `ctx.scheduler.*`, `ctx.runMutation`).
- `args` **and** `returns` validators on every public function.
- Auth + org scope on every public function (`assertOrgMember`, `assertCanMutatePipelineRow`) — see `tenant-isolation-policy.md`.

### B.7 Write amplification (MUST)

- Guard patches with **value equality** — do not `ctx.db.patch` when nothing changed.
- Do not write per keystroke, per render, per scroll, or per hover. Debounce on the client, dedupe on the server (activity events dedupe at 12s, notifications at 120s).
- Cosmetic/telemetry writes are rate-limited; see `ACTIVITY_COSMETIC_MAX_PER_MIN`.
- Use `lib/convexWriteStormGovernance.ts` (`traceConvexMutation`) on new write paths so `window.__dlcWriteStormReport()` sees them.

---

## C. Cron / schedule registry

`lender-app/convex/crons.ts` is the **source of truth**. This table must be updated **in the same change** as any cron addition, removal, or interval change. A cron that is not in this table is a policy violation.

**Interval floor: 15 minutes.** Anything more frequent requires written approval recorded in [§8](#8-approved-exceptions). `crons.interval` with `seconds` is forbidden outright.

| Cron name | Interval | Function | Justification | Empty-tick cost / month |
|-----------|----------|----------|---------------|--------------------------|
| task deadline notifications | daily 14:00 UTC | `notifications.deadlineDigest` | One digest per day; no user-visible latency requirement | ~30 |
| integration durable jobs sweep | 15 min (`DURABLE_JOB_BACKUP_SWEEP_MINUTES`) | `integrationJobs.sweepDueJobs` | **Backup only** — enqueue path already fans out via `scheduler.runAfter`; recovers missed fires | ~2,880 |
| integration stale running recovery | 15 min | `integrationJobs.recoverStaleRunningJobs` | Releases jobs stuck in `running` after a crashed action | ~2,880 |
| communications due sweep | 15 min (`DURABLE_JOB_BACKUP_SWEEP_MINUTES`) | `communications.sweepDueOutboundMessages` | **Backup only** — send path schedules `processOutboundMessage` at enqueue; also releases future-dated sends | ~2,880 |
| communications stale sending recovery | 15 min | `communications.recoverStaleSendingMessages` | Requeues messages stuck in `sending` past `STALE_SENDING_MS` | ~2,880 |
| outbound webhook deliveries sweep | 15 min (`DURABLE_JOB_BACKUP_SWEEP_MINUTES`) | `webhookOutbound.sweepOutboundWebhookDeliveries` | **Backup only** — dispatch is event-driven with its own backoff chain | ~2,880 |
| outbound webhook stale running recovery | 15 min | `webhookOutbound.recoverStaleOutboundDeliveries` | Releases deliveries abandoned mid-flight | ~2,880 |
| portal auth anomaly scan | 15 min | `securityScan.scanPortalAuthAnomalies` | Security detection latency requirement; bounded indexed read | ~2,880 |
| collaboration presence purge | 15 min | `presence.purgeExpired` | Bounded delete of expired presence rows | ~2,880 |
| full data backup snapshot | daily 04:15 UTC | `dataBackup.runScheduledBackup` | Enqueues one paged backup chain with a real terminal condition | ~30 |

**Total scheduled floor: ≈ 23,100 calls/month** even with zero activity. That is the budget these crons consume before a single user signs in — which is why the floor exists and why 1-minute crons (43,200/month **each**) are banned.

**Deliberately absent — do not re-add:**

| Removed | Why |
|---------|-----|
| `pipelineAutoArchiveSweep.sweepDueAutoArchives` cron | ~1.3M calls. Auto-archive is now a **user-initiated** action (`runDueAutoArchives`) from the Pipeline hub. The comment in `convex/crons.ts` marking this is load-bearing — leave it. |

---

## D. Load testing before production (blocking gate)

Extends `.cursor/rules/test-before-deploy.mdc` and `feature-completion-checklist.md` — it does not replace them.

**Order (never reorder):** implement → verify → **load-check** → `convex:deploy:prod` (only if `convex/` changed) → `deploy:prod` → prod smoke → Insights check.

**Never load-test in production.** Use a local `npx convex dev` backend or a dev deployment.

Any new or modified feature that reads or writes Convex MUST be exercised locally and produce evidence for all four:

| # | Check | How |
|---|-------|-----|
| 1 | **Function call count** for one realistic interaction is proportional to the interaction | Watch the `npx convex dev` log stream (or `npm run dev`) while performing the flow once. Count the lines. |
| 2 | **No unexpected repeat calls** — nothing fires on a timer, and nothing fires when the UI is idle | Complete the flow, then sit idle 60s. New function calls in the log while idle = fail. |
| 3 | **No subscription re-fire storm** | `window.__dlcConvexCostReset()` → interact → `window.__dlcConvexCostReport()`. Assert `duplicateSubscriptions.length === 0`, `queryArgChurnPerMinute` near zero, `activeSubscriptionCount` within the `convexCostBudget.ts` limits. |
| 4 | **DB bandwidth** is not dominated by one function | Convex dashboard → **Insights** on the **dev** deployment, after the interaction. |

Commands (from `lender-app/`):

| Command | Purpose |
|---------|---------|
| `npm run verify:resource-safety` | Static gate — banned patterns, cron floor, ratchets; then `verify:convex-reactivity` |
| `npm run dev` | Next + `convex dev`; the Convex log is the call-count instrument |
| `npx playwright test tests/e2e/convex-cost-budget.spec.ts --project=chromium` | Idle subscription + write budget regression |
| `npx playwright test tests/e2e/pipeline-idle-write-budget.spec.ts --project=chromium` | Pipeline file idle write soak |
| `npm run qa:governance` | Full pre-complete gate (runs `build`, which runs the static gate) |

Write-path changes additionally require the idle-write specs above. See `docs/convex-cost-certification.md` for the operator console procedure and expected values. During the same local session, also complete **`convex-reactivity-policy.md` §6** (effects, no-op writes, no pull-refetch) — do not duplicate those checks in this file.

---

## E. Cost guardrails & observability

### E.1 Deployment limits are an operational requirement (MUST)

A dollar spend cap **does not hard-stop production in real time**. Billing is evaluated after the fact; a runaway loop can burn well past the cap before anything reacts. Insights call counts are **not** dollars.

The following must be configured in the Convex dashboard and re-checked whenever a cron or subscription changes:

| Setting | Where | Requirement |
|---------|-------|-------------|
| **Deployment usage limits** — daily function calls | Convex dashboard → Deployment settings → Usage limits | Disable threshold set, sized to a few multiples of the ~23k/month cron floor plus expected user traffic |
| **Deployment usage limits** — daily DB bandwidth | same | Disable threshold set |
| **Team spend threshold — warning** | Convex dashboard → Team settings → Billing | Email warning well below the cap |
| **Team spend threshold — disable** | same | Hard disable configured; treat as the real backstop, not the cap |

### E.2 Post-deploy verification (MUST)

After **any** change touching crons, schedulers, subscriptions, or write paths:

1. Deploy per `docs/deployment-rules.md`.
2. Open Convex **Insights → top functions by calls** and confirm no function has jumped unexpectedly.
3. Re-check 24 hours later. Loops often surface only once real sessions accumulate.
4. If a function is in the top slots and you cannot explain its count from user activity, treat it as an incident: disable the path, then fix.

### E.3 Runtime instrumentation (existing — reuse, do not duplicate)

| Tool | Purpose |
|------|---------|
| `lib/convexCostBudget.ts` | Numeric budgets (subs, writes/min, monthly units) |
| `lib/convexCostGovernance.ts` | `window.__dlcConvexCostReport()` / `__dlcConvexCostReset()`; presence hard gate |
| `lib/convexWriteStormGovernance.ts` | `window.__dlcWriteStormReport()`; idle write-rate warnings |
| `lib/convexSubDiagnostics.ts` | Subscription create/dispose/args-churn counters (`NEXT_PUBLIC_DEBUG_CONVEX_SUBS=1`) |
| `docs/convex-cost-forensics.md`, `docs/convex-cost-certification.md` | Baseline evidence and re-certification triggers |

---

## 6. Automated enforcement

`lender-app/scripts/verify-resource-safety.mjs`, wired into `npm run build`, `npm run verify:resource-safety`, and `npm run verify:governance`.

| Check | Fails on |
|-------|----------|
| Cron floor | `crons.interval` under 15 minutes, or any `seconds` interval |
| Query clock purity | `Date.now()` / `new Date()` inside a `query` / `internalQuery` handler (ratcheted against `knownQueryClockDebt`) |
| Polling ban | `refetchInterval` anywhere in client code; `setInterval` outside `SET_INTERVAL_ALLOWLIST` |
| Stable query args | `Date.now()` / `new Date()` inside a `useQuery(...)` argument list |
| Self-schedule pumps | A function passing itself to `scheduler.runAfter` / `runAt` outside `SELF_SCHEDULE_ALLOWLIST` |
| `.collect()` ratchet | Any increase in unannotated `.collect()` calls per file over the recorded baseline |

Related build gates: `scripts/verify-convex-query-architecture.mjs` (only `convex/react` `useQuery`, no object-form args, no `*_experimental`); `scripts/verify-convex-reactivity.mjs` (exhaustive-deps disable ratchet, cache-buster identifiers — architectural layer, not a second cost check).

---

## 7. Review checklist (paste into PR / completion notes)

- [ ] No new `setInterval` / `setTimeout` / `refetchInterval` touching Convex
- [ ] No `Date.now()` / `new Date()` in any `useQuery` args; time-dependent args are quantized and provider-supplied
- [ ] Query args memoized on primitive deps, or `"skip"`
- [ ] No effect writes depending on server fields the write itself mutates
- [ ] Cleanup flushes are unmount-only or dirty-guarded with value equality
- [ ] No expensive aggregate subscribed from layout / `AppChrome` / providers
- [ ] Growth-table reads use `withIndex` + `.paginate()` / `.take(N)`; any `.collect()` carries a `// bounded:` justification
- [ ] No `Date.now()` inside query handlers
- [ ] External effects idempotent, deduped by external id, retry-capped
- [ ] Background jobs: bounded page, max attempts + backoff, real stop condition, justified interval, event-driven enqueue
- [ ] Self-`runAfter` only with proven remaining work, and allowlisted with a reason
- [ ] Cron registry table in §C updated if `convex/crons.ts` changed
- [ ] Load-check evidence captured per §D (call count, idle silence, no sub churn)
- [ ] `npm run verify:resource-safety` green
- [ ] Convex Insights checked post-deploy

---

## 8. Approved exceptions

Every exception needs: the pattern, the reason, the mitigating bound, and a `// resource-safety-allow: <reason>` (or `// bounded: <why>`) annotation at the call site.

| Pattern | Location | Reason | Bound |
|---------|----------|--------|-------|
| `setInterval` | `components/providers/TriageClockProvider.tsx` | Minute-bucket clock that makes triage query args **stable** instead of per-render | `setState` only; no Convex call; skipped while `document.hidden`; only fires when the bucket changes |
| `setInterval` | `components/ProductTourOverlay.tsx` | Re-measures the spotlight rect during a tour | DOM measurement only; no Convex traffic; cleared on tour end |
| `setInterval` | `hooks/usePresence.ts` | Canonical collaboration presence heartbeat | Hard-gated to `PRESENCE_MAX_WRITES_PER_MIN = 1` by `convexCostGovernance.canSendPresenceWrite()`; disarmed on `visibilitychange` |
| `setInterval` | `lib/convexSubDiagnostics.ts` | Debug counter sampler | Inert unless `NEXT_PUBLIC_DEBUG_CONVEX_SUBS=1` / `__FORCE_CONVEX_SUB_DEBUG__` |
| Self-`runAfter` | `convex/dataBackup.ts::executeBackupPass` | Pages a full backup across action invocations | Advances `progressTableIndex`; `return`s at `DATA_BACKUP_TABLE_ORDER.length`; `DATA_BACKUP_PAGES_PER_ACTION` per run |
| Self-`runAfter` | `convex/webhookDispatcher.ts::dispatchWebhook` | Retry with exponential backoff | Capped by `MAX_WEBHOOK_DELIVERY_ATTEMPTS`; only on `isRetryableFailure` |
| `Date.now()` in queries | `knownQueryClockDebt` in `scripts/resource-safety-baseline.json` | Pre-existing debt (token/portal expiry gates, presence liveness, operator audits) | Frozen list — may shrink, never grow |
| Unannotated `.collect()` | `unboundedCollectsByFile` in `scripts/resource-safety-baseline.json` | Pre-existing debt, largely operator/migration modules | Ratcheted per file; new calls fail the build |

---

## Related

- `docs/governance/convex-reactivity-policy.md` — architectural layer (push vs pull, React correctness, mutation retry-safety). This file does not duplicate it.
- `docs/governance/performance-budget-policy.md`, `performance-budget-thresholds.md`
- `docs/governance/automation-webhook-safety-policy.md` — idempotency, retry, loop safety
- `docs/governance/observability-policy.md`, `observability-map.md`
- `docs/governance/feature-completion-policy.md`, `feature-completion-checklist.md`
- `docs/governance/production-deployment-policy.md`, `docs/deployment-rules.md`
- `docs/governance/no-shadow-systems-policy.md` — no second heartbeat/polling system
- `docs/governance/tenant-isolation-policy.md` — org scope on every read
- `docs/performance-rules.md`, `docs/convex-cost-forensics.md`, `docs/convex-cost-certification.md`
- `.cursor/rules/resource-safety.mdc` (Always Apply), `.cursor/rules/test-before-deploy.mdc`
