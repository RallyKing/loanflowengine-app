# CRM Contacts — multi email / phone implementation report (Phase 7)

Date: 2026-05-28

## Summary

Standalone CRM contacts now support unlimited labeled emails and phone numbers, with a single primary per type. Legacy `email` / `phone` fields remain and stay synced with primary entries for backward compatibility.

## Delivered artifacts

| Phase | Deliverable |
|-------|-------------|
| 1 | `docs/contact-multi-phone-email-audit.md` |
| 2 | Schema + `convex/contactMethodsShared.ts` + `lib/contact/contactMethods.ts` |
| 3 | `convex/migrations/contactMultiMethodsMigration.ts` (+ rollback) |
| 4 | `components/contacts/ContactMethodsEditor.tsx` |
| 5 | `components/contacts/ContactMethodsDetail.tsx` + `/contacts` detail strip |
| 6 | Client + `globalSearchText` + list search |
| 7 | This report |

## Validation

| Check | Result |
|-------|--------|
| TypeScript build (`npm run build`) | **Pass** (2026-05-28) |
| Governance QA (`npm run qa:governance`) | **Partial** — build + mobile (17 pass, 35 skip); desktop chromium failed on unrelated `pipeline table exposes expected column headers` (hub heading timeout). Re-run before prod deploy. |
| Convex deploy (`npm run convex:deploy:prod`) | **Blocked** — CLI: no access to selected project. Run `npx convex dev` / link project, then deploy schema + `contactMultiMethodsMigration`. |
| Production deploy (`npm run deploy:prod`) | **Deferred** per user rule until QA green + Convex deployed |

## Operator migration

```text
# Dry run (Convex dashboard or CLI)
migrateContactMultiMethods { adminSecret, dryRun: true }

# Apply
migrateContactMultiMethods { adminSecret, dryRun: false }

# Rollback (optional, by log ids)
rollbackContactMultiMethodsMigration { adminSecret, logIds: [...] }
```

## Manual smoke (recommended)

1. `/contacts` — create contact with Work + Personal emails; set primary.
2. Save, reload — detail shows primary first with ★.
3. Search list by secondary email and phone digits.
4. Global search (header) — query non-primary email.
5. Link contact on pipeline file — primary mailto/tel still work.

## Known limitations

- Pipeline “create contact” quick forms may still pass scalar `email`/`phone` only; backend normalizes to a single primary entry.
- Embedded lender contacts are unchanged.
- Display in list shows primary + “+N emails” when multiple stored arrays exist.

## Post-deploy

Run production migration dry-run, then apply. Re-index is automatic per-row via `refreshContactGlobalSearchText`.
