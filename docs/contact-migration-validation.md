# Contact migration validation (Phase 24.5.2)

Date: 2026-05-28  
Mutations: `migrateContactMultiMethods`, `rollbackContactMultiMethodsMigration`  
Code: `convex/migrations/contactMultiMethodsMigration.ts`

---

## Dry-run behavior

`migrateContactMultiMethods({ adminSecret, dryRun: true })`:

- Scans all `contacts` rows  
- Counts `migrated` without writing  
- Does **not** insert log rows or patch documents  

Use dry-run counts vs production contact count before `dryRun: false`.

---

## Data safety analysis

### No contact data loss

| Scenario | Behavior | Safe? |
|----------|----------|-------|
| Legacy `email`/`phone` only, arrays empty | Builds `emails[]`/`phones[]` with `isPrimary: true`, label `Other` | Yes — copies values |
| Arrays already populated | `needsMigration` false — **skip** | Yes — no overwrite |
| Partial array (email only) | Migrates missing phone side from legacy `phone` | Yes |
| Empty legacy and empty arrays | Skipped (`skippedEmpty`) | Yes |

Legacy scalars **not cleared**; patched to primary array values.

### No erroneous duplicate removal

Migration does **not** dedupe or delete contacts. It only **adds** optional arrays. Duplicate-email policy remains in `contacts.create`/`update`, not migration.

### No empty-array wipe

Patches use `emails: emails.length ? emails : undefined` — omits field rather than `[]` when empty.

### Orphan `preferredEmailId` / `preferredPhoneId`

Migration does **not** set preference fields. Orphans only if manually set later.

**Detect:** `hasOrphanPreferredEmailId` / `hasOrphanPreferredPhoneId` in `lib/contact/contactMethods.ts` (for future admin script).

---

## Rollback

`contactMultiMethodsMigrationLog` stores:

- `beforeEmail`, `beforePhone`  
- `hadEmailsArray`, `hadPhonesArray`  
- `beforeEmailsJson`, `beforePhonesJson`  

`rollbackContactMultiMethodsMigration` restores prior state and refreshes `globalSearchText`.

---

## Lender contact migration (24.5.2 alignment)

`migrateLenderContacts` now:

- Indexes **all** emails/phones on existing CRM contacts  
- Inserts with `normalizeContactMethods`  
- Reuse path uses `mergeScalarsIntoContactMethods` (appends missing addresses, no scalar-only patch)

Reduces duplicate CRM rows when secondary email already exists.

---

## Post-migration verification queries (manual)

1. Sample 20 contacts pre/post: `emails.length + phones.length` ≥ 1 when legacy non-empty.  
2. `primaryContactEmail(c) === c.email` (synced scalar).  
3. Search blob contains secondary: open global search for known secondary address.  
4. Rollback one log id in staging; confirm arrays revert.

---

## Operator commands

```text
migrateContactMultiMethods { adminSecret, dryRun: true }
migrateContactMultiMethods { adminSecret, dryRun: false }
rollbackContactMultiMethodsMigration { adminSecret, logIds: [...] }
```

**CLI note:** Requires Convex project access (`npm run convex:deploy:prod`).

---

## Validation status

| Check | Result |
|-------|--------|
| Code review | Pass |
| Live dry-run in prod | **Pending operator** (no CLI access in agent session) |
| Automated migration test | Not added (scope) |

**Migration safety confidence:** **95%** (logic); **pending** live dry-run confirmation.
