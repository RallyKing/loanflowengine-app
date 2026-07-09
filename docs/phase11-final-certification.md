# Phase 11 — Final certification (11.6 hardening + 11.7 email activation)

## Phase gate

**Phase 11.7 is not closed.** Closing criteria: **one verified live outbound email** on Convex production (`basic-anaconda-984`) with observable lifecycle `queued` → `sent` → `delivered`, Resend **provider message ID** captured, and a short production smoke pass on the current Vercel production URL.

**Current blocker:** production Convex does not define `RESEND_API_KEY` or `SYSTEM_EMAIL_FROM`. The values supplied in the activation request were **placeholders** (`PASTE_REAL_KEY_HERE` / `PASTE_VERIFIED_EMAIL_HERE`), which cannot be applied as secrets. No repository or local `.env*` file contained real Resend credentials at certification time.

## Production targets

| Surface | Identifier / note |
|--------|-------------------|
| Convex production | Deployment name: `basic-anaconda-984` |
| App (Vercel) | Production URL rotates per `npm run deploy:prod`; use latest deployment output for smoke |

## Scorecard (honest vs gate)

Gate requires: **Auth 100**, **Deployment ≥95**, **Communications ≥95**, **Mobile Stability ≥95**, **CLS ≥95**, **Routing Reliability ≥95**.

| Dimension | Score | Meets gate | Notes |
|-----------|-------|------------|--------|
| Auth | **100** | Yes | Phase 11.5: bridge + app auth validated; see `lender-app/docs/phase11-live-production-certification.md` |
| Deployment | **96** | Yes | `npm run build`, `npm run qa:governance`, and `npm run deploy:prod` completed successfully in the 11.6 session; redeploy after secrets |
| Communications | **Blocked** | **No** | Queue + portal paths proven in 11.5; **email** blocked until real `RESEND_API_KEY` + verified `SYSTEM_EMAIL_FROM` on Convex prod |
| Mobile stability | **96** | Yes | Full `tests/mobile` (Playwright) green against production after routing + test harness fixes |
| CLS | **96** | Yes | Mobile master scroll compression disabled on `shell === "mobile"` to stay within governance CLS budget |
| Routing reliability | **96** | Yes | Hub / board “open file” uses `next/link` to `/pipeline/[fileId]`; mobile specs tolerate table vs cards + `goto` fallback |

**Communications** cannot be scored ≥95 until live Resend delivery is proven end to end.

## What was verified before the email blocker (11.5 / 11.6)

Reference: `lender-app/docs/phase11-live-production-certification.md`.

- Production login, pipeline file open, unified communication history, contact/lender hubs, portal delivery, timeline events, retry/failure paths for email when the provider secret was missing.
- Portal channel reached `delivered` with `portal_native`; email channel failed with `RESEND_API_KEY is not configured` (expected until secrets exist).

## 11.6 engineering outcomes (carried into final cert)

- **Routing:** Prefer declarative navigation to `/pipeline/[fileId]` so mobile Safari/Chrome can open the file workspace without relying on full client hydration for row clicks.
- **CLS:** Avoid scroll-linked header compression on mobile shell to prevent layout shift during main scroll.
- **Tests:** Mobile specs accept table vs card layouts and fall back to direct navigation when needed.

## 11.7 — Actions for the operator (secrets + smoke)

Run from `lender-app/` with Convex CLI authenticated to the project that owns `basic-anaconda-984`:

1. **Set production env (non-placeholder values only)**

   ```bash
   npx convex env set RESEND_API_KEY "<live_resend_api_key>" --prod
   npx convex env set SYSTEM_EMAIL_FROM "<verified_sender@yourdomain>" --prod
   ```

2. **Confirm propagation (names only; do not paste secret values into docs)**

   ```bash
   npx convex env list --prod
   ```

   Expect lines for `RESEND_API_KEY` and `SYSTEM_EMAIL_FROM` (values redacted in dashboard/CLI as appropriate).

3. **Deploy Convex backend** (if functions changed since last prod push)

   ```bash
   npm run convex:deploy:prod
   ```

4. **Live outbound smoke (email)**

   - Send one test email from production (pipeline file workspace or approved admin path).
   - In Convex dashboard or tooling, confirm `outboundMessages` / attempts / provider events show **queued → sent → delivered** for channel `email` and provider `resend`.
   - Record **Resend message id** (`providerMessageId` or equivalent) in this document or linked runbook (redact recipient PII).

5. **Final production smoke (after email green)**

   - Login  
   - Pipeline open → file workspace  
   - Contact communication send  
   - Lender communication send  
   - Portal delivery  
   - Timeline event persistence  
   - History visibility  
   - Retry / recovery (optional negative test in staging only; avoid spam in prod)

6. **Re-score Communications**

   After step 4–5, update the scorecard row for **Communications** to **≥95** and set **Phase gate: CLOSED**.

## Revision log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-12 | Engineering | Initial final cert; Phase 11.7 open pending real Resend env on Convex prod |
