/**
 * Canonical ownership: **Pipeline** (`pipeline` Convex table) vs **File workspace**
 * (intake-shaped JSON on `pipeline.dealData` and/or a linked `intakeSheets` row).
 *
 * - **Single deal payload shape**: `Doc<"intakeSheets">` — see `convex/intakeSchemaPart.ts`.
 *   `pipeline.dealData` is intended to hold the same logical document (minus Convex
 *   table metadata). Validators for patches are centralized in `intakePatchableFields`
 *   so `patchDeal` and `intakeSheets.patch` cannot drift from that shape.
 * - **Layouts** (`dealWorkspaceLayout`, `dealAnalysisLayout`) remain `v.any()` until
 *   a versioned object validator is promoted from `lib/file/dealWorkspaceLayout.ts`.
 *
 * ## Owned only on the `pipeline` row (not duplicated inside deal JSON)
 *
 * - Workflow CRM: `status`, `assigneeId`, `sharedWithIds`, `archivedAt`
 * - Lender shopping: `lenders`, `selectedLenderId`, `selectedLenderSentAt` (manual
 *   “sent to lender” date — editable from the pipeline table, not tied to
 *   `selectLender` timestamps)
 * - File economics shell: `rate`, `term`, fee pct/outside + derived dollar totals,
 *   `netToUser`, `brokerGross`, `splits`, `projectIntoLedger`
 * - **Stored primary funding column**: `fundingAmount` — kept in sync from deal-derived
 *   amount when the deal supplies one (`derivePrimaryFundingAmountFromDealPayload`);
 *   scenario match criteria intentionally omit funding amount (see schema JSDoc).
 * - **Target close (file)**: `targetCloseDate` (Unix ms). Coversheet hint `cover.estCOE`
 *   is a separate string on the deal.
 * - **Generate terms**: `termOptions`
 * - **Scenario match mirror / scratch**: `scenario`, `scenarioCriteria` (free-form +
 *   structured filters for lender search)
 * - **Contacts** on the file row
 *
 * ## Legacy / transitional fields on `pipeline` (prefer deal when deal exists)
 *
 * - `propertyAddress` — one-line address before deal documents; preview prefers
 *   structured deal addresses first. New edits for deal-backed files go through
 *   `patchDeal`, not this field.
 * - `loNmls`, `brokerNmls` — used when there is **no** linked intake; otherwise live
 *   on `cover.loNmls` / `cover.brokerNmls`.
 *
 * ## Single source of truth rule
 *
 * When `dealData` is present, **borrower / property / cover / loans / business /
 * commercial / hard-money / fees / guarantors / scenario worksheet**, plus file
 * identifiers such as **`fundingType`** (pipeline “Funding type” column), are read and
 * written through **`patchDeal`** (and `intakeSheets.patch` for standalone sheets),
 * using **`intakePatchableFields`** validators aligned with `intakeSheets`.
 *
 * The authoritative list of columns on `pipeline` lives in **`convex/schema.ts`**
 * (`defineTable` for `pipeline`) — this module describes ownership only.
 *
 * ## Pipeline table preview (list / board / exports)
 *
 * Column semantics and Convex field mapping: **`lib/pipeline/pipelineTableFieldSemantics.ts`**
 * and **`buildTablePreviewRow`** in `convex/pipeline.ts`. In short: **Source** and
 * **funding program/type** (except purchase/refi) come from the deal payload;
 * **funding amount** prefers a derived deal amount then `pipeline.fundingAmount`;
 * **subject address** prefers structured deal addresses; **selected lender** and
 * **lender sent** are `pipeline` fields.
 */
