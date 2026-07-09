# Phase 15 Step 15 — Global canonical sharing certification + repair

**Date:** 2026-05-27  
**Production:** https://dlcfunds.vercel.app  
**Convex:** https://basic-anaconda-984.convex.cloud  
**Evidence:** `migration-reports/phase15-step15-sharing-certification.json`

## Result

**PASS** — identity repair, bidirectional share matrix, upgrade/downgrade, revoke, ownership transfer, and notification label checks on production.

## Root cause (asymmetric share failures)

Production had **three distinct auth accounts** (not duplicates):

| Email | userKey |
|-------|---------|
| joshua@directlendingconnection.com | `ts719yfyv2b6020avvctpw0ns586exm6` |
| joshuaeballard@gmail.com | `ts7d3keadq48gay3pa8k6gdwx9878p33` |
| joshuaeballar1@gmail.com | `ts7ck8e4qmm6c22jvyrphws01587bm5c` |

`joshuaeballar1@gmail.com` is a **separate inbox** from `joshuaeballard@gmail.com` (typo digit). Failures were caused by:

1. **Silent duplicate auth pick** — `findAuthUserByCanonicalLogin` chose `newestAuthUser` when multiple rows matched the same canonical email.
2. **Incomplete lookup keys** — Gmail dot/plus variants were not expanded for index queries.
3. **Legacy E2E org members** — orphan `organizationMembers` rows (synthetic `e2e_*` userKeys) polluted integrity scans.
4. **Reverse-direction file share tests** — sharing requires **resource owner** as actor; B→A / C→A need owner-owned cert fixtures.

## Canonical resolver path (platform-wide)

```
UI / mutation targetLoginOrEmail
  → resolveShareTargetUserKey (shareTargetResolve.ts)
    → findAuthUserForShareResolution (canonicalIdentity.ts)
      → collectAuthUsersByCanonicalLogin (NFKC username + email + Gmail variants)
      → pickCanonicalOrgMember (org membership)
  → upsertResourceShare / removeResourceShare (resourceAccess.ts)
```

**Share mutations using this path:**

- `taskShares.upsertShare` / `removeShare`
- `pipelineFileShares.shareFile` / `updateSharePermission` / `revokeShare`
- Hierarchy inherited access via `resourceShares` on `client` / `project` (`resourceAccess.ts`)

**Display / notifications:**

- `resolveDisplayUsernameForUserKey` → `canonicalDisplayUsernameFromAuthUser`
- `notifyResourceShareEvent` → `dispatchUserNotification` (summary uses canonical username, not org name)

## Systemic repairs shipped

| Area | Change |
|------|--------|
| `lib/auth/gmailCanonicalEmail.ts` | Gmail dot-insensitive + plus-tag lookup keys |
| `convex/auth/canonicalIdentity.ts` | Expanded `canonicalAliasKeys`; `CanonicalAuthIdentityConflictError`; `findAuthUserForShareResolution` |
| `convex/shareTargetResolve.ts` | Unified email + opaque userKey resolution |
| `convex/pipelineFileShares.ts` | Pending/active path uses `findAuthUserForShareResolution` |
| `convex/auth/loginBridge.ts` | Login allows `allowDuplicatePickNewest` only after duplicate proof |
| `convex/auth/identityIntegrityRepair.ts` | Scan + auto-repair (normalize fields, merge duplicate emails, dedupe members, delete orphans) |
| `convex/teamManagement.ts` | New members with email usernames persist `email` + normalized username |
| `convex/operator/phase15Step15SharingCertification.ts` | Production proof matrix + cert resource bootstrap |

## Production proof matrix (executed)

Accounts: joshua@directlendingconnection.com ↔ joshuaeballard@gmail.com ↔ joshuaeballar1@gmail.com

| Check | Result |
|-------|--------|
| A→B task + file share | PASS |
| B→A task + file share | PASS |
| A→C task + file share | PASS |
| C→A task + file share | PASS |
| Permission upgrade / downgrade | PASS |
| Revoke | PASS |
| Task ownership transfer | PASS |
| Notification actor label (canonical email, no org label) | PASS |
| Email variant normalization (case, whitespace) | PASS |
| Identity integrity after repair | 0 issues |

Re-run: `npm run cert:phase15-15-sharing` (requires `DATA_MIGRATION_ADMIN_SECRET` in `.env.local`).

## Validation

| Command | Result |
|---------|--------|
| `npm run convex:codegen` | PASS |
| `npm run build` | PASS |
| `npm run convex:deploy:prod` | PASS |
| `npm run deploy:prod` | PASS (session) |
| `npm run auth:validate` | PASS (session) |
| `npm run cert:phase15-15-sharing` | PASS |

## Future account hardening

- `assertCanonicalAuthAvailable` checks all `canonicalAliasKeys` (including Gmail variants).
- Signup + team invite write normalized `email`, `normalizedUsername`, `usernameNormalized`.
- Duplicate canonical emails throw `CANONICAL_AUTH_IDENTITY_CONFLICT` on share until `repairAuthIdentityPlatform` merges them.

## Realtime propagation

Convex mutations commit atomically; `resourceShares` rows are visible on the next query/subscription tick (no stale shadow ACL tables for tasks/files).

## STOP

**Do not begin Phase 16 Events** until operator approves this certification on production UI (share dialog both directions for all three accounts).
