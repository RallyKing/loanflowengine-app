# State ownership map

**Client + server conceptual map.** Complements Convex schema.

---

## Server-authoritative (Convex)

| State | Owner | Consumers |
|-------|-------|-----------|
| Pipeline file row | `pipeline` mutations | File workspace, hub, portal |
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
| Form drafts | Local component | Discard rules explicit |
| UI compaction | `MobileChromeController` | Publishes narrow focus flags — avoid broad context churn |

---

## Forbidden

- **Two sources of truth** for the same numeric field on a file without `fileSharedState` alignment.
- **Silent cross-feature event buses** outside documented patterns.

---

## Related

- `state-management-policy.md`
- `canonical-system-map.md`
