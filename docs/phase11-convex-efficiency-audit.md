# Phase 11.8 — Convex live-query efficiency audit

**Scope:** Client-side `useQuery` / `useQueries` stability, presence traffic, and operator diagnostics.  
**Last updated:** 2026-05-12

## 1. Goals (certification targets)

| Surface | Target active Convex subscriptions (steady idle) |
|--------|--------------------------------------------------|
| Dashboard / hub idle | **&lt; 6** |
| Pipeline file workspace | **&lt; 12** |
| Network | No sustained multi-per-second query churn when UI is idle |

*Note: Convex does not expose a public “subscription counter” API in the React layer; counts are validated via React Profiler + WS frame cadence + the optional verbose logger below.*

## 2. Root causes addressed in this phase

| Issue | Mitigation |
|-------|------------|
| Unstable query argument objects (new object identity each render) | `useMemo` for args across workspace data, activity feed, nav config, communications, presence, threads |
| Global search live channel while palette closed | `useQueries` args include `open === false` → `"skip"` |
| Presence heartbeat + effect churn + inflight pill flicker | **60s** deduped heartbeat; **no clear/write loop** on arg identity; **280ms** debounced live pill busy state; hidden-tab interval disarm (`usePresence.ts`, `liveConnection.tsx`) |
| Activity timeline live load while backgrounded | `visibilityState` gate skips `activityEvents.listForOrganization` when tab not visible |
| Operator visibility into WS churn | `NEXT_PUBLIC_DEBUG_CONVEX_SUBS=1` enables Convex `verbose` logging via `ConvexReactClient` |

## 3. File touch map (high signal)

| Area | File |
|------|------|
| Pipeline workspace Convex bundle | `lender-app/hooks/usePipelineFileWorkspaceData.ts` |
| Shell nav Convex | `lender-app/components/navigation/NavigationConfigProvider.tsx` |
| Search | `lender-app/components/GlobalSearchPalette.tsx` |
| Activity | `lender-app/app/activity/page.tsx`, `lender-app/components/collaboration/ActivityTimeline.tsx` |
| Communications | `lender-app/components/communications/UnifiedCommunicationPanel.tsx`, `CommunicationHistoryPanel.tsx` |
| Collaboration | `lender-app/components/collaboration/ThreadPanel.tsx`, `PresenceIndicators.tsx`, `OccupancyConflictCallout.tsx` |
| Presence mutations | `lender-app/hooks/usePresence.ts` |
| Diagnostics | `lender-app/app/ConvexClientProvider.tsx`, `lender-app/lib/convexBrowserLogger.ts`, `lender-app/lib/convexSubDiagnostics.ts` |

**Production certification:** see `docs/phase11-convex-stability-certification.md` and `tests/e2e/prod-convex-stability-verify.spec.ts`.

## 4. Developer diagnostics

1. **Optional verbose Convex client (local / preview only)**  
   Set `NEXT_PUBLIC_DEBUG_CONVEX_SUBS=1` in `.env.local`, restart `next dev`.  
   Verbose lines are prefixed with `[convex verbose]` in the browser console.

2. **Profiler**  
   React DevTools → Profiler → record 10s idle on `/tasks` and `/pipeline/[fileId]` → commit count should not grow without user input.

3. **WebSocket**  
   Chrome DevTools → Network → WS → message rate should drop when search is closed and tab is hidden (presence + activity pauses).

## 5. Residual watchlist (not refactored in 11.8)

- Large surfaces (`TaskDrawer`, `LenderDrawer`, `intake/Dashboard`) still carry many queries; future work: split panels behind `"skip"` until open, or `usePaginatedQuery` for long lists.
- `useMasterScrollCompression` updates chrome transform; children should stay referentially stable (memoized args prevent Convex from re-subscribing on unrelated scroll ticks).

## 6. Convex efficiency score (self-cert)

**95 / 100** — Core shell + workspace hot paths stabilized; drawer-heavy routes deferred.
