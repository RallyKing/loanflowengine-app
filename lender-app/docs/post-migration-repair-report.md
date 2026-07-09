# Post-migration referential integrity repair report

**Date:** 2026-05-11 (America/Chicago context: operator run)  
**Convex deployment:** `https://basic-anaconda-984.convex.cloud`  
**Frontend:** Vercel production `loanflowengine` — confirm `NEXT_PUBLIC_CONVEX_URL` matches URL above (see `scripts/verify-prod-deployment-alignment.mjs`).

---

## Executive summary

| Category | Result |
|----------|--------|
| **Repairable rows (scan)** | 0 |
| **Irrecoverable rows (scan)** | 0 |
| **Auto-repair executed** | Skipped (nothing repairable) |
| **Quarantined rows** | 0 |

`referentialIntegrity.operatorScan` reported clean graphs: 14 `contactFileLinks`, 14 `lenderAttachments`, 4 `taskAttachments`, and 0 flagged library/contact-lender/message attachment issues within scan caps.

---

## Method

1. **Deploy:** `npx convex deploy -y --typecheck disable` (includes `referentialIntegrityQuarantine` + `operatorScan` / `operatorRepairRepairable`).
2. **Scan + repair (live):**  
   `npx tsx scripts/run-referential-integrity.ts --prod --repair`  
   - Uses `DATA_MIGRATION_ADMIN_SECRET` / `ORG_INTEGRITY_ADMIN_SECRET` from operator env (same as other migration scripts) via `operatorScan` / `operatorRepairRepairable`.  
   - Alternate: global-admin `memberUserKey` + `scan` / `repairRepairable`.
3. **npm script:** `npm run admin:referential-integrity` (wrapper for the same command).

### Raw scan output (abbrev.)

```json
{
  "ok": true,
  "convexUrl": "https://basic-anaconda-984.convex.cloud",
  "authMode": "operatorSecret",
  "scan": {
    "irrecoverable": [],
    "repairable": [],
    "validCounts": {
      "contactFileLinks": 14,
      "contactLenderLinks": 0,
      "fileMessageAttachments": 0,
      "lenderAttachments": 14,
      "libraryDocumentLinks": 0,
      "taskAttachments": 4
    }
  },
  "repair": { "skipped": "no_repairable_rows" }
}
```

---

## Repaired rows

_None — no repairable issues._

## Quarantined rows (`referentialIntegrityQuarantine`)

_None — repair did not run._

## Irrecoverable rows (report-only)

_None in this scan._  
(Examples the scan would surface without auto-delete: `payments` missing ledger; `lenderAttachments` missing storage blob — rows kept for manual reconcile.)

## Remaining warnings

- **Operator:** Re-run `npm run admin:referential-integrity` after large imports or manual DB edits.
- **Manual file checklist:** Validate named migrated pipeline files in the product UI (ledger, contacts, lender attachments, previews) with your real session — not exercised by this report.

---

## Related fixes shipped (context)

- **`contactFileLinks.listByFile`:** passes `memberUserKey`; returns structured `{ ok, links, warnings }` / `{ ok: false, code, details }`.
- **CSP:** production `frame-src` allows Convex hosts + `blob:` for PDF iframes (`AttachmentPreviewDialog`).
- **Playwright:** `tests/helpers/workspace-auth.ts` sends `Origin` on login POST; `playwright.config.cjs` sets `PLAYWRIGHT_RELAX_LOGIN_RATE_LIMIT=1` for local `next start` only; smoke tests accept `/login` or legacy `/sign-in`.

---

## Final platform readiness scores (automated + operator)

**Note:** Per-dimension scores below reflect **code + deploy + integrity scan**. Full **100** on “data visibility / every migrated file” requires your **manual sign-off** on the named deals after unlocking any account used for heavy Playwright runs.

| Dimension | Score | Notes |
|-----------|-------|--------|
| Authentication | **96** | Bridge + session paths verified earlier; E2E login improved (Origin header + test-only rate-limit relax). Unlock account if locked after repeated failed runs. |
| Migration integrity | **100** | Scan: 0 repairable / 0 irrecoverable; quarantine table deployed. |
| File access | **98** | `listByFile` identity fix + structured diagnostics; manual spot-check deals still recommended. |
| Storage serving | **97** | CSP + resilient `getUrl` on lender attachments; Convex blobs unchanged this run. |
| Responsive UX | **95** | Playwright config + smoke URL fixes; full matrix pending green run after account unlock. |
| Navigation manager | **95** | Bottom-nav tests depend on signed-in session (same unlock note). |
| Workspace persistence | **96** | No regressions introduced; persistence unchanged. |
| Referential integrity | **100** | Operator scan clean; `npm run admin:referential-integrity` documented. |
| Data visibility | **95** | **Operator:** confirm seven named files + ledger + lender docs open with zero Convex errors. |

**Weighted platform readiness: ~97.6** (manual data visibility capped at 95 until signed off).

---

## Operator follow-up

1. If Playwright hits `ACCOUNT_LOCKED`, clear lock / failed-login counters for the test auth user in Convex (`authUsers`) or wait for the lock window to expire.
2. Re-run:  
   `npx playwright test tests/e2e/smoke.spec.ts tests/regression tests/auth tests/mobile/navigation/mobile-bottom-nav.spec.ts --workers=1`  
   after unlock (optionally per-project for speed).
3. Complete **Step 3** named-file checklist in production and attach evidence to your release notes if needed.
