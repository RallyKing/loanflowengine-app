# Phase 37.6.D.1 — Document Storage & Vault Infrastructure Audit

**Date:** 2026-06-23  
**Status:** Read-only reconnaissance — **no application code changed**  
**Goal:** Map existing upload/storage primitives, document schemas, legacy UI surfaces, and Tab 4 shell state to prepare the Document Vault (Tab 4) greenfield module.

**Prerequisite docs:** `docs/phase37-1-data-bridge-audit.md`, `docs/phase37-1-data-bridge-execution.md`, `docs/phase37-macro-alignment-audit.md` §3.5, `lender-app/docs/collaboration-architecture-audit.md`.

**Prompt note:** Referenced `DocumentVaultTab.tsx` — **that file does not exist**. Tab 4 is wired through `FileWorkspaceTabShell.tsx` with a generic `TabPlaceholder`; live upload UI lives in `LibraryDocumentsPanel` (quick panel + contacts/tasks).

---

## 1. Executive summary

| Finding | Detail |
|---------|--------|
| **Primary blob store** | **Convex file storage** (`Id<"_storage">`) — no S3, Vercel Blob, or UploadThing in production paths |
| **Canonical document model** | **`libraryDocuments`** + **`libraryDocumentVersions`** + **`libraryDocumentLinks`** — versioned, multi-entity links |
| **Upload client utility** | `lib/uploadToConvexStorage.ts` — shared POST pipeline (80 MB cap) |
| **Tab 4 shell** | **Placeholder only** — `documents` tab shows dashed “Tab content will mount here” |
| **Live file UI today** | **`LibraryDocumentsPanel`** in pipeline **quick panel** (`quick-panel-documents`), contacts page, task drawer |
| **intakeSheets / dealData** | **No** embedded attachment arrays — documents are **not** stored inside deal JSON |
| **Category taxonomy** | **`libraryDocumentCategoryV`** on **`libraryDocumentLinks.documentCategory`** — schema + index exist; **mutations and UI not wired** |
| **Parallel stores** | `taskAttachments`, `lenderAttachments`, `clientPortalUploads`, `fileMessageAttachments` — separate from library vault |

**Recommended Tab 4 strategy:** **Promote and extend `LibraryDocumentsPanel`** into a full-tab `DocumentVaultTab` shell — do **not** invent a second storage system. Add searchable metadata tags (category + year + free-text) on top of the existing flat versioned list.

---

## 2. Storage layer configuration

### 2.1 Production upload path (Convex `_storage`)

All user-facing uploads in the audited codebase follow the same pattern:

```
Client                          Convex
──────                          ──────
generateUploadUrl()      →      ctx.storage.generateUploadUrl()
POST file (multipart)    →      Convex stores blob → returns storageId
commit* mutation         →      Insert row(s) pointing at storageId
getVersionUrl / getUrl   →      ctx.storage.getUrl(storageId)
```

**Shared client module:** `lender-app/lib/uploadToConvexStorage.ts`

| Export | Role |
|--------|------|
| `MAX_LENDER_ATTACHMENT_BYTES` / `MAX_TASK_ATTACHMENT_BYTES` | **80 MB** per file (aligned with server) |
| `validateLenderAttachmentFile` / `validateTaskAttachmentFile` | Size + non-empty checks |
| `postFileToConvexUploadUrl` | POST bytes to Convex upload URL; parse `{ storageId }` JSON |
| `uploadLocalFilesViaConvexUrl` | Batch helper: validate → generate URL → POST → `commitEach` |
| `guessAttachmentKind` | image / pdf / text / other for preview routing |
| `MAX_BRANDING_LOGO_BYTES` | 2 MB for org logos (images only) |

**Not used:** AWS S3 SDK, `@vercel/blob`, UploadThing, direct `fileUrl` persistence on deal rows.

### 2.2 Storage-backed tables (inventory)

| Table | Blob field | Purpose | Versioned? | Link model |
|-------|------------|---------|------------|------------|
| **`libraryDocuments`** + **`libraryDocumentVersions`** | `storageId` on versions | **Central document library** (Tab 4 target) | **Yes** | Via `libraryDocumentLinks` |
| **`taskAttachments`** | `storageId` | Task drawer files | No | `taskId` FK |
| **`lenderAttachments`** | `storageId` | Lender profile uploads | No | `lenderId` FK |
| **`clientPortalUploads`** | `storageId` | Client portal uploads (25 MB server cap) | No | `grantId` + `pipelineFileId` |
| **`fileMessageAttachments`** | `storageId` | Deal-room message attachments | No | `messageId` FK |
| **`signatureEnvelopes`** | Uses library version | E-sign (Dropbox Sign / demo) | N/A | `libraryDocumentId` + `libraryVersionId` |
| **`organizations`** (branding) | `logoStorageId` | White-label logo | No | Org row |
| Task templates | `attachmentStorageId` | Template attachment clone | No | Template row |
| Backup / export jobs | `manifestStorageId`, `storageId` | Ops NDJSON exports | N/A | System |

### 2.3 Canonical library schema metadata keys

**`libraryDocuments`** (`convex/schema.ts` L2471–2484):

| Field | Type | Role |
|-------|------|------|
| `organizationId` | optional org FK | Tenant scope |
| `title` | string | User-facing document name (primary label today) |
| `createdByUserKey` | string | Uploader identity |
| `latestVersionNumber` | number | Monotonic version counter |
| `latestVersionId` | optional FK | Pointer to current blob row |
| `latestFileName` | optional string | Denormalized from latest version |
| `latestContentType` | optional string | MIME |
| `latestSize` | optional number | Bytes |
| `latestUploadedAt` | optional number | ms timestamp |
| `createdAt` / `updatedAt` | number | Row lifecycle |

**`libraryDocumentVersions`** (L2486–2495):

| Field | Type | Role |
|-------|------|------|
| `documentId` | FK | Parent document |
| `version` | number | 1-based version index |
| `storageId` | **`Id<"_storage">`** | **Blob pointer** |
| `fileName` | string | Stored filename |
| `contentType` | optional string | MIME |
| `size` | optional number | Bytes |
| `uploadedByUserKey` | string | Version author |
| `uploadedAt` | number | Version timestamp |

**`libraryDocumentLinks`** (L2500–2514):

| Field | Type | Role |
|-------|------|------|
| `documentId` | FK | Library document |
| `pipelineFileId` | optional FK | **File / deal link** |
| `contactId` | optional FK | CRM contact link |
| `taskId` | optional FK | Task link |
| `documentCategory` | optional enum | **Phase 37.1.B taxonomy** (see §4) |
| `linkedAt` / `linkedByUserKey` | audit | Link provenance |

**Link rule:** Each link row associates a document with **exactly one** of pipeline / contact / task (mutually exclusive FKs). A document may have **multiple link rows** (same blob visible on deal + contact + task).

**Indexes:** `by_pipeline_linkedAt`, `by_contact_linkedAt`, `by_contact_category`, `by_task_linkedAt`, `by_document`.

### 2.4 Server module: `convex/libraryDocuments.ts`

| API | Type | Purpose |
|-----|------|---------|
| `generateUploadUrl` | mutation | Public upload URL (no auth args — proof checked on commit) |
| `createDocument` | mutation | Insert doc + initial link for pipeline/contact/task proof |
| `addDocumentLink` | mutation | Attach existing doc to another entity |
| `removeDocumentLink` | mutation | Unlink; orphan purge via cleanup |
| `commitDocumentVersion` | mutation | Attach new blob version (max **80 MB**, metadata retry) |
| `patchDocumentTitle` | mutation | Rename document |
| `listForProof` | query | List docs for pipeline file / contact / task |
| `listVersions` | query | Version history per document |
| `getVersionUrl` | query | Signed download URL |
| `listHub` | query | Org-wide document list (`/documents` page) |
| `listLinksForDocument` | query | Cross-entity link explorer |

**Access control:** `assertCanReadLibraryDocument`, `assertProofWrite`, org permission `files.view` / `files.edit`, pipeline/contact/task row checks.

**Cleanup:** `convex/libraryDocumentsCleanup.ts` — orphan document purge when last link removed; called from pipeline/contact/task delete paths.

### 2.5 E-sign integration

| Module | Role |
|--------|------|
| `convex/signatures.ts` | Envelope CRUD on library versions |
| `components/DocumentSignatureBlock.tsx` | UI block embedded in `LibraryDocumentsPanel` per document |

---

## 3. Legacy & floating document UI surfaces

### 3.1 Live components (reuse candidates)

| Component | Path | Context | Features |
|-----------|------|---------|----------|
| **`LibraryDocumentsPanel`** | `components/LibraryDocumentsPanel.tsx` | `pipeline` \| `contact` \| `task` | Create + upload, new versions, title edit, version history, preview dialog, e-sign block, unlink |
| **`AttachmentPreviewDialog`** | `components/AttachmentPreviewDialog.tsx` | Shared preview | PDF/image/text preview |
| **`DocumentSignatureBlock`** | `components/DocumentSignatureBlock.tsx` | Per library doc | Signature envelope UI |
| **Documents hub page** | `app/documents/page.tsx` | Org scope | Read-only hub listing + “where linked” |

### 3.2 Mount points today

```
PipelineFileWorkspace
└── PipelineFileWorkspaceShell utilities rail
    └── quick-panel-documents (L3063–3079)
        └── LibraryDocumentsPanel { kind: "pipeline", pipelineFileId }

Contacts page (app/contacts/page.tsx L947+)
└── LibraryDocumentsPanel { kind: "contact", contactId }

TaskDrawer (components/TaskDrawer.tsx L280+)
└── LibraryDocumentsPanel { kind: "task", taskId }
```

**Drawer block registry:** Documents are **not** a collapsible drawer block (`pipelineBlockRegistry` has no `documents` block). They live in the **utilities quick panel** above the drawer (`sectionsState.documents` expand/collapse).

### 3.3 Tab 4 shell — placeholder only

**File:** `components/pipeline/FileWorkspaceTabShell.tsx`

| Item | State |
|------|-------|
| Tab id | `"documents"` (4th of 6 tabs) |
| Label | `"Documents"` |
| Panel prop | **None** — no `documentsPanel` prop exists (unlike `overviewPanel`, `dealInfoPanel`, `dealWorkspacePanel`) |
| Render | Falls through to `TabPlaceholder` (L83) |
| Test id | `pipeline-tab-placeholder-documents` |

**`PipelineFileWorkspace.tsx` wiring (L3008–3015):** Passes `overviewPanel`, `dealInfoPanel`, `dealWorkspacePanel` only — **no documents panel**.

### 3.4 Other document-adjacent UI (out of vault scope)

| Surface | Storage | Notes |
|---------|---------|-------|
| Client portal file upload | `clientPortalUploads` | Separate from library; `convex/clientPortal.ts` |
| Task attachments (non-library) | `taskAttachments` | May coexist with library links on same task |
| Lender upload tab | `lenderAttachments` | `/lenders?tab=upload` |
| File message attachments | `fileMessageAttachments` | Thread panel uploads |
| Print / export | Generated PDFs | Not vault storage |

### 3.5 intakeSheets / dealData — no attachment arrays

**Grep result:** `intakeSchemaPart.ts` has **no** `attachments[]`, `documents[]`, or `storageId` on the deal sheet.

Deal JSON holds underwriting fields only; **all file bytes live outside dealData** in Convex storage + relational tables.

**`intakeDocumentDefaults.ts`:** Seeds workflow checklist labels like “Credit Report”, “PDF Proposal” — **text checklist items**, not file references.

---

## 4. Category taxonomy & metadata gap

### 4.1 Schema-ready categories (`libraryDocumentCategoryV`)

**File:** `convex/contactStickyData/validators.ts` L36–42

| Value | Intended use |
|-------|----------------|
| `id` | Government ID |
| `dd214` | Military discharge |
| `tax_return` | Tax returns |
| `deal_specific` | File-scoped underwriting doc |
| `other` | Catch-all |

**Index:** `libraryDocumentLinks.by_contact_category` on `["contactId", "documentCategory"]`.

### 4.2 Not wired (audit finding)

| Layer | Status |
|-------|--------|
| `libraryDocuments.createDocument` | Does **not** accept `documentCategory` |
| `libraryDocuments.addDocumentLink` | Does **not** accept `documentCategory` |
| `LibraryDocumentsPanel` | No category picker; title is free text only |
| `listForProof` return shape | Does **not** include link category |
| Contact UI | Category filter not implemented |

**Phase 37.1 execution doc** (`phase37-1-data-bridge-execution.md` L120) explicitly deferred: *“Extend libraryDocuments.ts to accept documentCategory on create/link.”*

### 4.3 Planned metadata (from 37.1 audit — not implemented)

`phase37-1-data-bridge-audit.md` proposed optional `contactDocumentMetadata` with `documentType`, `taxYear`, `expiryDate` — **no table exists in current schema**. Tax year tagging would require new fields or link-level metadata extension.

---

## 5. Tab 4 structural staging blueprint

### 5.1 Target architecture (Phase 37.6.D.2+)

```
FileWorkspaceTabShell
└── documentsPanel → DocumentVaultTab (new)
    ├── File-scoped header (file name, upload CTA, search/filter bar)
    ├── Unified document list (flat, sortable)
    │   ├── Row: title, category tag, tax year (optional), version, uploadedAt, uploader
    │   ├── Actions: preview, new version, rename, e-sign, unlink
    │   └── Expand: version history (reuse listVersions)
    ├── Upload zone (reuse LibraryDocumentsPanel upload pipeline)
    ├── Contact-linked docs section (optional — docs linked via contactFileLinks borrowers)
    └── Portal uploads section (optional — read-only bridge from clientPortalUploads)
```

**Scroll contract:** Single scroll owner = `AppChrome` / `[data-pipeline-workspace-scroll]` — vault tab must not introduce nested full-page scrollports (`runtime-workspace-scroll-authority`).

**Data contract:** Reuse `listForProof({ kind: "pipeline", pipelineFileId })` as primary query; extend return type with `documentCategory`, `linkedAt`, optional `taxYear` when schema extended.

### 5.2 Recommended implementation slices

| Slice | Scope |
|-------|-------|
| **D.2** | Create `DocumentVaultTab.tsx`; add `documentsPanel` prop to `FileWorkspaceTabShell`; wire in `PipelineFileWorkspace` |
| **D.3** | Promote `LibraryDocumentsPanel` internals into vault layout (full width, no collapsible wrapper) OR embed panel with `defaultOpen={true}` and strip outer CollapsibleSection |
| **D.4** | Wire `documentCategory` on create/link; category filter chips + search on title |
| **D.5** | Optional `taxYear` / tags on link row; unified search index |
| **D.6** | Retire or collapse `quick-panel-documents` once Tab 4 is primary (circuit breaker pattern from Tab 2/3) |
| **D.7** | Deep-link anchor `pipeline-documents-vault` in `fileWorkspaceTabRouting.ts` |

### 5.3 What NOT to build

- New blob storage provider or duplicate upload helpers
- Attachment arrays inside `dealData` / `intakeSheets`
- Nested folder tree in Convex (use tags + filters instead)
- Replacing `taskAttachments` / portal uploads in first slice — integrate read-only or link-bridge later

### 5.4 Routing registry extension (planned)

```typescript
// lib/pipeline/fileWorkspaceTabRouting.ts (proposed)
export const DOCUMENTS_TAB_SECTION_IDS = {
  vault: "pipeline-documents-vault",
  portalUploads: "pipeline-documents-portal-uploads",
} as const;
```

---

## 6. Constraints & governance notes

| Topic | Constraint |
|-------|------------|
| **Tenant isolation** | All library rows carry `organizationId`; proofs enforce pipeline/contact/task org access |
| **Mobile QA** | Tab 4 vault must pass iPhone Safari + Android Chrome upload + preview flows |
| **Material / UX** | Use DLC tokens, `CollapsibleSection` or card surfaces per `material-design-rules.mdc` |
| **Performance** | `listForProof` capped at 200; consider virtualization if file doc counts grow |
| **E-sign** | Keep `DocumentSignatureBlock` co-located with vault rows |
| **Governance** | No shadow document system — extend `libraryDocuments` only (`no-shadow-systems-policy.md`) |

---

## 7. File reference index

| Purpose | Path |
|---------|------|
| Tab 4 placeholder | `lender-app/components/pipeline/FileWorkspaceTabShell.tsx` |
| Live upload UI | `lender-app/components/LibraryDocumentsPanel.tsx` |
| Upload client | `lender-app/lib/uploadToConvexStorage.ts` |
| Convex API | `lender-app/convex/libraryDocuments.ts` |
| Schema tables | `lender-app/convex/schema.ts` L2471–2514 |
| Category enum | `lender-app/convex/contactStickyData/validators.ts` L36–42 |
| Pipeline mount | `lender-app/components/PipelineFileWorkspace.tsx` L3063–3079 |
| Org hub | `lender-app/app/documents/page.tsx` |
| E-sign | `lender-app/convex/signatures.ts`, `DocumentSignatureBlock.tsx` |
| Portal uploads | `lender-app/convex/clientPortal.ts`, schema `clientPortalUploads` |
| Task attachments | schema `taskAttachments`, task drawer |
| Prior audit | `docs/phase37-1-data-bridge-audit.md` § Contact-specific documents |
| Macro Tab 4 status | `docs/phase37-macro-alignment-audit.md` §3.5 |

---

## 8. UX direction recommendation (for Phase 37.6 planning)

**Prefer: unified flat list + searchable metadata tags** (not rigid folders).

| Rationale | Detail |
|-----------|--------|
| **Existing model** | Library is already a flat, versioned list sorted by `linkedAt` / `updatedAt` |
| **Schema alignment** | `documentCategory` + future `taxYear`/tags fit filter chips, not directory trees |
| **Multi-entity links** | Same document on file + contact breaks folder semantics (“Borrower Docs” vs “Deal Docs”) |
| **Mobile** | Tag filters + search outperform deep folder navigation on phone |
| **Optional UX** | Preset filter groups (“Borrower”, “Property”, “Underwriting”) as **smart views**, not filesystem folders |

Example tag UX: **Tax Return · 2024** → `documentCategory: "tax_return"` + `taxYear: "2024"` on link or document metadata.

---

## 9. Sign-off checklist (D.1 audit complete)

- [x] Storage layer mapped (Convex `_storage` only in prod paths)
- [x] Metadata keys documented for library tables
- [x] Parallel attachment stores identified
- [x] Live UI mount points located (`LibraryDocumentsPanel`, not Tab 4)
- [x] Tab 4 placeholder state confirmed (`DocumentVaultTab.tsx` absent)
- [x] intakeSheets / dealData confirmed **no** attachment arrays
- [x] `documentCategory` schema vs wiring gap documented
- [x] Structural staging blueprint drafted
- [x] **No application code modified in this phase**
