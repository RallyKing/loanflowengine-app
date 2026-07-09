# Phase 28.1 — Client-level notes aggregation & creation (read-only audit)

**Date:** 2026-05-28  
**Status:** Audit complete — **no code shipped** (architecture only)

## Executive summary

Pipeline file notes live in **`pipelineFileNotes`** (not a separate `convex/notes.ts`). The canonical file APIs are **`pipelineFileNotes.getNotesByFileId`** and **`pipelineFileNotes.createNote`**. The Pipeline Hub **Client** projection already materializes every file linked to a client on **`HubClientNode.projects[].loans[].row`** (`PipelineTablePreviewRow`).

**Recommended v1:**

1. **New Convex query** `getNotesByPipelineFileIds` (or `getNotesForClientHub`) that accepts an explicit **`pipelineFileIds[]`** from the hub tree (plus `organizationId` / `memberUserKey`), merges notes across files, enriches rows like the single-file query, and returns a **global timeline** sorted pinned-first then `_creationTime` desc.
2. **Client UI** in **`ClientSection`** (`PipelineHubHierarchyView.tsx`): collapsible **`HubCollapsibleSubsection`**-style block inserted **under the client header, above the project list**, subscribed only when the subsection is expanded (lazy `useQuery` `"skip"`).
3. **Composer** reuses **`NoteComposer`** + **`createNote`**, with a **file `<select>`** populated from a client-side helper over `HubClientNode` (no extra file-list query required for the dropdown).

---

## 1. Notes data model & queries

### Canonical module

| Path | Role |
|------|------|
| **`lender-app/convex/pipelineFileNotes.ts`** | All note queries/mutations (there is no `convex/notes.ts`) |
| **`lender-app/convex/schema.ts`** | `pipelineFileNotes`, `pipelineFileNoteLinks` tables + indexes |

### Schema (`pipelineFileNotes`)

| Field | Type | Notes |
|-------|------|--------|
| `organizationId` | `Id<"organizations">` | Tenant scope |
| `pipelineFileId` | `Id<"pipeline">` | **Required** — every note belongs to exactly one file |
| `authorUserKey` | `string` | Set on create |
| `content` | `string` | Body |
| `attachments` | optional array | Convex `_storage` refs |
| `isPinned` / `pinnedAt` / `pinnedBy` | optional | Pin semantics (Phase 24.5) |

**Indexes:**

- `by_file`: `["pipelineFileId"]` — efficient per-file fetch (used today)
- `by_org_file`: `["organizationId", "pipelineFileId"]` — used by `batchPipelineFileNoteCounts`

There is **no** `clientId` on notes and **no** client-level index. Client aggregation must resolve **file IDs first**, then read notes by file.

### Current single-file read: `getNotesByFileId`

```445:522:lender-app/convex/pipelineFileNotes.ts
export const getNotesByFileId = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    ...orgMemberArgs,
  },
  handler: async (ctx, args) => {
    // assertFileOrgMatch + assertCanReadPipelineRow
    // query by_file index → sortNotesForDisplay (pinned, then _creationTime desc)
    // per note: authorDisplayName, attachment URLs, links, canDelete, canPin
  },
});
```

**Display sort (per file):** pinned by `pinnedAt` desc, then unpinned by `_creationTime` desc (`sortNotesForDisplay`).

### Current create: `createNote`

```291:342:lender-app/convex/pipelineFileNotes.ts
export const createNote = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    content: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
    links: v.optional(v.array(noteLinkInputValidator)),
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  // assertCanMutatePipelineRow(..., "note_create")
  // insert pipelineFileNotes + optional pipelineFileNoteLinks
});
```

**Related mutations (reuse unchanged):** `generateUploadUrl` (requires `pipelineFileId`), `pinNote`, `unpinNote`, `deleteNote`, `addNoteLink`, `removeNoteLink`.

### Batch counts (table only)

`batchPipelineFileNoteCounts` scans **`by_org_file`** for the org and filters to a file id set — used by `listTablePreview`, not full note bodies. Pattern proves org-scoped scan is acceptable for bounded batches but is **not** ideal for full note hydration at scale.

### Proposed Convex query: multi-file aggregation

**Name (suggested):** `getNotesByPipelineFileIds`  
**File:** extend `lender-app/convex/pipelineFileNotes.ts` (or shared internal `loadNotesForFiles(ctx, fileIds, org, memberKey)`).

**Args (recommended):**

```typescript
{
  organizationId: Id<"organizations">;
  memberUserKey?: string;
  pipelineFileIds: Id<"pipeline">[];  // explicit hub-provided set
}
```

**Why pass `pipelineFileIds` from the client (not only `clientId`):**

| Reason | Detail |
|--------|--------|
| Hub parity | `buildClientFocusTree` uses `GraphProjectionIndex.clientToFileIds` + graph `clients` edges — same files the user sees |
| Synthetic clients | Keys like `legacy-client:…` are **not** Convex `clients` ids — `hubEntitySupportsInlineCreate` blocks mutations; notes must still work for **visible files** via passed ids |
| Filtered hub | Respects current `filtered` / projection search — only notes for files in the expanded client tree |
| ACL | Server still **re-validates** each file: `assertFileOrgMatch` + `assertCanReadPipelineRow` per id |

**Optional server fallback (v2):** When `clientId` is a real `Id<"clients">`, resolve extra file ids via:

- `fileClients` index **`by_org_entity`** (`organizationId`, `clientId`)
- `loanClients` / `pipeline.clientId` FK (dual-read per `indexedGraphAnalyze` commentary)

v1 can skip server-side client resolution if the hub always passes ids.

**Handler algorithm (sketch):**

```text
1. Dedupe pipelineFileIds; if empty → return [].
2. For each fileId (bounded, e.g. max 200):
     - load pipeline doc; skip if missing
     - assertFileOrgMatch + assertCanReadPipelineRow
     - query pipelineFileNotes.by_file.eq(pipelineFileId)
     - reuse existing enrichment loop from getNotesByFileId
     - attach denormalized fields: pipelineFileId, fileName (from pipeline.fileName)
3. Merge all note rows into one array.
4. Global sort:
     - pinned first (pinnedAt desc)
     - then _creationTime desc
5. Return ClientPipelineNoteRow[] (extends single-file shape + file context)
```

**Performance note:** Per-file `by_file` queries are **O(files)** index lookups — acceptable for typical client loan counts (often &lt; 20). Avoid org-wide `collect()` on all notes unless profiling shows low file counts with huge org note volume.

**Do not** add a `clientId` column to `pipelineFileNotes` for v1 — keeps migration risk zero and reuses existing mutations.

### Chronological timeline semantics

| Product ask | Implementation |
|-------------|----------------|
| Unified chronological feed | Single merged list after global sort |
| Pinned behavior | Match file workspace: **pinned notes first** (all files), then chronological |
| File context on each row | `fileName` + link to open file (`selectFile` / `pipelineDealEditorHref?focusBlock=fileNotes`) |

---

## 2. File selection data for the composer

### How the Client view knows its files

**Projection:** `projectionMode === "client"` → `PipelineHubHierarchyView` → **`ClientSection`** per `HubClientNode`.

**Tree builder:** `buildClientFocusTree(filtered, graphIndex, { sort, stageIndex })` in `PipelinePageClient.tsx`.

**File membership (per client):** For each `clientId` in `clientToFileIds`, every linked file is placed under a **`HubProjectNode`** with **`HubLoanNode { row: PipelineTablePreviewRow }`**. A file linked to multiple clients can appear under multiple client nodes (by design).

**Fields available on each row (no extra query for dropdown):**

| Field | Source |
|-------|--------|
| `fileId` | `loan.row._id` |
| `fileTitle` | `loan.row.fileName` |
| `canEditFile` | `loan.row.canEditFile` (for disabling composer) |
| `projectTitle` | optional subtitle in dropdown: `project.title` |

### Client-side helper (new, `lib/pipeline/collectClientHubFileOptions.ts`)

```typescript
export type ClientHubFileOption = {
  fileId: Id<"pipeline">;
  fileTitle: string;
  projectTitle: string;
  canEditFile: boolean;
};

export function collectClientHubFileOptions(
  client: HubClientNode,
): ClientHubFileOption[] {
  const seen = new Set<string>();
  const out: ClientHubFileOption[] = [];
  for (const project of client.projects) {
    for (const loan of project.loans) {
      const id = String(loan.row._id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        fileId: loan.row._id,
        fileTitle: loan.row.fileName?.trim() || "Untitled file",
        projectTitle: project.title,
        canEditFile: loan.row.canEditFile !== false,
      });
    }
  }
  return out.sort((a, b) =>
    a.fileTitle.localeCompare(b.fileTitle) ||
    a.projectTitle.localeCompare(b.projectTitle),
  );
}
```

**Composer wiring:**

- Default `<select>` to first editable file (or first file).
- `NoteComposer` / `generateUploadUrl` / `createNote` use **selected** `pipelineFileId`.
- If `options.length === 0`: hide composer; show empty state.
- If no editable files: read-only message (mirror `ResourceAccessProvider` / `canEditFile`).

**No new Convex query required** for dropdown population in hub v1.

### Server-side file set for read query

Pass the same ids:

```typescript
const fileIds = collectClientHubFileOptions(client).map((o) => o.fileId);
```

Keeps **read** and **write** scopes aligned with visible hub data.

---

## 3. Client hierarchy UI placement

### Render chain

```text
PipelinePageClient (effectiveView === "table", projectionMode === "client")
  → PipelineHubProjectionView
    → PipelineHubHierarchyView
      → ClientSection (per HubClientNode)   ← insertion point
        → ProjectSection → LoanStackRow / file rows
```

### `ClientSection` structure today

```614:713:lender-app/components/pipeline/PipelineHubHierarchyView.tsx
<section data-testid="pipeline-hub-client" data-pipeline-hub-component="ClientSection">
  <HubTriageHighlightFrame>
    <RowShell primary={client.displayName} … />   <!-- client header -->
  </HubTriageHighlightFrame>
  {showNested && (
    <div className="space-y-1 border-t-2 …">
      {client.projects.map((project) => <ProjectSection … />)}
    </div>
  )}
</section>
```

### Safest insertion point

**When `showNested` (client expanded):** insert **between** the client `RowShell` block and the **projects** container:

```text
Client header (RowShell)
  ↓
[NEW] Client Notes collapsible (composer + timeline)
  ↓
Projects / loans hierarchy
```

**Rationale:**

- Sits directly under the **main client title** (product ask).
- Does not disrupt project/loan rail layout or Phase 27 entity stage headers.
- Natural reading order: client identity → cross-file notes → structured hierarchy.

### Collapsible UI pattern

Reuse patterns from:

| Reference | Use |
|-----------|-----|
| **`HubCollapsibleSubsection`** | Chevron + `pipelineWorkspaceCollapse*` grid; collapsed by default |
| **`HubProjectDetailSubsections`** | Project-level nested collapsibles |

**New (suggested):** `ClientNotesSubsection` or generic `HubClientCollapsibleSubsection` with:

- Title: **Client notes** (+ optional count badge from query or sum of `fileNotesCount` on visible rows)
- Icon: `FileText` or `MessageSquare`
- Persistence: new `lib/pipeline/hubClientSubsectionExpansion.ts` keyed by `client.clientId` (mirror `hubProjectSubsectionExpansion.ts`)

**Subsection contents (expanded):**

1. **Composer row:** `<select>` file target + `NoteComposer` (or thin wrapper `ClientScopedNoteComposer`)
2. **Timeline:** `ClientNotesTimeline` — merged feed; each card shows file name chip + reuse `NoteCard` UI from `NoteThread.tsx` (export shared presentational component to avoid duplication)

### Props to thread from `PipelineHubHierarchyView`

`ClientSection` already receives `organizationId`, `memberUserKey`, `selectFile`, `selectFileNotes`. Add:

- `stageIndex` not needed for notes
- Use existing `selectFile(fileId)` for “open file” from a note row
- `selectFileNotes(fileId)` for deep-link to file notes block (already sets `focusBlock: "fileNotes"` in `PipelinePageClient`)

### Synthetic / legacy hub clients

| Case | Notes read | Notes create |
|------|------------|--------------|
| Real `clients` id | Yes, via passed `pipelineFileIds` | Yes if `canEditFile` on target file |
| `legacy-client:*` key | Yes, for files in tree | Same — `createNote` keys off **file** id, not client id |

---

## 4. Performance & subscription constraints

### Lazy subscription (required)

| State | `useQuery` |
|-------|------------|
| Client collapsed | **`"skip"`** — no note bodies loaded |
| Client expanded, notes subsection collapsed | **`"skip"`** (recommended) — avoids hydration until user opens notes |
| Notes subsection expanded | Active args: `{ organizationId, memberUserKey, pipelineFileIds }` |

**Pattern:**

```typescript
const fileOptions = useMemo(
  () => collectClientHubFileOptions(client),
  [client],
);
const fileIds = useMemo(
  () => fileOptions.map((o) => o.fileId),
  [fileOptions],
);
const notesExpanded = /* local state + optional localStorage */;
const queryArgs =
  showNested && notesExpanded && organizationId
    ? { organizationId, memberUserKey, pipelineFileIds: fileIds }
    : "skip";
const raw = useQuery(api.pipelineFileNotes.getNotesByPipelineFileIds, queryArgs);
```

### Invalidation / freshness

- After `createNote`, Convex reactivity updates any subscriber with overlapping file ids in the query result.
- `listTablePreview` `fileNotesCount` on rows may lag until next preview tick — optional v2: optimistic increment on client subsection only.

### Load safeguards

| Guard | Recommendation |
|-------|----------------|
| Max files per query | Cap `pipelineFileIds.length` (e.g. 100) server-side; truncate with warning in dev |
| Max notes returned | Optional limit + “load more” (v2) if clients have hundreds of notes |
| Empty file list | Skip query; show “No linked files” |
| Large attachments | Same as file notes — enrichment calls `storage.getUrl` per attachment (existing cost) |

### Scroll architecture

- Subsection lives inside **`AppChrome` `<main>`** scroll owner — **no** nested `overflow-y` on the notes list.
- Collapse animation via existing `pipelineWorkspaceCollapseGrid` (no new scrollport).

---

## 5. Implementation blueprint

### Files to add

| File | Purpose |
|------|---------|
| `lender-app/lib/pipeline/collectClientHubFileOptions.ts` | `{ fileId, fileTitle, projectTitle, canEditFile }[]` from `HubClientNode` |
| `lender-app/lib/pipeline/hubClientNotesExpansion.ts` | localStorage expand state per `clientId` |
| `lender-app/hooks/useClientPipelineNotes.ts` | `useQuery` wrapper + normalize merged timeline |
| `lender-app/components/pipeline/notes/ClientScopedNoteComposer.tsx` | File `<select>` + `NoteComposer` |
| `lender-app/components/pipeline/notes/ClientNotesTimeline.tsx` | Merged feed + file badge |
| `lender-app/components/pipeline/ClientNotesSubsection.tsx` | Collapsible shell (or inline in `ClientSection`) |

### Files to modify

| File | Change |
|------|--------|
| **`convex/pipelineFileNotes.ts`** | Add `getNotesByPipelineFileIds`; extract shared `enrichNoteRow` internal helper from `getNotesByFileId` |
| **`lib/pipeline/pipelineFileNotesTypes.ts`** | Add `ClientPipelineNoteView` (+ `pipelineFileId`, `fileName`) |
| **`components/pipeline/PipelineHubHierarchyView.tsx`** | `ClientSection`: insert notes subsection; pass org/member keys |
| **`components/pipeline/notes/NoteThread.tsx`** | Export `NoteCard` (or move to `NoteCard.tsx`) for reuse with extra file label slot |
| **`PipelinePageClient.tsx`** | No change required if props already reach `PipelineHubHierarchyView` (org + memberUserKey already passed) |

### Files explicitly **not** required v1

| File | Reason |
|------|--------|
| `convex/schema.ts` | No schema change |
| `FileNotesBlock.tsx` / workspace drawer | Unchanged; still per-file canonical block |
| `listTablePreview` | Optional later: client-level note count badge |

### React layout (target)

```tsx
{showNested && (
  <>
    <div className="border-t-2 border-border/50 px-1 pt-1">
      <ClientNotesSubsection
        clientId={client.clientId}
        client={client}
        organizationId={organizationId}
        memberUserKey={memberUserKey}
        onOpenFile={selectFile}
        onOpenFileNotes={selectFileNotes}
      />
    </div>
    <div className="space-y-1 border-t-2 border-border/50 px-1 pb-2 pt-1">
      {client.projects.map((project) => (
        <ProjectSection key={project.projectId} … />
      ))}
    </div>
  </>
)}
```

### UI components mapping

| Product element | Implementation |
|-----------------|----------------|
| Collapsible accordion | `HubCollapsibleSubsection` pattern + client-scoped storage |
| New Note composer | `ClientScopedNoteComposer` → `api.pipelineFileNotes.createNote` |
| Select File dropdown | `<select>` over `collectClientHubFileOptions(client)` |
| Chronological feed | `ClientNotesTimeline` ← `useClientPipelineNotes` |
| Open file from note | Button/link → `selectFile(note.pipelineFileId)` |

### Security checklist

- [ ] Every file in `pipelineFileIds` validated org + read access in query
- [ ] `createNote` uses selected file id only (existing mutation gates)
- [ ] `generateUploadUrl` uses same selected file id
- [ ] No notes leaked across orgs or clients without shared file edges

### Testing checklist (implementation phase)

1. Client with 2+ files, notes on each → expanded subsection shows merged timeline with correct file labels.
2. Create note from client composer with file B selected → appears under file B; visible when sorting by time.
3. Collapsed notes subsection → network tab shows **no** `getNotesByPipelineFileIds` call.
4. Collapsed client → no notes query.
5. Pin/delete on aggregated row → same behavior as file thread (per-note permissions).
6. Synthetic `legacy-client` hub key → read works; create works when file editable.
7. Mobile: single scroll; subsection expand does not trap scroll.

### Validation commands (implementation phase)

From `lender-app/`:

```bash
npm run build
npm run qa:governance
npm run deploy:prod
```

Document in `docs/phase28-2-client-notes-implementation.md`.

---

## 6. Open product decisions

1. **Show subsection when client collapsed?** v1: only when client expanded; v2: collapsed strip with total note count.
2. **Global vs per-file pin order** when merging — recommend global pinned block then global chronological (matches `sortNotesForDisplay` spirit).
3. **Default file in dropdown** — first alphabetical vs last-updated file.
4. **Archived/snoozed files** — include if present in `filtered` hub tree (likely yes).

---

## Related docs & code

| Topic | Path |
|-------|------|
| File notes block (workspace) | `components/pipeline/blocks/FileNotesBlock.tsx` |
| Note UI | `components/pipeline/notes/NoteComposer.tsx`, `NoteThread.tsx` |
| Hook | `hooks/usePipelineFileNotes.ts` |
| Hub client tree | `lib/pipeline/graphProjection.ts` (`buildClientFocusTree`) |
| Client UI | `components/pipeline/PipelineHubHierarchyView.tsx` (`ClientSection`) |
| Collapsible pattern | `components/pipeline/HubCollapsibleSubsection.tsx` |
| Graph file↔client edges | `fileClients` / `by_org_entity` in `convex/schema.ts` |
