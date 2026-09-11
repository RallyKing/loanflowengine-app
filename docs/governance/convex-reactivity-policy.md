# Convex reactivity & React correctness policy

**Status:** Binding platform policy. Applies to **every** client data path (`useQuery` / `useMutation` / `useAction` / `useConvex`), every effect that reads or writes Convex state, and every local store that might duplicate a Convex document.

**Verification:** `npm run verify:convex-reactivity` (from `lender-app/`; also runs at the end of `npm run verify:resource-safety`, which is inside `npm run build`) + `npm run verify:governance:docs`.

**This is not the cost policy.** Cost, polling bans, cron floors, pagination, scheduler stop conditions, and the idle load-check numbers live in **`resource-consumption-policy.md`**. When a rule here is already stated there, this document **cross-references** it. Do not copy those clauses into a second copy.

| Layer | Document | Question it answers |
|-------|----------|---------------------|
| **Why + how to use Convex** | **This file** | Push vs pull; which primitive; React deps; mutation retry safety; who owns which state |
| **How not to go bankrupt** | `resource-consumption-policy.md` | Loops, clocks, `.collect()`, crons, idle pumps, spend guardrails |
| **Who owns which state** | `state-management-policy.md`, `state-ownership-map.md` | Server vs ephemeral UI vs persisted preferences |

The 2026-08-17 overage is cited here only as **architectural evidence** (misuse of the reactivity model), not as a second cost narrative. Call counts and remediations: **`resource-consumption-policy.md` §1**.

---

## 1. Architectural principle — Convex is push, not pull

Convex clients hold a **WebSocket** to the backend. `useQuery(api.foo.bar, args)` registers a **subscription** keyed on `(function, args)`. When any document that query read changes, the server **pushes** a new result. The component re-renders. There is no cache to invalidate, no refetch to schedule, no "is this stale?" timer.

That is the product. Treating Convex like REST + React Query (poll, invalidate, cache-bust, `key={nonce}` remount) is a **misuse of the technology**, not a style preference:

- A pull loop **fights** the subscription: you pay for the push *and* the pull.
- Unstable args **tear down** the subscription every render, so the "live" query never actually stays live — it is a new query every time (`analytics.dashboard` with `Date.now()` in args; see resource policy §A.3).
- Copying query results into `useState` **hides** the push: the UI shows a snapshot while the subscription continues to fire unused.
- Manual refresh UI teaches users (and the next author) that the data layer is stale-by-default. It is not.

**The test:** if the sentence you are about to implement starts with "how do I refresh / refetch / keep this in sync?", the answer is already running. Subscribe with stable args and render the result.

Cost consequences of getting this wrong (re-subscribe storms, write amplification, idle crons) are enumerated in **`resource-consumption-policy.md` §A–§C**. This policy forbids the **paradigm**, even when a given instance would be cheap.

---

## 2. Canonical data-access decision table

| Need | Canonical mechanism | Do **not** |
|------|---------------------|------------|
| Read live server state | `useQuery` from **`convex/react`** only (enforced by `scripts/verify-convex-query-architecture.mjs`) | SWR, TanStack Query, `fetch` polling, `convex.query` in an effect, a second `useQuery` wrapper |
| Write server state | `useMutation` | `ctx.db` from the client; fire-and-forget `void mutate()` without in-flight guards on submit |
| External / Node / 3rd-party side effect (HTTP, email, Stripe, LLM) | Convex **`action`** / `internalAction` (`"use node"` when Node APIs are required), which then `runMutation` to persist | Calling the vendor SDK from a React effect; a Next.js Route Handler that also writes Convex without going through an action |
| External **event** (vendor webhook, inbound lead, portal callback) | HTTP route in `convex/http.ts` → **webhook-triggered mutation** (`integrationInboundPipelineLead`, `webhookInternals`) | Client polling the vendor "until it shows up"; a cron that scrapes the vendor as the primary path |
| One-shot expensive aggregate / report | `useConvex()` + `convex.query(...)` behind an **explicit user action** — see `app/analytics/AnalyticsPageClient.tsx` | Live `useQuery` of the same aggregate; auto-load on mount for org-wide scans |
| Time-dependent **live** read (triage, snooze, "overdue") | Quantized clock from **`TriageClockProvider`** / `useTriageClockTime()` passed as a query arg (resource policy §A.3, §8) | `Date.now()` in args or inside the query handler; a second clock provider |
| Server render / public token page | `preloadQuery` + `preloadedQueryResult` from `convex/nextjs` — see `app/apply/[token]/page.tsx`, `app/share/[token]/page.tsx` | `fetch` to a Convex HTTP URL; `useQuery` in a Server Component |
| Collaboration presence | **`hooks/usePresence.ts`** only (resource policy §A.6) | A new heartbeat, `setInterval` ping, or "who's online" poll |
| Offline / reconnect | **`lib/offline/OfflineSyncContext.tsx`** mutation queue + snapshot **fallback when `canUseHub` is false** | A localStorage copy of Convex documents used while online |

### 2.1 When a developer thinks they need polling

They don't. Walk this list in order:

1. **Is the query subscribed?** If `useQuery` is mounted with stable args, the next write already pushes. There is nothing to poll.
2. **Are the args stable?** If you pass `Date.now()`, a new object with a new nested Date, or an inline array that changes identity *and value*, you are not subscribed — you are re-querying. Memoize on primitives or pass `"skip"`. Cost detail: resource policy §A.3.
3. **Is the query the wrong shape?** If you need "files due in the last hour" as a live list, pass a **quantized** `nowBucket` from `TriageClockProvider` (minute). Do not poll.
4. **Is this an expensive aggregate?** Don't subscribe. Put a Load / Refresh **button** on the route (`AnalyticsPageClient`). User-triggered `convex.query` is pull **once**, which is allowed; a timer around it is not.
5. **Is the source of truth not Convex?** Only then see §2.2.

### 2.2 Narrow legitimate exceptions (not polling Convex)

| Exception | Canonical owner | Bound |
|-----------|-----------------|-------|
| Third-party HTTP API with **no webhook** and no Convex table behind it | A Convex **action**, invoked by user gesture or by `scheduler.runAfter` at enqueue time, with a 15-minute **backup** sweep — resource policy §B.5 / §C | Never `setInterval` in the browser against that API either if the result is then written to Convex |
| Minute-bucket clock (no Convex call) | `components/providers/TriageClockProvider.tsx` | `setState` only when the bucket changes; paused while `document.hidden` |
| Presence heartbeat | `hooks/usePresence.ts` | `PRESENCE_MAX_WRITES_PER_MIN = 1`; disarmed on `visibilitychange` |
| Tour spotlight remeasure (DOM only) | `components/ProductTourOverlay.tsx` | No Convex traffic |
| Debug subscription sampler | `lib/convexSubDiagnostics.ts` | Off unless `NEXT_PUBLIC_DEBUG_CONVEX_SUBS=1` |
| Auth token fetch | `lib/useConvexWorkspaceAuth.ts` `fetchAccessToken` | Convex auth handshake, not a data poll |

Adding a new timer requires an entry in **`resource-consumption-policy.md` §8** **and** `SET_INTERVAL_ALLOWLIST` in `scripts/verify-resource-safety.mjs`. This policy additionally requires: the timer must **not** exist to refresh Convex data.

---

## 3. React correctness (deeper than cost)

Cost-related effect loops (cleanup keyed on `updatedAt`) are banned in **resource policy §A.4**. The rules below are about **React being honest with Convex**, even when the loop would not show up on a bill.

### 3.1 Exhaustive `useEffect` dependency arrays

- Arrays must be **strict and exhaustive**. If the linter says a value is used, it is in the array — or it lives in a **ref** whose `.current` is assigned during render (the borrower dual-write pattern).
- **Do not lie to the linter.** Empty `[]` while closing over a callback that closes over server state is how `saveBorrowerIdentityDualWrite` hit ~36k calls: cleanup ran on every `updatedAt`, not on unmount.
- **Do not disable `react-hooks/exhaustive-deps`** unless the same line or the line above carries `// reactivity-allow: <reason>`. A prose `-- comment` is not enough for **new** disables (pre-existing disables are ratcheted; see §9).
- Prefer refs + `[]` for genuine unmount-only work over a disable.

**BAD** — the incident. Cleanup is *not* unmount-only; `updatedAt` is in the dep list, and the mutation writes `updatedAt`:

```tsx
useEffect(() => {
  return () => {
    void flushBorrowers();
  };
}, [dealBundle?.pipeline?.updatedAt, flushBorrowers]);
```

**GOOD** — `lib/contacts/borrowerTabWriteAdapter.ts`: latest flushes in refs; effect deps stay empty:

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

### 3.2 Never mutate server state from an effect that depends on that same server state

If the mutation writes field `F`, `F` must not appear in the effect's dependency array (including indirectly: a callback identity that changes when `F` changes).

This is the `saveBorrowerIdentityDualWrite` incident. Resource policy §A.4 states the cost rule; this policy states the **React** rule: that effect is a **feedback loop**, full stop. Cleanup flushes are unmount-only (`[]` + refs) **or** dirty-flagged with value equality against the last submitted payload.

### 3.3 Do not mirror Convex data into local state just to render

`useQuery` **is** the source of truth. Derive during render (`useMemo` if expensive). Do not:

```tsx
const rows = useQuery(api.pipeline.listTablePreview, args);
const [localRows, setLocalRows] = useState([]);
useEffect(() => {
  if (rows) setLocalRows(rows);
}, [rows]);
return localRows.map(/* … */);
```

**Allowed local state** (must be named as such in code or in `state-ownership-map.md`):

| Kind | Example in this repo | Rule |
|------|----------------------|------|
| **Form draft** that diverges until save | `ConstructionBudgetBlock` `headerDraft` / `lineDrafts` with `dirtyRef`; `PipelineScenarioMatch` form + `criteriaKey` | Hydrate from the query **once per identity** (file id / version key). Do not clobber dirty drafts on every push. Skip the write when `criteriaEqual` / equivalent. |
| **Optimistic overlay** while a mutation is in flight | `PipelinePageClient` `optimisticRows` cleared when live `rows` arrive | Overlay, not a second copy of the subscription. |
| **Offline snapshot fallback** | `persistQuerySnapshot` / `loadQuerySnapshot` in `OfflineSyncContext` — used when `canUseHub` is **false** | Must not be read as truth while the subscription is live. |
| **Last-known-while-loading** | `useHubTriageHighlightMap` keeps a **ref**, not render state, so the previous map shows during a context switch | Ref is fine; `useState` that duplicates `raw` is not. |

**GOOD** — derive, don't copy (`hooks/useHubTriageHighlightMap.ts`): `useMemo` args from `useTriageClockTime()`, `useQuery`, normalize in `useMemo`, keep last-known in a **ref**.

### 3.4 Stable identity for query args and callbacks

- `useQuery` args: `useMemo` over **primitive** deps, or the literal `"skip"`. Do not pass inline object/array literals for non-trivial queries (new object every render is a footgun the day someone adds a `Date` or a nested unstable value). Convex currently deep-equals primitive arg objects, which is why many existing call sites still work — **do not rely on that** for new code.
- **GOOD:** `hooks/usePipelineFileWorkspaceData.ts`, `hooks/useHubTriageHighlightMap.ts`, `app/pipeline/PipelinePageClient.tsx` (`listPreviewArgs`).
- **Debt (do not copy):** inline `{ fileId, ...(memberUserKey ? { memberUserKey } : {}) }` in `modules/pipeline/components/blocks/ConstructionBudgetBlock.tsx`; dozens of similar `useQuery(api.x, { … })` sites under `modules/` and `components/`. New code memoizes.
- Callbacks passed into children or into effect deps: `useCallback` with primitive deps. Unstable `onError` / `onSuccess` inline functions are why `RichFilePreview.tsx` and `ScenarioSearch.tsx` disable exhaustive-deps — fix the callback identity instead of disabling.

### 3.5 No manual refresh / invalidate / cache-buster / remount hacks

Forbidden:

- `refreshKey`, `refreshNonce`, `queryNonce`, `cacheBuster`, `forceRefetch` state used to retrigger a Convex read
- `key={Date.now()}` (or any nonce) on a component to force it to remount and re-subscribe
- `router.refresh()` on a timer (resource policy §A.2)
- A local cache of Convex documents **while online** (IndexedDB snapshots are offline-only; see §3.3)
- Calling `convex.query` in a `useEffect` with `[data]` deps "to keep React state in sync" with a subscription that already exists

**GOOD one-shot refresh:** `AnalyticsPageClient` Load / Refresh **button** → `convex.query(api.analytics.dashboard, …)` into component state that is **not** also subscribed. That state is the result of a user-triggered report, not a mirror of a live query.

### 3.6 One clock, one presence, one cost dashboard

| Concern | Canonical | Do not add |
|---------|-----------|------------|
| Quantized time for query args | `TriageClockProvider` / `useTriageClockTime()` | A second `setInterval` clock, `useNow()`, `useTicker()` |
| Presence | `hooks/usePresence.ts` + `convexCostGovernance.canSendPresenceWrite()` | Another heartbeat |
| Subscription / write diagnostics | `lib/convexCostGovernance.ts`, `lib/convexSubDiagnostics.ts`, `lib/convexWriteStormGovernance.ts`, `lib/convexCostBudget.ts` | A second `__dlc*Report` or a parallel budget file |

See `no-shadow-systems-policy.md` and `duplicate-system-watchlist.md`.

---

## 4. Mutation idempotency (client + server)

**Distinct from** outbound HTTP / webhook idempotency in **resource policy §B.4**. This section is about **Convex mutations themselves**: Convex retries on transient failures, React Strict Mode double-invokes in dev, and users double-click.

### 4.1 Server

- **Value-equality guard before `patch`.** If every field already matches, return success without writing, without bumping `updatedAt`, without activity. Canonical helpers: `dealPatchIsNoOp` (`convex/dealDataMerge.ts`) used by `pipeline.patchDeal`; `jsonStableEqual` in `applyBorrowersDealPatch` (`convex/pipelineContacts.ts`).
- **Create-if-missing** uses a stable dedupe key (email + org, `externalId`, slot `contactId`) — find then insert. `assignContactToBorrowerSlot` reuses the slot already bound to the contact rather than appending a duplicate.
- **No "append on every call"** for lists (borrowers, links, activity) unless the mutation is explicitly "add another" and the UI has a unique client nonce.
- Do not write per keystroke. Debounce on the client (`intakeAutosaveDelayMs`); dedupe on the server (resource policy §B.7).

### 4.2 Client

- Submit buttons: **disabled while in-flight** (`saving` / `borrowerSaving` in the dual-write adapter). Double-click must not fire two creates.
- Autosave: queue one pending payload; flush replaces the pending value (last-write-wins on the draft), does not enqueue N mutations.
- Unmount flush: refs + `[]` (borrower adapter). Do not put `updatedAt` or the flush callback in that effect's deps.
- After a successful mutation, skip the next identical payload (`PipelineScenarioMatch` `criteriaEqual` / `lastSavedRef`).

**Approved pattern** (do not regress): unmount-only flush + server identical-patch skip. Product Updates `2026-08-17-convex-no-runaway-loops`.

---

## 5. State management alignment

Convex is the **server-state owner**. React state is **ephemeral UI only**. Full maps: **`state-management-policy.md`**, **`state-ownership-map.md`**.

| Layer | Lives in | Examples |
|-------|----------|----------|
| Authoritative records | Convex tables, via `useQuery` / mutations | Pipeline file, contacts, tasks, lenders, `fileSharedState` |
| Ephemeral UI | Component `useState` / URL | Drawer open, form drafts, bulk-select set, hub focus id |
| Persisted **preferences** | `localStorage` (or org preference tables when they are settings) | Inspector width (`RecordInspectorShell`), sidebar expanded, hub sort, color scheme, nav recency |

**Forbidden:**

- Redux, Zustand, or a Context that **mirrors Convex documents** for the rest of the tree to read as truth. Feature Contexts in this repo (`DealWorkspaceEditorContext`, `OrgPermissionsContext`, `SessionCtx`) wrap **subscriptions or drafts**, they are not a second database.
- `localStorage` / IndexedDB as an online cache of server rows that can **drift** from Convex. Offline snapshots (`persistQuerySnapshot`) are allowed only when the live subscription is unavailable (`canUseHub === false`) and must be discarded when live rows arrive (`PipelinePageClient` clears `cachedRows` / `optimisticRows` on live data).

**Fine:**

- Persisted layout chrome (drawer width, column visibility, hierarchy expansion).
- `userSettingsStorage` for client-only editor cadence preferences that are not org-shared records.

When adding state, declare owner / derivation / sync / persistence per `state-management-policy.md`. If the derivation source is a Convex document, the sync strategy is **subscription**, not poll-and-store.

---

## 6. Local dev-server architectural validation (blocking)

Extends **`.cursor/rules/test-before-deploy.mdc`**, **`feature-completion-checklist.md`**, and the cost load-check in **`resource-consumption-policy.md` §D**. Same order: implement → verify → **load-check + architectural check** → deploy. **Never validate in production.**

Any feature that reads or writes Convex must be exercised against a **local `npx convex dev` / `npm run dev` backend** (or a dedicated **dev** deployment). In addition to §D's four cost checks, confirm:

| # | Architectural check | Fail if |
|---|---------------------|---------|
| A | **Unexpected repeat invocations** of the same mutation/query during one user action | Dev log shows the function more times than the action justifies (double-submit, effect firing twice per change, Strict Mode *plus* a real loop) |
| B | **Subscription re-fire storm on interaction** | Typing, expanding a row, or opening a drawer causes `useQuery` args to churn (`window.__dlcConvexCostReport()` `queryArgChurnPerMinute` / `duplicateSubscriptions`) — same instrument as §D.3, interpreted as a **reactivity** bug, not only a cost bug |
| C | **Effects fire more than once per meaningful change** | A save, a tab switch, or a query result update re-runs a write effect or a hydrate-into-state effect in a loop |
| D | **No-op writes** | Network/dev log shows `patch` / dual-write / activity append when values did not change — missing `dealPatchIsNoOp` / `jsonStableEqual` / client `criteriaEqual` |

Idle 60s silence (zero new calls) remains the §D gate. This section adds **during-interaction** correctness: the subscription should push, effects should be boring, mutations should be skippable.

Do not use production Insights as the first validation. Production is the **post-deploy** backstop in resource policy §E.2, after the local gate is green.

---

## 7. Anti-patterns found in this repo (cite these; do not copy)

| Pattern | Where | Verdict |
|---------|-------|---------|
| Cleanup effect depended on `updatedAt` the mutation writes | Historical `borrowerTabWriteAdapter` (fixed: unmount-only + refs) | **Incident.** Canonical fix in §3.1 / §4 |
| Live `useQuery` args included `Date.now()` | Historical analytics dashboard | **Incident.** Cost: resource §A.3. Architecture: that was pull pretending to be push |
| Inline `useQuery(..., { fileId, ...spread })` | `ConstructionBudgetBlock.tsx`, `FormsApplicationsTab.tsx`, `ContactFinancialsTab.tsx`, `EntityHubDetailPanel.tsx`, many `modules/` call sites | **Debt.** Works today because Convex deep-equals primitive args; new code uses `useMemo` / `"skip"`. Not statically ratcheted (noisy; see §9) |
| `useEffect` copies query → `useState` for a form | `ConstructionBudgetBlock` (`setHeaderDraft` / `setLineDrafts` with `dirtyRef`); `PipelineScenarioMatch` (`criteriaKey` + `criteriaEqual`) | **Allowed draft hydrate** if dirty-guarded. Do not use this for read-only views |
| Offline snapshot of list query | `PipelinePageClient`, `app/tasks/page.tsx` via `persistQuerySnapshot` | **Allowed** only when `canUseHub` is false; live path must not read the snapshot as truth |
| `eslint-disable` `react-hooks/exhaustive-deps` without `reactivity-allow:` | 15 sites (see `scripts/convex-reactivity-baseline.json`) | **Ratcheted debt.** New disables need `// reactivity-allow: <reason>` |
| Undocumented disable (no reason at all) | `RichFilePreview.tsx` L250; `useDealWorkspaceEditor.tsx` L634; `PipelineScenarioMatch.tsx` L278; `ScenarioSearch.tsx` L226 | **Fix or annotate** when those files are next touched |
| Tasks errand expand state re-seed | `app/tasks/page.tsx` — deps `[t._id, t.type]` so Convex checklist pushes don't collapse the grocery UI | **Legitimate UI state**; disable must keep a reason (already has one) |

---

## 8. Review checklist (architectural — paste alongside resource policy §7)

- [ ] Data path matches the §2 table (`useQuery` / `useMutation` / action / webhook / user-triggered aggregate / `preloadQuery`)
- [ ] No new polling, timers, or "refresh" controls against Convex (resource §A.2)
- [ ] Query args memoized on primitives or `"skip"`; time from `TriageClockProvider` only
- [ ] No `useEffect` that writes Convex and lists a field that write mutates
- [ ] Unmount flushes are `[]` + refs
- [ ] No `useState`+`useEffect` mirror of a `useQuery` used for rendering
- [ ] No `refreshKey` / remount-`key` / local online cache of documents
- [ ] Mutations: value-equality skip, in-flight disable, no append-on-retry
- [ ] New `exhaustive-deps` disable has `// reactivity-allow: <reason>`
- [ ] Local **dev** backend: §6 checks A–D + resource §D idle silence
- [ ] `npm run verify:resource-safety` green (includes this policy's static gate)

---

## 9. Automated enforcement

`lender-app/scripts/verify-convex-reactivity.mjs`, invoked from `verify-resource-safety.mjs` after the cost checks pass.

| Check | Fails on | Ratchet / skip |
|-------|----------|----------------|
| Undocumented `exhaustive-deps` disable | `eslint-disable` of `react-hooks/exhaustive-deps` without `// reactivity-allow: <reason>` on that line or the line above | Per-file count of such disables frozen in `scripts/convex-reactivity-baseline.json` — may shrink, never grow |
| Cache-buster identifiers | `refreshKey`, `refreshNonce`, `queryNonce`, `cacheBuster`, `forceRefetch` in client TS/TSX | None today; `// reactivity-allow:` on the line / line above to escape |
| Remount hacks | `key={Date.now()}` | None today |

**Intentionally not automated** (too noisy or too many false positives):

- Inline object/array literals in `useQuery` args — Convex deep-equals primitive objects, and ~50+ existing sites would fail on day one. Policy §3.4 still **requires** `useMemo` for new non-trivial queries; review catches copies of `ConstructionBudgetBlock`.
- `useState`+`useEffect` mirroring — indistinguishable from legitimate form hydration without an AST + dirty-flag heuristic. Policy §3.3; review against §7 table.
- Raising ESLint `react-hooks/exhaustive-deps` from **warn** (Next `core-web-vitals` default) to **error** — see `.eslintrc.json`. Pre-existing disables remain; new missing-deps become lint errors. The static ratchet covers disable comments that omit `reactivity-allow:`.

Related: `scripts/verify-convex-query-architecture.mjs` (import source of `useQuery`); `scripts/verify-resource-safety.mjs` (polling, `Date.now()` in args, clocks in query handlers).

---

## Related

- `docs/governance/resource-consumption-policy.md` — cost/loop layer this file must not duplicate
- `docs/governance/state-management-policy.md`, `state-ownership-map.md`
- `docs/governance/no-shadow-systems-policy.md`, `duplicate-system-watchlist.md`
- `docs/governance/feature-completion-policy.md`, `feature-completion-checklist.md`
- `docs/performance-rules.md`
- `.cursor/rules/convex-reactivity.mdc` (Always Apply), `.cursor/rules/resource-safety.mdc`, `.cursor/rules/test-before-deploy.mdc`
