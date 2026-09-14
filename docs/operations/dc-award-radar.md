# DC award radar — nationwide + contact enrichment

**Route:** `/operations/dc-award-radar`  
**Table:** Convex `dcAwardSignals` (platform catalog, not org-scoped)  
**CLI:** `npm run import:dc-award-radar` (from `lender-app/`)

GHL sync and outbound messages are **out of scope**. Convex does **not** scrape the web, poll, or schedule cron/scheduler pumps.

## Loop / usage fail-closed

| Rule | How this feature complies |
|------|---------------------------|
| No scheduler pumps | No `ctx.scheduler`, no self-reschedule, no cron. Hermes wake is a **client-called** one-shot action (`requestHermesScrape`) — never scheduled |
| No unbounded `.collect()` | `list` uses `.take(200)` + market/confidence indexes |
| No polling | One-shot mutations/actions only; UI uses a single `useQuery` |
| Bounded writes | Operator payloads capped at **100 rows** per mutation |
| Idempotency | `sourceKey` = normalized `sourceUrl` + project + stage |
| No in-app scrape | Web research stays in Hermes; Convex only POSTs the webhook or stores imported rows |

## Hermes scrape trigger (primary)

Ops refresh is a **Hermes scrape webhook**, not paste-CSV-only.

1. On `/operations/dc-award-radar`, enter the operator secret and click **Scrape with Hermes** (mode: nationwide / contacts / both).
2. Convex action `dcAwardRadarActions.requestHermesScrape` POSTs one-shot JSON to `GROKBOT_DC_RADAR_SCRAPE_WEBHOOK_URL` (set on the **Convex** dashboard). Optional auth: `GROKBOT_DC_RADAR_SCRAPE_WEBHOOK_AUTHORIZATION` or `GROKBOT_DC_RADAR_SCRAPE_WEBHOOK_KEY`.
3. Payload shape: `{ kind: "dc_award_radar_scrape", mode, requestedBy, requestedAt, notes?, source: "lfe_dc_award_radar_ops" }`.
4. GrokBot wakes Cursor Cloud Minion / Hermes. Hermes researches **public** sources outside this app. Minion (or ops) imports CSV afterward.
5. This app does **not** scrape, cron, poll, or schedule. If the webhook URL is unset, the UI errors clearly and **Manual CSV import** remains available.

## Hermes → CSV → import (nationwide)

Research and contact finding run **outside Convex** (Hermes / ops). The radar only stores the result.

1. Trigger Hermes via **Scrape with Hermes**, or have an operator research any **US market** — not limited to Ashburn VA, Dallas–Fort Worth TX, or Columbus OH.
2. Export a CSV or JSON array (headers below). Empty contact cells are allowed; do not invent contacts. Prefer owner/principal cell/direct phone and direct email (`phoneType` / `emailType`).
3. Import:
   - **CLI:** `npm run import:dc-award-radar -- ./path/to/nationwide.csv`
   - **UI:** **Manual CSV import (advanced)** on the radar page → paste payload → **Import nationwide refresh** (operator secret).
4. Re-runs upsert the same `sourceKey`. Contact-only updates never insert a new project.

Example payload: `docs/operations/dc-award-radar.nationwide.example.csv` (Phoenix AZ — proves markets are not locked to the original three).

Phase 2 bundled seed (29 rows) remains available with no file argument:

```bash
npm run import:dc-award-radar
```

## Contact refresh (no duplicate projects)

Contact enrichment is Hermes/ops-driven. Use a contact-only payload keyed by `source_key` **or** `source_url` + `project_or_campus` + `stage_signal`.

```bash
npm run import:dc-award-radar -- --contacts ./path/to/contacts.csv
```

Or paste the same payload into **Manual CSV import → Refresh contacts** on the radar page.

- Matching rows are patched (contact fields only).
- Missing keys are **skipped**.
- **No insert** — this path cannot create a second project.

A Phase 2 re-import does not wipe Hermes contacts: bundled seed rows omit contact fields, so existing values are left in place.

## CSV / JSON columns

| CSV | Stored field | Notes |
|-----|----------------|-------|
| `market` | `market` | Free-text; any US market |
| `project_or_campus` | `projectOrCampus` | Part of `sourceKey` |
| `stage_signal` | `stageSignal` | Part of `sourceKey` |
| `trade_focus` | `tradeFocus` | |
| `company` | `company` | |
| `role_if_known` | `roleIfKnown` | |
| `signal_date` | `signalDate` | |
| `source_url` | `sourceUrl` | Part of `sourceKey` (normalized) |
| `source_type` | `sourceType` | |
| `confidence` | `confidence` | `high` / `med` / `low` |
| `why_it_matters_for_DLC` | `whyItMattersForDlc` | |
| `notes` | `notes` | |
| `contact_name` | `contactName` | Owner / principal; optional; empty OK |
| `contact_title` | `contactTitle` | Optional |
| `email` | `email` | Prefer owner/principal **direct** email, not info@ |
| `email_type` | `emailType` | `direct` / `generic` / `unknown` |
| `phone` | `phone` | Prefer highly likely **cell / direct**, not switchboard |
| `phone_type` | `phoneType` | `cell` / `direct` / `main` / `unknown` |
| `linkedin_url` | `linkedinUrl` | Optional |
| `company_website` | `companyWebsite` | Optional |
| `contact_notes` | `contactNotes` | Why the number/email is believed cell/direct; source / confidence |
| `source_key` | lookup only | Contact-only rows |

JSON may use the camelCase field names. Payload may also be `{ "rows": [ ... ] }`.

## UI

- Market filter is **free-text** (exact match, indexed). Suggestions come from the current page — not a hard-coded three-market dropdown.
- **Owner / principal** column shows name, title, **Cell (likely)** / typed phone, and direct vs generic email. Expand for LinkedIn, website, and why-cell/direct notes.
- Operator secret matches `DATA_MIGRATION_ADMIN_SECRET` (fallback `ORG_INTEGRITY_ADMIN_SECRET`).
- **Scrape with Hermes** is the primary refresh control; paste/CLI import is the fallback when the webhook is unset or Hermes is unavailable.

## Convex deploy

Schema/function changes must be on the target deployment (`npx convex dev` locally, or production Convex deploy when shipping) **before** import. This PR does not merge or deploy to production unless explicitly asked.
