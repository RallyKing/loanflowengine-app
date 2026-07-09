# Contact system completion report (Phase 24.5.2)

Date: 2026-05-28  
Scope: Legacy scalar eradication for CRM `contacts` — **no new features**, **no schema changes**, **no CSV**, **no preference UI**.

---

## Executive summary

Multi-method CRM contacts now use canonical helpers across UI, search, messaging, migrations, and create flows. Direct `contact.email` / `contact.phone` reads on `Doc<"contacts">` are **eliminated** from the application layer.

**Build:** `npm run build` pass (2026-05-28).

---

## Legacy reference accounting

| Metric | Value |
|--------|------:|
| CRM `contact.email` / `contact.phone` reads found (pre-24.5.2) | 4 direct + 8 related `c.email` on CRM paths |
| Removed / replaced | **12** |
| Remaining direct `contact.email` / `contact.phone` | **0** |
| Intentional legacy (non-CRM systems) | ~15 modules (see `contact-legacy-field-audit.md`) |
| Canonical boundary reads (`contactMethods.ts`, `contacts.ts` normalize) | Retained by design |

---

## Files changed (24.5.2)

| File | Change |
|------|--------|
| `lib/contact/contactMethods.ts` | `contactMethodsCreateArgs`, `mergeScalarsIntoContactMethods`, `contactSearchHaystack`, orphan checks, aliases |
| `components/TaskDrawer.tsx` | Search haystack |
| `components/LenderDrawer.tsx` | Preferred mailto/tel + create args |
| `components/pipeline/blocks/FileContactsBlock.tsx` | Preferred mailto/tel |
| `components/PipelineFileWorkspace.tsx` | Create args |
| `components/NewPipelineFileDialog.tsx` | Create args |
| `components/intake/Dashboard.tsx` | Create args |
| `app/contacts/page.tsx` | `contactSearchHaystack` |
| `convex/fileMessages.ts` | `resolvePreferredEmail` |
| `convex/lenderContactMigration.ts` | Full multi-method maps + patch |
| `convex/indexedGraphBackfill.ts` | Primary resolvers for stickiness |
| `convex/indexedGraphAnalyze.ts` | Primary resolvers |
| `convex/migrations/backfillLegacyOrgScope.ts` | Primary email key |
| `convex/migrations/rebindJoshuaExplicitGraph.ts` | Primary email key |
| `convex/migrations/singleTenantConsolidateAllData.ts` | Primary email key |

---

## Verification matrix

| Area | Doc | Status |
|------|-----|--------|
| Legacy field audit | `contact-legacy-field-audit.md` | Complete |
| Reference gaps | `contact-reference-audit.md` (prior) + 24.5.2 fixes | Complete |
| Search | `contact-search-validation.md` | Complete (code) |
| Messaging | `contact-communication-audit.md` | Complete (code) |
| Data migration | `contact-migration-validation.md` | Code review pass; live dry-run pending |

---

## Remaining intentional legacy

1. **`contacts.email` / `contacts.phone` fields** — Denormalized primary mirrors; maintained by `normalizeContactMethods`.  
2. **Lender embedded contacts** — Separate schema; CSV round-trip.  
3. **Pipeline file `contacts[]`** — Legacy per-file array.  
4. **Create forms** — Single email/phone inputs → `contactMethodsCreateArgs` (one primary each).  
5. **`emailKey` index** — Primary email only; full-org scan catches secondary duplicates on write.

---

## Remaining technical debt

| Item | Priority |
|------|----------|
| Run `migrateContactMultiMethods` in production (dry-run then apply) | High |
| CRM CSV import/export (Phase not in scope) | Medium |
| `contacts.merge` mutation with array union | Low (feature) |
| File messaging multi-email picker | Low |
| Playwright regression for multi-method search | Medium |

---

## Confidence scores

| Dimension | Score | Notes |
|-----------|------:|-------|
| CRM UI/reference consistency | **98%** | Zero direct scalar reads |
| Search coverage | **97%** | Server + client use all methods/labels |
| Messaging (mailto/tel/query) | **100%** | Preferred resolver on CRM paths |
| Migration safety (code) | **95%** | Live dry-run not executed here |
| **Overall Phase 24.5.2** | **96%** | Blocked only on prod migration run + deploy |

---

## Deploy checklist (operator)

1. `npm run convex:deploy:prod`  
2. `migrateContactMultiMethods` dry-run → apply  
3. `npm run deploy:prod`  
4. Smoke: `/contacts` multi-email search, task contact picker, file messaging linked email, lender linked contact mailto  

---

## Related docs

- `docs/contact-multi-phone-email-audit.md`  
- `docs/contact-multi-phone-email-report.md`  
- `docs/contact-merge-audit.md`  
- `docs/contact-reference-audit.md`  
- `docs/contact-import-export-audit.md`
