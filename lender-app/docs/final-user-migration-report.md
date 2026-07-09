# Final user migration report

**Target account:** joshua@directlendingconnection.com  
**Environment:** production / staging (circle one)  
**Operator:** ____________________  
**Completed (UTC):** ____________________

## Executive summary

- **Auth canonical id (`authUsers._id`):** ____________________
- **Orgs repaired / merged:** ____________________
- **Outstanding `otherAuthKeysStillReferenced`:** ____________________

## Records moved (from `mergeAuthUsersByEmail.recordsMovedByTable`)

_Paste non-zero entries from the mutation result JSON._

| Metric | Count |
| --- | ---: |
| | |

## Legacy vendor / Clerk cleanup

- **`dataMigration.run` / `migration:execute`:** yes / no — maps path: ____________________
- **`purgeLegacyExternalAuth`:** summary pasted: ____________________

## Onboarding / UX

- **Root cause if checklist misbehaved:** Session `userKey` vs browser `accountId` mismatch — fixed in `UserOnboardingChecklist` by using the hydrated viewer key for Convex mutations and waiting until the session viewer exists.
- **Global admin:** Does not see the getting-started modal (intentional).

## Auth fixes verified

- [ ] Login with lowercase email
- [ ] Login with mixed-case email / username
- [ ] Password verify / Argon2 path
- [ ] No false `INVALID_CREDENTIALS` after migration (spot-check)

## Verification checklist (app)

- [ ] Tasks visible
- [ ] Lenders visible
- [ ] Pipeline files visible
- [ ] Contacts + activity visible
- [ ] Dashboard / metrics
- [ ] No console errors on main paths

## System health

- **GET `/system/health`:** ____________________
- **`npm run go-live:status`:** GREEN / WARN — notes: ____________________

## Logs / evidence

_Attach paths to `migration-reports/*.json`, Vercel deployment URL, or screenshots._

**Final score (subjective):** ___ / 10
