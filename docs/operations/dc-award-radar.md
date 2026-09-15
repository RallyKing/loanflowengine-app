# DC award radar — nationwide + contact enrichment

**Route:** `/operations/dc-award-radar`  
**Table:** Convex `dcAwardSignals` (platform catalog, not org-scoped)  
**CLI:** `npm run import:dc-award-radar` (from `lender-app/`)

HighLevel from this page is **tag/create only** (`dc-award-radar` + market/trade tags, source `dc-award-radar`). No SMS, email, sequences, workflows, campaigns, or Conversation AI. Convex does **not** scrape the web, poll, or schedule cron/scheduler pumps.

## Loop / usage fail-closed

| Rule | How this feature complies |
|------|---------------------------|
| No scheduler pumps | No `ctx.scheduler`, no self-reschedule, no cron. Hermes wake is a **client-called** one-shot action (`requestHermesScrape`) — never scheduled |
| No unbounded `.collect()` | `list` uses `.take(200)` + market/confidence/category indexes. `by_campusKey` exists for lookups; grouping is client-side on the capped page |
| No polling | One-shot mutations/actions only; UI uses a single `useQuery` |
| GHL no-outbound | `pushFilteredContactsToGhl` upserts contacts and **adds tags** only. Upsert JSON is **allowlist-serialized** (name/email/phone/company/website/source). Never writes SMS/email/sequence/workflow/campaign/conversation fields. Client sends a disclosed batch (max 100). Confirm says “first 100 of N” when truncated. Handoff CSV uses the same batch; **Download contacts CSV** is the full filtered set |
| Bounded writes | Operator payloads capped at **100 rows** per mutation |
| Idempotency | `sourceKey` = normalized `sourceUrl` + project + stage |
| No in-app scrape | Web research stays in Hermes (via BOSSMAN); Convex only POSTs the webhook or stores imported rows |

## Hermes scrape trigger (primary)

Ops refresh is a **BOSSMAN GrokBot → Hermes** webhook, not paste-CSV-only.

1. On `/operations/dc-award-radar`, while signed in, click **Scrape with Hermes** (mode: nationwide / contacts / both). **No operator / migration secret** is required for scrape — auth matches `dcAwardSignals.list` (session `memberUserKey` / JWT via `assertHermesScrapeAccessForAction`).
2. Convex action `dcAwardRadarActions.requestHermesScrape` POSTs **one-shot** JSON to `GROKBOT_DC_RADAR_SCRAPE_WEBHOOK_URL` (set on the **Convex** dashboard). Optional auth: `GROKBOT_DC_RADAR_SCRAPE_WEBHOOK_AUTHORIZATION` or `GROKBOT_DC_RADAR_SCRAPE_WEBHOOK_KEY`.
3. Target is **BOSSMAN’s** routine `dc-award-radar-hermes-scrape` (not Cursor Cloud Minion’s webhook).
4. Payload shape: `{ kind: "dc_award_radar_scrape", routine: "dc-award-radar-hermes-scrape", mode, requestedBy, requestedAt, notes?, source: "lfe_dc_award_radar_ops" }`.
5. Flow: LFE → GrokBot/BOSSMAN → Hermes public-web research → **BOSSMAN pings Minion** for CSV import. This app does **not** scrape, cron, poll, or schedule. The UI shows an **indeterminate** progress bar while the wake action runs, then a durable “scrape requested / Hermes via BOSSMAN / Minion import later” status — it does **not** poll Convex for Hermes % complete.
6. If the webhook URL is unset, the UI errors clearly and **Manual CSV import** remains available (operator secret still required for CSV upserts only).

Implemented as a Convex **action** (not mutation + scheduler) so the POST stays one-shot and fail-closed.

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

Campus stamp + known remaps (does not insert rows or wipe contacts):

```bash
npm run import:dc-award-radar -- --backfill-campus
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
| `campus_key` | `campusKey` | Optional stable campus/project-family id. Preserved on upsert when present. |
| `campus_name` | `campusName` | Optional group header. Preserved on upsert when present. |
| `is_primary_in_campus` | `isPrimaryInCampus` | Optional. `true`/`false`/`1`/`0`/`yes`/`no`/`primary`. Preferred contact row for the group. |
| `category` | `category` | Optional vertical: `hospital` / `dot_civil` / `industrial_warehouse` / `k12_higher_ed` / `data_center`. Alias: `vertical`. Labels with `/` (e.g. `K-12 / higher ed`) normalize on parse. Empty / omitted = leave existing (legacy DC rows stay blank). Do not wipe on Phase 2 re-import. |

JSON may use the camelCase field names. Payload may also be `{ "rows": [ ... ] }`.

Campus columns are **display-merge only**. Import never deletes child permit rows. Known families (also applied when the project name matches, even if campus columns are omitted):

| Family | `campusKey` | `campusName` | Notes |
|--------|-------------|--------------|-------|
| Equinix DC21-P2 + DC21-P3 | `equinix-dc21-22175-beaumeade` | `Equinix DC21 (22175 Beaumeade Cir)` | Same address. P3 is primary. |
| Equinix DC17 (was Beaumeade Parcel C2) | `equinix-dc17-44710-performance` | `Equinix DC17 (44710 Performance Cir)` | **Not DC21** — 44710 Performance Cir vs 22175 Beaumeade Cir. |
| NTT/VA6 HITT + Gensler | `ntt-va6-22280-randolph` | `NTT/VA6 (22280 Randolph Dr)` | HITT row is primary. |
| Vantage OH1 buildings 1–3 + campus | `vantage-oh1-new-albany` | `Vantage OH1 (New Albany)` | Campus row is primary. |

After Convex schema deploy, stamp existing rows without a full seed overwrite:

```bash
npm run import:dc-award-radar -- --backfill-campus
```

DC21-P2 `sourceUrl` must be the BLDC-2025-030931 MLQ filing — not P3’s BLDC-2025-046039 URL. Backfill remaps the legacy key so a re-import does not insert a duplicate.

## UI

- Default view is **Grouped** by `campusKey` (fallback: company). **Flat** is the raw permit list.
- A compact **lead-count strip** sits above the list (signals, campuses in grouped mode, unique contacts, phone / email / LinkedIn / cell, high-confidence signals). Counts are computed **client-side** from the current `list` page (market + confidence + category filters, `.take(200)`). No extra Convex query.
- **Unique contacts** = one key per owner/principal: `company + contactName` when both are non-empty; otherwise contactName, email, phone digits (7+), or `linkedinUrl`. Campus children that share a key count once; channel flags are OR'd. Rows with no identity are signals only.
- Group header shows campus/company and the **owner / principal once** (primary row’s contact, else first non-empty). Expand for child signals (stage, date, trade, source, confidence) plus full contact details.
- Grouped mode has **Collapse all** / **Expand all** for campus groups (default: all expanded). Collapsed headers still show the owner/principal; only child rows hide. Expansion is component state (optional `localStorage`). Flat mode is unchanged.
- Market filter is **free-text** (exact match, indexed). Suggestions come from the current page — not a hard-coded three-market dropdown.
- **Vertical / category** filter: All, Hospital, DOT / Civil, Industrial / Warehouse, K-12 / higher ed, Data center (incl. blank), Data center (explicit). Indexed via `by_category` / `by_market_and_category`. Legacy DC rows with `category` undefined still list under All and “Data center (incl. blank)”.
- **Owner / principal** stays visible in grouped mode (Joshua). Expand for LinkedIn, website, and why-cell/direct notes.
- **Contact filters** (Has phone / Has email / Has LinkedIn / Has cell / Missing phone / Missing email) apply to unique contacts in both Grouped and Flat views. The lead-count strip follows those filters. Collapse all / Expand all is unchanged.
- **Download contacts CSV** is client-side from the already-loaded, filtered unique contacts (company + contactName dedupe).
- **Send filtered contacts to GHL** confirms the disclosed batch + “no email/SMS”. One-shot cap is 100: confirm says **first 100 of N** when truncated, and the toast repeats that. Unset credentials → tag-only CSV for the **same batch** (filename/exportNote labeled). **Download contacts CSV** remains the full filtered unique set.
- Operator secret matches `DATA_MIGRATION_ADMIN_SECRET` (fallback `ORG_INTEGRITY_ADMIN_SECRET`).
- **Scrape with Hermes** is the primary refresh control; paste/CLI import is the fallback when the webhook is unset or Hermes is unavailable.

## HighLevel (tag-only)

Requires Convex env:

| Variable | Also accepted |
|----------|----------------|
| `HIGHLEVEL_API_KEY` | `GHL_API_KEY`, `HIGHLEVEL_PIT` |
| `HIGHLEVEL_LOCATION_ID` | `GHL_LOCATION_ID` |

Upsert uses LeadConnector `POST /contacts/upsert` (no `tags` field — that would overwrite). Tags are appended with `POST /contacts/{id}/tags`. Contacts without email **and** phone are skipped.

Before merge/prod: `/review-bugbot` + `/review` + `/review-agent` — fail closed on unresolved criticals. Minion reviews before ship.

## Convex deploy

Schema/function changes must be on the target deployment (`npx convex dev` locally, or production Convex deploy when shipping) **before** import. This PR does not merge or deploy to production unless explicitly asked.
