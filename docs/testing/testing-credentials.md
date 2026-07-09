# Testing credentials (E2E / QA)

**Do not put real passwords in git.** Copy `lender-app/.env.testing.example` to `lender-app/.env.testing` (gitignored) and set secrets locally or in your CI secret store.

## Seeded personas

| Persona | Login username (workspace) | Convex `userKey` | Org | Password env var |
|--------|---------------------------|------------------|-----|------------------|
| Super Admin | `e2e-super-admin@dlc.test` | `e2e_super_admin_v1` | Primary | `E2E_PASS_SUPER_ADMIN` |
| Organization Owner | `e2e-org-owner@dlc.test` | `e2e_org_owner_v1` | Primary | `E2E_PASS_ORG_OWNER` |
| Team Member | `e2e-team-member@dlc.test` | `e2e_team_member_v1` | Primary | `E2E_PASS_TEAM_MEMBER` |
| Loan Officer | `e2e-loan-officer@dlc.test` | `e2e_loan_officer_v1` | Primary | `E2E_PASS_LOAN_OFFICER` |
| Processor | `e2e-processor@dlc.test` | `e2e_processor_v1` | Primary | `E2E_PASS_PROCESSOR` |
| Referral Partner | `e2e-referral-partner@dlc.test` | `e2e_referral_partner_v1` | Primary | `E2E_PASS_REFERRAL_PARTNER` |
| Lender Rep | `e2e-lender-rep@dlc.test` | `e2e_lender_rep_v1` | Primary | `E2E_PASS_LENDER_REP` |
| Read-only | `e2e-read-only@dlc.test` | `e2e_read_only_v1` | Primary | `E2E_PASS_READ_ONLY` |
| Demo Sandbox | `e2e-demo-sandbox@dlc.test` | `e2e_demo_sandbox_v1` | Secondary | `E2E_PASS_DEMO_SANDBOX` |
| Client (portal) | `e2e-client-portal@dlc.test` | `e2e_client_portal_v1` | — | `E2E_PASS_CLIENT_PORTAL` (6–128 chars; portal + seed) |

Primary org slug: `e2e-primary`. Secondary: `e2e-secondary`.

After `npm run seed:test-data`, set `E2E_ORG_PRIMARY_ID` and `E2E_ORG_SECONDARY_ID` from the script output.

## Enabling multi-user workspace login

In `lender-app/.env.testing` (and Next server env):

- `APP_AUTH_E2E_USERS_ENABLED=true`
- Mirror `TESTING_SEED_SECRET` in the Convex dashboard
- All `E2E_PASS_*` variables you need for tests

Production: keep **`APP_AUTH_E2E_ALLOW_IN_PRODUCTION` unset/false** unless you operate a dedicated smoke tenant.

## Primary (single-tenant) login

Unchanged: `APP_AUTH_USERNAME` / `APP_AUTH_PASSWORD` → issues the legacy fixed viewer session.
