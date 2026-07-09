# Phase 24.5.3 — Mobile layout audit (Pipeline File Workspace)

**Date:** 2026-05-28  
**Scope:** Components rendered inside `PipelineFileWorkspace` and its direct children on **mobile** (`< md`). Desktop (`md+`) behavior intentionally unchanged.

## Classification legend

| Class | Meaning |
|-------|---------|
| **SAFE** | No title clipping risk on mobile |
| **TEXT TRUNCATION** | `truncate` / `line-clamp` on a primary name/title |
| **WIDTH STARVATION** | Row flex gives controls priority over text |
| **FLEX SQUASHING** | `flex-1` + `min-w-0` without mobile tier split |
| **OVERFLOW** | Horizontal scroll or `overflow-hidden` hiding text |
| **MOBILE ONLY** | Issue/fix applies only below `md` |
| **DESKTOP + MOBILE** | Issue on all breakpoints |

---

## File header (`PipelineFileWorkspace` chrome)

| Component | Pre-fix | Post-fix | Reach |
|-----------|---------|----------|-------|
| Mobile file title row | **WIDTH STARVATION** — shared row with badges/actions | **SAFE** — Tier 1 `w-full` + `pipelineFileTitleDisplayClass` (wrap, no mobile truncate) | MOBILE ONLY |
| Mobile actions tier | **SAFE** (secondary) | **SAFE** — `flex-wrap`, `shrink-0` on icon buttons | MOBILE ONLY |
| Desktop compact header | **FLEX SQUASHING** — long triage task title could compress file name | **SAFE** — `flex-1 basis-0 min-w-0`; triage task `md:truncate` only | DESKTOP + MOBILE (desktop only change) |
| `FileWorkspaceTriageHighlight` | **TEXT TRUNCATION** on task title (mobile) | **SAFE** mobile wrap; **TEXT TRUNCATION** retained `md:` on task span | MOBILE ONLY fix |
| `HubTriageHighlightBadge` | **TEXT TRUNCATION** + `max-w-[12rem]` | **SAFE** mobile; desktop badge cap unchanged | MOBILE ONLY |

---

## Client / project / file hierarchy

| Component | Pre-fix | Post-fix | Reach |
|-----------|---------|----------|-------|
| `WorkspaceContextAnchor` back label | **TEXT TRUNCATION** | **SAFE** `max-md:break-words` | MOBILE ONLY |
| `OperationalOrientationStrip` `modeLabel` | **WIDTH STARVATION** `shrink-0` | **SAFE** full-width wrap on mobile | MOBILE ONLY |
| Orientation crumbs nav | **OVERFLOW** `overflow-x-auto` | **SAFE** `max-md:flex-wrap` | MOBILE ONLY |
| Crumb links / current span | **TEXT TRUNCATION** `truncate` + `max-w-[12rem]` | **SAFE** mobile wrap | MOBILE ONLY |
| `PipelineHierarchyBreadcrumb` | **TEXT TRUNCATION** (if used) | **SAFE** via `pipelineHierarchyCrumbClass` | MOBILE ONLY |

---

## Task rows (`FileTaskTriageFeedRow`)

| Component | Pre-fix | Post-fix | Reach |
|-----------|---------|----------|-------|
| Task title | **WIDTH STARVATION** — single row with checkbox/meta/delete | **SAFE** — Tier 1 full-width title (`md:hidden`); Tier 2 controls (`md:flex-row` desktop unchanged) | MOBILE ONLY |
| Label pill text | **SAFE** (already `break-words`) | **SAFE** | — |
| Delete / checkbox | **SAFE** (secondary) | **SAFE** `shrink-0` | — |

---

## Notes (`NoteThread` in `FileNotesBlock`)

| Component | Pre-fix | Post-fix | Reach |
|-----------|---------|----------|-------|
| Author display name | **TEXT TRUNCATION** | **SAFE** mobile wrap; `md:truncate` desktop | MOBILE ONLY |
| Attachment / link labels | **TEXT TRUNCATION** | **SAFE** (secondary metadata; not file/client/project/task title) | — |

---

## Contacts (`FileContactsBlock`, `LinkedClientsEditor`)

| Component | Pre-fix | Post-fix | Reach |
|-----------|---------|----------|-------|
| `FileContactsBlock` contact name | **TEXT TRUNCATION** | **SAFE** mobile wrap | MOBILE ONLY |
| `LinkedClientsEditor` display name | **TEXT TRUNCATION** | **SAFE** + `data-testid="linked-client-display-name"` | MOBILE ONLY |
| `ClientRelationshipBadge` | **TEXT TRUNCATION** | **SAFE** mobile wrap | MOBILE ONLY |

---

## Activity / status / toolbars

| Component | Classification | Notes |
|-----------|----------------|-------|
| `PipelineFileActivityPanel` | **SAFE** | No `truncate` on activity copy |
| `PipelineStageSelector` compact | **SAFE** | Stage label may truncate; not a file/client/project/task title |
| `ResourceAccessBanner` | **SAFE** | |
| Block section headers (`HubCollapsibleSubsection`) | **SAFE** | Section labels, not entity titles |
| `HeaderDisclosureToggle` / overflow menu | **SAFE** | Actions tier |

---

## Out of workspace scope (not changed)

| Component | Classification | Reason |
|-----------|----------------|--------|
| `PipelineTableRow` | **TEXT TRUNCATION** | Hub table, not file workspace |
| `PipelineHubHierarchyView` | Addressed in 24.3A | Hub, not file drawer |
| `TaskTriageQuickEditPopover` | **TEXT TRUNCATION** | Overlay popover; desktop-oriented |
| `TriageLabelPillEditor` | **TEXT TRUNCATION** | Pill cap; secondary |

---

## Global mobile token

`lender-app/lib/pipeline/mobileInformationHierarchy.ts` — shared `pipelineMobilePrimaryTitleClass`, `pipelineFileTitleDisplayClass`, `pipelineHierarchyCrumbClass`.

---

## Step 5 — `truncate` / `line-clamp` sweep (file workspace tree)

Removed or gated with `md:` for **primary titles** on mobile in:

- `PipelineFileWorkspace.tsx` (header split)
- `FileTaskTriageFeedRow.tsx`
- `FileWorkspaceTriageHighlight.tsx` / `HubTriageHighlightChrome.tsx`
- `OperationalOrientationStrip.tsx` / `WorkspaceContextAnchor.tsx`
- `PipelineHierarchyBreadcrumb.tsx`
- `LinkedClientsEditor.tsx` / `ClientRelationshipBadge.tsx`
- `FileContactsBlock.tsx` / `NoteThread.tsx`

Intentionally retained on desktop and on non-primary labels (stage pills, hub badges, note attachment names).
