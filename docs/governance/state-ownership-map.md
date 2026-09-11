# State ownership map

**Client + server conceptual map.** Complements Convex schema.

---

## Server-authoritative (Convex)

| State | Owner | Consumers |
|-------|-------|-----------|
| Pipeline file row | `pipeline` mutations | File workspace, hub, portal |
| Pipeline Client title | Live primary entity + primary individual (`listTablePreview` → `clientDisplayName`) | Hub table/board, file header; `dealData.clientName` write-through only |
| Contacts | `contacts` API | Contacts page, file linking |
| Lenders | `lenders` API | Lenders page, scenario match |
| Tasks | Tasks API | Tasks page, notifications |
| File shared fields | `fileSharedState` | Blocks, summaries |
| Drawer layout | `fileDrawerLayout` / globals | `PipelineDrawer` |
| User/org prefs | preferences / org tables | Settings, shell |

---

## Client-local (ephemeral)

| State | Owner | Rules |
|-------|-------|-------|
| Drawer open | Drawer component / URL | Must not break **active** scroll owner (`<main>` or, on file route, **`[data-pipeline-workspace-scroll]`**) |
| Form drafts | Local component | Discard rules explicit. Hydrate from `useQuery` **once per identity** with a dirty guard — do not clobber in-progress edits on every push (`convex-reactivity-policy.md` §3.3). |
| UI compaction | `MobileChromeController` | Publishes narrow focus flags — avoid broad context churn |
| Optimistic overlay | Owning list (e.g. hub `optimisticRows`) | Overlay while a mutation is in flight; clear when live `useQuery` rows arrive. Not a second copy of the document. |

---

## Persisted preferences (not server data)

| State | Owner | Rules |
|-------|-------|-------|
| Inspector / vault splitter width | `RecordInspectorShell`, `DocumentVaultExplorerSplit` | `localStorage` chrome geometry — fine |
| Hub sort, hierarchy expansion, column visibility | Pipeline hub persistence helpers | UI chrome — fine |
| Color scheme, sidebar expanded, nav recency | Shell / `colorScheme` | UI chrome — fine |
| Offline query snapshots | `OfflineSyncContext` `persistQuerySnapshot` | **Only** when `canUseHub` is false. Discard when live rows arrive. Do not use as an online cache. |

---

## Forbidden

- **Two sources of truth** for the same numeric field on a file without `fileSharedState` alignment.
- **Silent cross-feature event buses** outside documented patterns.
- **Redux / Zustand / Context stores that mirror Convex documents** for the tree to read as truth — subscribe with `useQuery` instead (`convex-reactivity-policy.md` §5).
- **`localStorage` replicas of pipeline / task / contact rows while online** — they drift. Preferences (widths, expanded flags) are the exception, not list payloads.
- **A second quantized clock or presence heartbeat** — `TriageClockProvider` and `hooks/usePresence.ts` are canonical (`duplicate-system-watchlist.md`).

---

## Related

- `state-management-policy.md`
- `convex-reactivity-policy.md`
- `canonical-system-map.md`
