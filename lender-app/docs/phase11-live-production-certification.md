# Phase 11.5 — Auth + Live Production Validation

## Status
Phase 11.5 is **not fully certified yet**.

Authentication is restored end to end, production login works, Playwright auth is healthy again, and the full governance gate is green. The remaining blocker is **production outbound email delivery**: the live Convex deployment does not have `RESEND_API_KEY` configured, so email sends fail after the retry engine exhausts its attempts. Portal delivery, communication history, timeline events, contact/lender hubs, and lender attachment preview all validated successfully.

## Production Target
- Deployment under test: `https://loanflowengine-gwmtghyyj-joshua-4539s-projects.vercel.app`
- Convex production deployment: `basic-anaconda-984`

## Scorecard
- Auth health score: **100**
- Deployment alignment score: **82**
- Communications delivery score: **61**

## Auth / Env Audit
Validated and aligned for the auth scope requested in Phase 11.5:

- `.env.local`
- `.env.testing`
- Vercel production env
- Convex production env

Confirmed working for the Phase 11.5 auth set:

- `E2E_PASS_SUPER_ADMIN`
- `E2E_PASS_MANAGER`
- `E2E_PASS_PROCESSOR`
- `APP_AUTH_PRIMARY_EMAIL`
- `APP_AUTH_PRIMARY_PASSWORD`
- `APP_AUTH_E2E_USERS_ENABLED`
- `AUTH_BRIDGE_SECRET`
- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_DEPLOYMENT`

Auth-specific result:

- Zero `INVALID_CREDENTIALS`
- Zero auth lockouts during the validation run
- Sandbox users restored for:
  - `e2e-super-admin@dlc.test`
  - `e2e-manager@dlc.test`
  - `e2e-processor@dlc.test`

## Validation Commands
Completed successfully earlier in this Phase 11.5 session:

- `npm run live:auth-bridge`
- `npm run auth:validate`
- `npx playwright test tests/auth --workers=1`
- `npm run qa:governance`

Governance status at completion:

- Mobile governance suite: passed
- Desktop smoke suite: passed
- Remaining auth regressions: none

## Production Smoke Matrix
| Check | Result | Evidence |
|---|---|---|
| Production login works | PASS | Browser session authenticated successfully against the deployed app and reached protected routes |
| Open pipeline file | PASS | Opened file `jx7agqfet80ecdytph5azh1b2n86j2x7` in production workspace |
| Open communication history | PASS | Unified history rendered in the pipeline file workspace |
| Send outbound email test | **FAIL** | Outbound message `x17c7n1d2tw4xq519f6pvxpgnd86jgm2` failed with `RESEND_API_KEY is not configured.` |
| Verify queue retry + delivery state update | PASS (engine) / FAIL (email delivery) | `outboundProviderEvents` showed repeated `retry_scheduled` then terminal `failed`; queue plumbing is live, provider secret is missing |
| Send portal update | PASS | Outbound message `x1710p0myw9xknxsqzdtqgg5z586krsg` reached `delivered` with `providerKey: portal_native` |
| Verify timeline event creation | PASS | `collaborationActivityEvents` recorded `communication_delivered`, `communication_retry_scheduled`, and `communication_failed` |
| Open contact communication panel | PASS | Contact hub rendered with “Unified outbound history for this contact” |
| Open lender communication panel | PASS | Lender drawer rendered with communication hub and unified outbound history text |
| Open lender attachment preview | PASS | Playwright-driven smoke opened attachment dialog `Preview: (Fillable) Business Capital Application v03.2025 (5).pdf` |

## Key Production Evidence
### Outbound email failure
Latest production email smoke row:

- `outboundMessageId`: `x17c7n1d2tw4xq519f6pvxpgnd86jgm2`
- `channel`: `email`
- `providerKey`: `resend`
- `status`: `failed`
- `retryCount`: `5`
- `latestError`: `RESEND_API_KEY is not configured.`

Observed provider event sequence:

- `sending`
- `retry_scheduled`
- `sending`
- `retry_scheduled`
- `sending`
- `retry_scheduled`
- `sending`
- `retry_scheduled`
- `sending`
- `failed`

Observed collaboration events:

- `communication_retry_scheduled`
- `communication_failed`

### Portal delivery success
Latest production portal smoke row:

- `outboundMessageId`: `x1710p0myw9xknxsqzdtqgg5z586krsg`
- `channel`: `portal`
- `providerKey`: `portal_native`
- `status`: `delivered`
- `rootFileMessageId`: `s1762w2vtpz8jtbp249k314tth86jfb8`

Observed collaboration event:

- `communication_delivered`

Observed file message:

- `audience`: `portal`
- `isRoot`: `true`
- `body`: `Phase 11.5 live production smoke portal update. This should deliver immediately into the borrower thread and unified history.`

## Deployment Gaps Found
### Critical blocker
Convex production env currently contains only:

- `AUTH_BRIDGE_SECRET`
- `DATA_MIGRATION_ADMIN_SECRET`
- `ORG_INTEGRITY_ADMIN_SECRET`
- `TESTING_SEED_SECRET`

The live outbound email worker requires additional production env vars that are **missing**:

- `RESEND_API_KEY`
- `SYSTEM_EMAIL_FROM` or `NOTIFICATION_EMAIL_FROM` or `CLIENT_PORTAL_EMAIL_FROM`

Vercel production env is also sparse and does not currently include corresponding outbound email provider configuration. Even though the immediate runtime failure is happening inside Convex, the deployment alignment for live communications is incomplete across the stack.

## Browser Evidence
Captured during the live smoke:

- `c:\Users\joshu\AppData\Local\Temp\cursor\screenshots\phase115-pipeline-composer-before.png`
- `c:\Users\joshu\AppData\Local\Temp\cursor\screenshots\phase115-pipeline-email-sent.png`
- `c:\Users\joshu\AppData\Local\Temp\cursor\screenshots\phase115-pipeline-portal-delivered.png`
- `c:\Users\joshu\AppData\Local\Temp\cursor\screenshots\phase115-contact-communication-hub.png`

Additional attachment-preview evidence was captured in a successful Playwright smoke run that opened:

- `Preview: (Fillable) Business Capital Application v03.2025 (5).pdf`

## Runtime Notes
- The browser console showed repeated CSP-blocked attempts to post to `http://127.0.0.1:7412/ingest/...`. These did not block the Phase 11.5 flows, but they are noisy in production validation.
- The browser console also surfaced a `pipeline:patchFileDrawerLayout` server error during interactive browsing. This did not block auth restoration, governance, portal delivery, contact/lender hub rendering, or attachment preview, but it is worth a separate follow-up.

## Remaining Blockers
1. Add a valid `RESEND_API_KEY` to **Convex production**.
2. Add at least one sender env to **Convex production**:
   - `SYSTEM_EMAIL_FROM`, or
   - `NOTIFICATION_EMAIL_FROM`, or
   - `CLIENT_PORTAL_EMAIL_FROM`
3. Redeploy / re-run the production smoke after the provider envs are restored.
4. Re-validate the email path until the message moves to `sent` or `delivered` instead of `failed`.

## Certification Outcome
Phase 11.5 is **auth-certified** but **not communications-certified**.

The work cannot be marked complete against the requested target because the current live production stack still has:

- zero auth issues
- zero auth lockouts
- **non-zero production communication failures**

The blocking issue is operational configuration, not Playwright auth, not queue orchestration, and not the communication domain model.
