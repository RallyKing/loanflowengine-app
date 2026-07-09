# Contact legacy field audit (Phase 24.5.2)

Date: 2026-05-28  
Search scope: `lender-app/` — patterns `contact.email`, `contact.phone`, `c.email`, `c.phone`, `primaryEmail`, `primaryPhone` (CRM vs non-CRM).

## Classification key

| Class | Meaning |
|-------|---------|
| **SAFE** | Canonical boundary (`contactMethods.ts`, `contacts.ts` normalization) or non-CRM entity |
| **NEEDS MIGRATION** | CRM `Doc<"contacts">` read/write without helpers — **fixed in 24.5.2** |
| **LEGACY ONLY** | Different schema (lender embedded, pipeline file contacts, discovery, auth user) — intentional |
| **DEAD CODE** | Unused / commented — none found |

---

## CRM `contacts` — direct `contact.email` / `contact.phone` reads

| Location | Class (before) | Class (after 24.5.2) |
|----------|----------------|----------------------|
| `components/LenderDrawer.tsx` linked CRM list | NEEDS MIGRATION | **Fixed** → `resolvePreferredEmail/Phone` |
| `components/TaskDrawer.tsx` filter | NEEDS MIGRATION | **Fixed** → `contactSearchHaystack` |
| `convex/fileMessages.ts` | NEEDS MIGRATION | **Fixed** → `resolvePreferredEmail` |
| `convex/lenderContactMigration.ts` maps/patch | NEEDS MIGRATION | **Fixed** → `allContactEmailStrings`, `mergeScalarsIntoContactMethods` |
| `convex/indexedGraphBackfill.ts` referral stickiness | NEEDS MIGRATION | **Fixed** → `primaryContactEmail/Phone` |
| `convex/indexedGraphAnalyze.ts` | NEEDS MIGRATION | **Fixed** → `primaryContactEmail/Phone` |
| `convex/migrations/backfillLegacyOrgScope.ts` | NEEDS MIGRATION | **Fixed** → `primaryContactEmail` |
| `convex/migrations/rebindJoshuaExplicitGraph.ts` | NEEDS MIGRATION | **Fixed** → `primaryContactEmail` |
| `convex/migrations/singleTenantConsolidateAllData.ts` | NEEDS MIGRATION | **Fixed** → `primaryContactEmail` |

**Post-pass grep:** zero `contact.email` / `contact.phone` in repo.

---

## CRM create paths (scalar args → arrays)

| Location | Class | Resolution |
|----------|-------|------------|
| `PipelineFileWorkspace.tsx` | NEEDS MIGRATION | **Fixed** → `contactMethodsCreateArgs` |
| `NewPipelineFileDialog.tsx` | NEEDS MIGRATION | **Fixed** |
| `intake/Dashboard.tsx` | NEEDS MIGRATION | **Fixed** |
| `LenderDrawer.tsx` new contact | NEEDS MIGRATION | **Fixed** |

Form fields still collect single strings; mutation receives `emails[]` / `phones[]` (primary entry).

---

## Intentional legacy (LEGACY ONLY)

| Location | Entity | Notes |
|----------|--------|-------|
| `lib/contact/contactMethods.ts` | CRM | Fallback when `emails[]`/`phones[]` empty — **canonical resolver layer** |
| `convex/contacts.ts` | CRM | `resolveMethodsFromArgs` reads optional scalar **mutation args** then normalizes |
| `convex/migrations/contactMultiMethodsMigration.ts` | CRM | Reads `row.email`/`row.phone` to **build** arrays (migration source) |
| `convex/contactMigration.ts` | Pipeline `contacts[]` | Embedded file contacts, not CRM table |
| `convex/pipeline.ts` | Pipeline embedded | Same |
| `convex/pipelineHierarchyMutations.ts` | Pipeline embedded | Same |
| `convex/lenders.ts` | `lenders.contacts[]` | Lender merge/dedupe |
| `lib/csv.ts` | Lender CSV | Single email/phone per embedded row |
| `convex/lenderContactExtract.ts` | Lender extract | Source rows |
| `convex/lenderSearchText.ts` | Lender | Search blob |
| `convex/discovery.ts` | Discovery candidates | Not CRM |
| `convex/enrich.ts` | Enrichment payload | Not CRM |
| `components/LenderDrawer.tsx` ~237 | Lender `Contact` type | Editing lender embedded list |
| `components/intake/*` | Borrower/cover fields | Deal intake, not CRM |
| Auth/operator `u.email` | Auth users | Unrelated |

---

## `c.email` / `c.phone` on CRM rows (remaining)

| Location | Class |
|----------|-------|
| `app/contacts/page.tsx` `c.emails?.length` | **SAFE** — array metadata for list badge |
| `lib/contact/contactMethods.ts` label map | **SAFE** |
| `convex/migrations/rebindJoshuaExplicitGraph.ts` `c.emailKey` | **SAFE** — index field name, not scalar read |

---

## `primaryEmail` / `primaryPhone` (non-CRM)

| Location | Class |
|----------|-------|
| `intakeSchemaPart.ts` `primaryPhone` | LEGACY ONLY — cover sheet |
| `sessionUiClient.tsx` Clerk | LEGACY ONLY |
| Operator certification scripts | LEGACY ONLY — auth user |

---

## Helpers added (24.5.2)

- `contactMethodsCreateArgs` — scalar form → arrays for mutations  
- `mergeScalarsIntoContactMethods` — migration reuse paths  
- `contactSearchHaystack` — client filter + labels  
- `hasOrphanPreferredEmailId` / `hasOrphanPreferredPhoneId` — validation  
- `resolvePrimaryEmail` / `resolvePrimaryPhone` — aliases (audit naming)

---

## Summary counts

| Metric | Count |
|--------|------:|
| NEEDS MIGRATION (CRM) found | 12 surfaces |
| Fixed in 24.5.2 | 12 |
| Remaining CRM `contact.email`/`contact.phone` | **0** |
| Intentional LEGACY ONLY (non-CRM) | ~15 modules |
| SAFE canonical boundary | `contactMethods.ts`, `contacts.ts`, `globalSearchText.ts` |
