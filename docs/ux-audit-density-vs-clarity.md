# UX Audit — Density vs Clarity (Phase 17.5)

**Mode:** READ-ONLY  
**Builds on:** `docs/ui-audit-header-systems.md`, `docs/ui-audit-row-systems.md`, Phase 17.3 header compression

## Classification legend

| Tier | Meaning |
|------|---------|
| **Essential** | Required for primary action or safety |
| **Secondary** | Useful default-visible for power users |
| **Tertiary** | Nice-to-have metadata |
| **Hidden-by-default** | Progressive disclosure candidate |

---

## Headers

| Surface | Essential | Secondary | Tertiary | Hidden-by-default |
|---------|-----------|-----------|----------|-------------------|
| `PipelineFileWorkspace` (post-17.3) | Name, stage, open actions | Snooze, key dates | Tags, momentum | Scheduling meta, utility overflow |
| `TaskDrawer` | Title, status, complete | Due, assignee | Links count | Attachments meta, sharing overflow |
| `EventDetailClient` | Title, when | Location | Collaborator count | Extended description |
| `PipelinePageClient` hub | Search, stage filter | Sort, projection | Density toggles | Analyst settings links |
| `AppChrome` | Nav, account | Notifications | Product tour | Impersonation details |

**Finding:** File/task/event headers improved in 17.3; **hub header remains overloaded** (tertiary controls default-visible).

---

## Drawers & inspectors

| Surface | Density issue | Recommendation tier |
|---------|---------------|---------------------|
| `TaskDrawer` | 15+ sections | Default-collapse non-core sections (partially done) |
| `LenderDrawer` | Program lists, contacts | Hide programs behind disclosure |
| `RecordInspectorShell` | OK shell; content-heavy | Body sections need `ProgressiveDisclosureCard` |
| Event share `fixed` panel | Form + list | Collapse invite form when list long |

---

## Hub rows & table

| Component | Essential | Secondary | Tertiary | Hide default |
|-----------|-----------|-----------|----------|--------------|
| `PipelineTableRow` | Name, stage, open | Amount, owner | Momentum stars, sub-stage | Notes preview, 6+ columns |
| `PipelineHubFileRow` | Title, stage | Owner line | Badges | Relationship chips |
| `PipelineHubHierarchyView` | Label, expand | Actions | Momentum | — |
| `SharedResourceRow` | Title, role | Owner badge | Upgrade CTA | Revoke (overflow) |
| `app/tasks/page.tsx` `TaskRow` | Title, quadrant | Due | File link | Snooze (hover) |
| Events list row | Title, date | Role | — | Convert/trash → overflow |

**Badge noise:** `PipelineHubFileFocusBadges`, `PipelineHubTaskFocusBadges`, `ClientMomentumStars`, stage chips — **compete on same row**.

---

## Board cards

| Element | Tier |
|---------|------|
| File name | Essential |
| Stage chip | Secondary |
| Economics | Tertiary — **hide on card**, show in preview |
| Owner | Hidden-by-default on card |

---

## Event sections

- Inbox ideas vs invitations: OK density.
- Event detail: sharing panel dense — match file sharing disclosure pattern.

---

## Sharing panels

Three dialects (`PipelineFileSharingSection`, `EventSharingPanel`, `TaskSharingSection`):

| Element | Tier |
|---------|------|
| Collaborator list | Essential |
| Invite form | Secondary — collapse when ≥3 collaborators |
| Role explanation | Tertiary — tooltip |
| Access details | Hidden-by-default |

---

## Activity streams

- `PipelineFileActivityPanel` — medium density; timestamp + actor essential.
- `ActivityTimeline` (collaboration) — duplicate metaphor with file activity.

---

## Breadcrumbs

- Compact mode: **essential** labels only — good.
- File workspace: sometimes buried in disclosure — risk **tertiary treatment of essential orientation**.

---

## Command palette

`GlobalSearchPalette`: grouped results — **secondary** metadata per hit (ownership badge) is appropriate; filter chips could be hidden-by-default.

---

## Filters

`PipelinePageClient`: stage chips + momentum + capital stack + involvement — **multiple secondary filters default visible** → primary overload.

---

## Summary counts

| Category | Items audited | Hidden-by-default candidates |
|----------|---------------|------------------------------|
| Headers | 5 | 12 controls |
| Rows | 8 | 22 metadata chips/columns |
| Filters | 6 | 4 filter groups |
| Sharing | 3 panels | 3 forms |

**Platform density posture:** Still **admin-dense** on hub and table; **improving** on file/task/event chrome after 17.3.
