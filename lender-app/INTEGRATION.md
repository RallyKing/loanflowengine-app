# Deal workspace integration

This document describes how the **file deal workspace** (full borrower/deal UI) is wired into the Direct Lending Connection app: routes, environment, Convex, and the **New pipeline file** flow. It also records verification status.

## Base paths

Key URL helpers live in **`lib/intake/routes.ts`** and **`lib/pipeline/routes.ts`**:

| Constant / helper | Default / role |
|-------------------|----------------|
| `DEAL_LIBRARY_PATH` / `dealLibraryHref()` | `/pipeline/library` — searchable deal library + **New file** |
| `INTAKE_SHARE_BASE_PATH` / `shareTokenHref()` | `/share` — token-based public share pages |
| `pipelineDealEditorHref(fileId)` | Full deal editor on a pipeline file |
| `pipelineDealPrintHref(fileId)` | Print layout for a file-hosted deal |

Legacy bookmarks under **`/pipeline/intake/...`** are handled by **`app/pipeline/intake/[[...slug]]`** and redirect into the file workspace or deal library.

## Routes

| Path | Description |
|------|-------------|
| `/pipeline/library` | **Deal library** (`intakeSheets` summaries + **New file** → `createFileWithDeal`; unlinked rows → `createFileFromIntakeSheet` on open) |
| `/pipeline/intake/[[...slug]]` | **Legacy URL shim** — redirects to library, licenses, file deal editor, or file print |
| `/pipeline/file/[fileId]/deal` | **Deal editor** — reads/writes `pipeline.dealData` via `patchDeal` |
| `/pipeline/file/[fileId]/print` | **Print** for file-hosted deal data |
| `/pipeline/licenses` | State license reference |
| `/share/[token]` | **Public share** (view/edit; Convex allowlists) |

Server pages are thin: they require `NEXT_PUBLIC_CONVEX_URL` and often use **client wrappers** with `next/dynamic` and `ssr: false` for heavy editors. Examples:

- `app/pipeline/library/LibraryDashboardClient.tsx`
- `app/pipeline/file/[fileId]/deal/IntakeEditorFileClient.tsx`
- `app/share/[token]/ShareViewClient.tsx`

**Single Convex provider:** `app/ConvexClientProvider.tsx` is used once in `app/layout.tsx` — do not add a second `<ConvexProvider>` for intake.

## Environment variables

| Variable | Required for intake | Notes |
|----------|----------------------|--------|
| `NEXT_PUBLIC_CONVEX_URL` | Yes | Convex deployment WebSocket URL (e.g. from `npx convex dev`). Exposed to the browser by design. |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Optional | May be written by Convex CLI for some setups; not required for standard intake behavior. |
| `CONVEX_DEPLOYMENT` | Local dev / CLI | Set by `npx convex dev`; not a secret. |
| `CONVEX_DEPLOY_KEY` | CI / deploy | For deploying functions; keep out of client bundles. |

**Do not** put deploy keys or admin secrets in `NEXT_PUBLIC_*` variables.

## Convex setup

1. From `lender-app/`, run `npx convex dev` (or `npx convex deploy` for production) so functions sync and `convex/_generated/*` updates.
2. **Schema:** `convex/intakeSchemaPart.ts` defines `intakeSheets` and `shareLinks` tables; it is merged in `convex/schema.ts` — do not drop existing tables when changing schema.
3. **Functions:** `convex/intakeSheets.ts` (CRUD, `updatedAt` on non-empty patches), `convex/shareLinks.ts` and `convex/shareSections.ts` (token access, view vs edit, field allowlists). Share security is enforced **server-side** in mutations/queries.
4. **Pipeline + intake:** **`pipeline.dealData`** is the **canonical** intake-shaped JSON for the file workspace. **`intakeSheetId`** is **legacy** (optional): `initDealDataIfMissing` **hydrates** `dealData` from a linked row on first open so the file editor does not depend on reading `intakeSheets` alone. **`patchDeal`** and **`intakeSheets.patch`** (and **`shareLinks.patchByToken`**) merge into embedded `dealData` on linked files; **`patchDeal`** also mirrors to the linked intake when it exists (share-link compatibility). **`intakeSheets.listSummary`** includes **`linkedPipelineId`** so the library can deep-link to the file editor when a row is linked.

**Dashboard sort:** `intakeSheets.list` sorts by `updatedAt ?? _creationTime` descending so the most recently changed sheets float to the top.

## How new deal data is stored (single source of truth)

1. **Pipeline** → **New pipeline file** opens `components/NewPipelineFileDialog.tsx` and calls **`api.pipeline.createFileWithDeal`** — one `pipeline` row with embedded **`dealData`** (no `intakeSheets` row).
2. The dialog navigates to **`pipelineDealEditorHref(fileId)`** → `/pipeline/file/<id>/deal`.
3. The **Deal library** (`/pipeline/library`, `components/intake/Dashboard.tsx`) uses the same mutation for **+ New file** and opens the file deal editor.
4. The **file** editor uses **`api.pipeline.getDealForEditor`** + **`api.pipeline.patchDeal`** for autosave (always against embedded `dealData` once materialized). The **standalone intake** URL still uses **`api.intakeSheets.patch`**; if that row is linked to a file, the same patch is **merged into `pipeline.dealData`** so calculators and intake stay on one logical dataset.

Share links remain keyed by **`intakeSheets`** id until a future migration adds file-based tokens.

## Exports (editor)

| Format | Implementation |
|--------|------------------|
| CSV | `lib/intake/export.ts` → `exportCSV` |
| Excel | `lib/intake/export.ts` → `exportXLSX` (exceljs) |
| JSON backup | `lib/intake/export.ts` → `exportJSON` |
| Print / PDF | `/pipeline/file/[fileId]/print` + browser print (legacy `/pipeline/intake/.../print` redirects here) |
| FNMA / MISMO XML | `lib/intake/exportFnma.ts` → `exportFNMA34` |

**Derived values** in the UI use `lib/intake/derivations.ts` (`deriveIntake`); keep client calculations aligned with that module when changing fields.

## Share links (summary)

- Tokens are stored in Convex; **view vs edit** and **section** and **field** allowlists are applied in `shareLinks` / `shareSections` logic.
- `components/intake/ShareView.tsx` syncs live server updates but **skips** keys the user is actively editing (`pendingRef`) to avoid overwriting local edits.

---

## QA checklist

Use this when validating an integration or deploy.

| Check | Status |
|-------|--------|
| `npx tsc --noEmit` passes | Done |
| `npx next build` completes | Done |
| `npx next lint` — no **errors** (warnings in unrelated files may remain) | Done (warnings only) |
| **New pipeline file** / **Deal library → New file** → `createFileWithDeal` → file deal editor; refresh → data still there | Manual |
| Edit fields → refresh → persists | Manual |
| **Legacy file** with `intakeSheetId` only: open file deal editor → `dealData` materializes; refresh → still embedded; DTI/analysis match that data | Manual |
| Edit same deal from **standalone intake** (linked row) → reopen file editor → changes visible on file | Manual |
| Intake list sorts with **most recently updated** first | Code path verified (`intakeSheets.list`); visual manual |
| CSV / Excel / JSON / FNMA export from editor runs without error | Manual |
| Print route opens; browser print works | Manual |
| Create share link; **view** token cannot edit; **edit** token can; wrong token rejected | Manual |
| Share URL `/share/<token>` loads; field allowlist respected | Manual |
| `NEXT_PUBLIC_CONVEX_URL` unset → intake routes show setup message, no crash | Manual |

**Automated in this session:** TypeScript check, production build, ESLint as part of build (no errors). **Manual** rows should be run in a browser against your Convex deployment.

## Related files (quick index)

- Routes / URLs: `lib/intake/routes.ts`, `lib/pipeline/routes.ts` (file deal + print)
- Editor, dashboard, share, print: `components/intake/*`
- Exports & finance: `lib/intake/export.ts`, `lib/intake/finance.ts`, `lib/intake/exportFnma.ts`, `lib/intake/derivations.ts`
- Convex: `convex/intakeSchemaPart.ts`, `convex/intakeSheets.ts`, `convex/dealDataMerge.ts`, `convex/shareLinks.ts`, `convex/shareSections.ts`, `convex/schema.ts`
- New file + pipeline: `components/NewPipelineFileDialog.tsx`, `convex/pipeline.ts` (`createFileWithDeal`, `patchDeal`, `initDealDataIfMissing`, optional legacy `intakeSheetId`)
