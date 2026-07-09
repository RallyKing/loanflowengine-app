# Phase 15 Step 11 — Contextual Inline Creation, Security Sweep, Deal Library Deprecation

**Status:** Complete — awaiting review (STOP before Phase 16).

**Production:** https://dlcfunds.vercel.app  
**Convex:** https://basic-anaconda-984.convex.cloud  
**Automated ACL proof:** `pass: true` (see `migration-reports/phase15-step11-security-and-creation-polish.json`)

## Goals delivered

1. **Inline hub creation** — `+ Add project` on client rows and `+ Add file` on project rows open a pre-filled create dialog, call `createProjectUnderClient` / `createLoanFileUnderProject`, stay on the hub, and expand the parent client/project so Convex `listTablePreview` updates appear immediately.
2. **Backend file isolation** — Downstream queries for ledger, payments, file shared state (notes/financial blocks), activity, and file-scoped tasks enforce `assertCanAccessFile` / `assertCanReadPipelineRow` at the API boundary.
3. **Deal library removed** — Nav catalog, pipeline header links, and `/pipeline/library` redirect to `/pipeline`.

## Security modules swept

| Module | Queries / mutations hardened |
|--------|------------------------------|
| `convex/resourceAccess.ts` | Added `assertCanAccessFile`, `pipelineFileReadable` |
| `convex/ledger.ts` | `list`, `byFileId`, `setPayment`, `createFor`, `remove` |
| `convex/payments.ts` | `listForLedger`, `listForFile`, `create`, `update`, `remove` |
| `convex/fileSharedState.ts` | `getResolvedForBlock`, `listOverrides`, `getNormalized` |
| `convex/activityFeed.ts` | `list` when `fileIdFilter` set |
| `convex/pipelineFileActivity.ts` | `listForFile`, `undoMostRecentForFile` |
| `convex/tasks.ts` | `byRelatedFile` (+ import fix) |
| Already secured (verified) | `pipeline.getById`, `pipelineFileActivity.listForFile` pattern, `revenue.forFile`, `fileMessages`, `communications` |

## Inline creation proof (Joshua primary — manual)

1. Pipeline hub → client row → **Add project** → submit → new project + loan appear under client without full-page navigation.
2. Expand project → **Add file** → submit → new loan row appears; open file workspace to confirm load.
3. Confirm **Deal library** is absent from sidebar, mobile “More”, and ⌘K nav (catalog entry removed).

## Secondary ACL proof (automated)

Run from `lender-app/`:

```bash
npx tsx scripts/run-phase15-step11-security-and-creation.ts
```

Uses `operator/securitySweepProofStep15_11:runSecuritySweepProofStep15_11` — eballard `memberUserKey` against a joshua-only `fileId` must throw *"You do not have access to this pipeline file."* for ledger, file shared state, activity, tasks, and payments.

## Deal library files touched

- Removed: `PIPELINE_SUB_ITEMS` entry `deal_library` in `lib/navigation/navigationCatalog.ts`
- Removed: Deal library links in `app/pipeline/PipelinePageClient.tsx`
- Redirect: `app/pipeline/library/page.tsx` → `/pipeline`
- Deprecated path constant: `lib/intake/routes.ts` (`DEAL_LIBRARY_PATH` → `/pipeline`)
- Updated copy: `UserOnboardingChecklist.tsx`, `lib/productTour.ts`, `lib/helpCenterContent.ts`, `tests/e2e/smoke.spec.ts`, `LegacyIntakeRedirectClient.tsx`
- Left in repo (unused surface): `app/pipeline/library/LibraryDashboardClient.tsx`, `components/intake/Dashboard.tsx` — no nav route; safe to delete in a later cleanup pass if desired.

## Validation run

From `lender-app/`:

- `npm run convex:codegen`
- `npm run build`
- `npm run convex:deploy:prod`
- `npm run deploy:prod`
- `npm run auth:validate`

Report: `migration-reports/phase15-step11-security-and-creation-polish.json`

---

## Step 12.1 hotfix — Unhide inline creation buttons (2026-05-26)

### Root cause
`ClientSection` accepted `onAddLoanFile` but **did not forward it** to nested `ProjectSection`. The Add file button condition `canInlineCreate && onAddLoanFile` was always false on project rows under an expanded client — so the control never rendered in Client Focus (the default hub hierarchy).

### Fix
- **`PipelineHubHierarchyView.tsx`**: Pass `onAddLoanFile` from `ClientSection` → `ProjectSection`.
- **`HubInlineCreateButton`**: High-contrast, always-visible control (no hover-only reveal); `flex-wrap` on row headers; `stopPropagation` on click; 36px touch height.
- Legacy synthetic keys (`legacy-client:*`, `legacy-project:*`) still hide create (mutations require real Convex ids).

### Re-verify on prod
1. Pipeline → table/hierarchy view → **Client Focus**.
2. **Add project** visible on each client row.
3. Expand client → **Add file** visible on each project row (not only in Project Focus mode).
4. Click **Add file** → dialog pre-fills project → create persists under that project.
