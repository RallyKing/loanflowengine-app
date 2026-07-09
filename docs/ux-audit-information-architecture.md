# UX Audit — Information Architecture (Phase 17.5)

**Mode:** READ-ONLY · **Phase:** 17.5 Product Experience Audit  
**Evidence:** `navigationCatalog.ts`, route map (`lender-app/app/**/page.tsx`), `PipelinePageClient.tsx`, `graphProjection.ts`, `project-intelligence-summary.md`, Phase 17.0 UI audits

## Scope — organizational layers audited

| Layer | Primary surfaces | Canonical data / route |
|-------|------------------|------------------------|
| Clients | Hub hierarchy, client projection, linked clients on file | Graph + `/pipeline?hubClient=` |
| Projects | Hierarchy, project projection | Graph + `hubProject` query |
| Loan files | Table, board, hub cards, file workspace | `pipeline` → `/pipeline/[fileId]` |
| Tasks | `/tasks` matrix + `TaskDrawer` | `tasks` |
| Events | `/events`, `/events/[eventId]` | `events` |
| Lenders | `/lenders`, lender projection, file lenders block | `lenders` + file embed |
| Referral partners | Referral projection | Graph index |
| Team members | Team projection | Org members |
| Shared workspace | `/shared` | Share grants |
| Search | `GlobalSearchPalette` (⌘K) | Cross-entity |
| Board | `PipelineBoardView` | Stage columns |
| Calendar | Event dates; file snooze/scheduling — **no global calendar route** | Partial |
| Notifications | `UserNotificationsBell`, task notifications | `userNotifications` |
| Inbox | Events tab `?tab=inbox` | Ideas + invitations |
| Event ideas / invitations | `EventsWorkspaceClient` sub-tabs | Events module |

**Surfaces in this section:** 16 conceptual layers → **48 distinct UI shells** (routes × primary layout modes).

---

## 1. Orientation — does the user always know where they are?

### Strong orientation

- **Global nav catalog** (`NAV_CATALOG`) gives stable top-level buckets: Pipeline, Tasks, Events, Contacts, Lenders, Shared, Activity, Operations, Documents, Settings.
- **Pipeline file workspace** has explicit section IDs (`file-chrome`, `workspace-utilities`, modular blocks) and delegated scroll contract — users on a file feel “inside a deal.”
- **Events detail** uses sticky header + disclosure (post–17.3) — event entity is clear.
- **Breadcrumb (hierarchy only)** — `PipelineHierarchyBreadcrumb` on file workspace and task drawer; **not** on hub list, contacts, or lenders.

### Weak orientation

| Gap | Impact |
|-----|--------|
| **Projection mode vs view mode vs hierarchy filters** on `/pipeline` | Three orthogonal mental models (Client Focus × Table/Board × client/project filters) without a single “you are here” banner. |
| **Contacts vs pipeline embedded contacts** | Two CRM entry points; docs acknowledge link-table vs legacy array — UX does not signal which is authoritative. |
| **Operations vs Activity** | Adjacent nav items (`order` 34 vs 40); similar naming; different data — easy to confuse purpose. |
| **Documents vs Library vs task attachments** | Multiple “document” surfaces without unified IA label. |
| **Analytics / Ledger under pipeline zone** | `isPipelineZonePath` highlights Pipeline on mobile for `/analytics` and `/ledger` — user may think they left “pipeline” mentally but stayed in pipeline chrome zone. |

### Answers to audit questions

1. **Where they are:** Usually yes at **route** level; often **no** at **graph projection** level on hub.
2. **What level:** Clear on **file workspace**; ambiguous on **hub** when projection ≠ hierarchy filter state.
3. **Primary object:** Clear for file/task/event detail; **ambiguous** on hub (row? client? project? lender index row?).
4. **What actions affect what:** Sharing panels differ by entity; bulk actions on hub table only — users may not connect hierarchy delete cascade to graph scope.

---

## 2. Hierarchy confusion hotspots

| Location | Confusion |
|----------|-----------|
| `/pipeline` hub | Client → project → file tree coexists with **8 projection modes** that re-root the list without changing URL semantics equally. |
| Projection `file` vs table rows | Same loans, different grouping affordances. |
| `filterClientKey` / `filterProjectKey` vs URL `hubClient` / `hubProject` | Two filter channels; deep links may not restore full mental state. |
| Multi-client on one file | `LinkedClientsEditor` vs hierarchy breadcrumb — relationship roles not repeated in breadcrumb. |
| Lender on file vs lender directory | Two directories; scenario match adds third “matching” context. |
| Team projection | Surfaces org members against files — overlaps **Shared** and **contacts** mentally. |

**Hierarchy confusion points (scored):** **14** discrete UX locations (see `migration-reports/phase17-5-product-experience-audit.json`).

---

## 3. Expensive context switching

| Transition | Cost driver |
|------------|-------------|
| Hub → file workspace → back | Scroll/filter/projection state partially persisted; board vs table not always restored on mobile. |
| File → task drawer → file | Inspector preserves file scroll (good); task context competes with file chrome utilities. |
| Pipeline → lenders → back | Loses hub filters; lender drawer is different shell than `RecordInspectorShell` patterns on tasks. |
| Events list → event detail → inbox | Tab query params help; inbox vs events is separate mental inbox from **task** inbox copy on `/tasks`. |
| Global search → entity | Jump is fast; **return path** and projection alignment not guaranteed. |
| Settings (appearance) in mobile primary nav | High-frequency mis-tap risk — settings feels global but is not operational context. |

---

## 4. Simultaneous information overload

| Surface | Overload pattern |
|---------|------------------|
| `PipelinePageClient` toolbar | Search + sort + projection + view toggles + density + stage chips + filters + mobile display — **primary overload** |
| `PipelineTableRow` | 14-column analyst density + inline editors + momentum + ownership |
| `PipelineFileWorkspace` | Utilities stack + quick panels + blocks + inspector — mitigated by 17.3 disclosure, still dense |
| `TaskDrawer` | Many collapsible sections; matrix page adds grouping chrome |
| `/contacts` | Large legacy tables |
| `IntakeEditor` / deal workspace | Field-dense forms |

---

## 5. Disconnected flows

| Flow A | Flow B | Disconnect |
|--------|--------|------------|
| Hub hierarchy create | `NewPipelineHierarchyCreateDialog` vs file create | Different entry points, same graph |
| Sharing | File / task / event panels | Three dialects, same semantics |
| Snooze | File header vs task row | Same concept, different control placement |
| Notifications | Bell vs task bell vs event toasts | No unified “attention” model |
| Portal invite | Quick panel block vs settings | Buried vs operational |
| Board | Table/hierarchy | Board does not expose hierarchy or projection — **parallel universe** |

---

## Phase 18 IA recommendations (documentation only)

1. **Single hub orientation strip:** projection label + active filters + breadcrumb to client/project when scoped.
2. **Rename or merge** Operations vs Activity with one-line purpose in nav catalog.
3. **Unify document vocabulary** in nav labels and empty states.
4. **URL as source of truth** for hub projection + hierarchy filters (reduce dual state).
5. **Global calendar** decision: add route or explicitly defer and remove calendar iconography from scheduling-only surfaces.

**Regression risk if IA changes without backend:** Low for copy/URL; medium for hub state persistence.
