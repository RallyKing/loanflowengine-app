# Direct Lending Connection — Web App

A Vercel-deployable Next.js app with a Convex database of lenders. The
home page is a **loan-scenario matcher** that ranks the
entire lender database against a deal the broker types in. There are four
ways to interact with the data:

1. **Scenario Search (home `/`)** — fill in funding amount, funding type, state,
   FICO, property type etc. and the system scores every lender against the
   scenario, showing match % and the reasons each one matched (or was
   filtered out). Hard filters: loan-amount out of range, state explicitly
   excluded, industry explicitly excluded, FICO below stated minimum.
2. **AI Discovery (`/discover`)** — describe a niche in plain English
   (e.g. "direct DSCR lenders nationwide", "SBA 7(a) preferred lenders in
   Texas") and the system uses OpenAI or Perplexity with live web search to
   find candidate direct lenders, dedupes against your database, and stages
   them in a review queue. Accept → they're added to the `lenders` table.
   Requires an AI provider key — see **AI Discovery setup** below.
3. **Browse (`/browse`)** — searchable, filterable table with a detail
   drawer for inline editing.
4. **Add Lender form (`/add`)** — single-lender entry with all 24 fields and
   automatic entity-type classification.
5. **Upload CSV (`/upload`)** — drag-and-drop CSV upload with preview + bulk
   upsert (idempotent, same dedupe rules as the Python pipeline).
6. **Cursor prompt** — from this Cursor workspace, just tell the agent to
   "add X" or "update Y" in plain English and it will call the Convex
   `upsert` mutation directly (see `AGENTS.md`).

## AI Discovery setup

The `/discover` page uses a live web-search LLM to surface new direct
lenders. You need at least one provider API key set as a Convex environment
variable. From the `lender-app/` directory:

```bash
# Pick one (OpenAI is preferred for structured output + web_search_preview)
npx convex env set OPENAI_API_KEY sk-your-openai-key

# ...or Perplexity (sonar-pro model)
npx convex env set PERPLEXITY_API_KEY pplx-your-perplexity-key
```

If both are set the agent prefers OpenAI and falls back to Perplexity on
error. If neither is set the `/discover` page shows the exact commands to
run. Each call hits `https://api.openai.com/v1/responses` or
`https://api.perplexity.ai/chat/completions` with a research prompt that
includes your existing lenders so the model avoids returning duplicates.

The Convex tables added for this feature:

- `lenderCandidates` — staged research output with `status` = pending /
  duplicate / accepted / dismissed. Edit fields inline before accepting.
- `discoveryRuns` — history of prior searches with counts.

## One-time setup

From this `lender-app/` directory:

```bash
npm install
npx convex dev
# Follow the prompts:
#   - Log in to Convex if needed
#   - Accept the suggested project name
#   - This generates convex/_generated/ AND writes NEXT_PUBLIC_CONVEX_URL into .env.local
# Leave `npx convex dev` running in one terminal.
```

In a second terminal, seed the database from the existing CSV:

```bash
npm run seed
```

Then start the Next.js dev server in a third terminal (or use `npm run dev`
which runs both in parallel):

```bash
npm run dev:next
# open http://localhost:3000
```

## Deploy to Vercel

1. Push `lender-app/` to a new GitHub repo.
2. In Convex dashboard, promote a **production** deployment and copy its URL.
3. On [vercel.com](https://vercel.com), import the repo.
4. In the Vercel project's **Settings → Environment Variables** add:
   - `NEXT_PUBLIC_CONVEX_URL` → your production Convex URL
5. In Vercel's Build step (or locally), run `npx convex deploy` to push the
   Convex functions to production. The simplest approach: set the
   **Build Command** to `npx convex deploy --cmd 'npm run build'` which
   deploys Convex functions and then builds Next.js. You will need to set
   `CONVEX_DEPLOY_KEY` (from Convex dashboard → deployment settings) as a
   Vercel environment variable.
6. Deploy. New lenders added from any path sync across users in real-time.

See [Convex's Vercel hosting guide](https://docs.convex.dev/production/hosting/vercel)
for screenshots.

## Adding lenders

### Through the UI
- Go to `/add` for one lender.
- Go to `/upload` for CSV bulk uploads. Download the template CSV from that
  page as a starting point.

### Through a Cursor prompt (the cool one)
Just tell the agent in this workspace something like:

> "Add a new lender: Acme Capital, contact Jane Doe, jane@acme.com,
>  (215) 555-0100, does SBA 7(a) and equipment loans up to $5M nationwide."

The agent will call `lenders:upsert` via the Convex MCP — no copy/paste
needed. See `AGENTS.md` for the exact protocol the agent follows.

### Through the CLI
```bash
npx tsx scripts/add-lender-cli.mts '{"company":"Acme","email":"jane@acme.com"}'
# or
npx convex run lenders:upsert '{"company":"Acme"}'
```

## Architecture

```
lender-app/
├─ app/
│  ├─ page.tsx            # Browse page (main)
│  ├─ add/page.tsx        # Single-entry form
│  ├─ upload/page.tsx     # CSV drag-and-drop
│  ├─ layout.tsx          # Shell + nav
│  └─ ConvexClientProvider.tsx
├─ components/
│  ├─ LenderTable.tsx     # Searchable/filterable grid
│  ├─ LenderDrawer.tsx    # Detail view + inline edit
│  ├─ AddLenderForm.tsx   # Single-lender form
│  ├─ CsvUploader.tsx     # Drag-and-drop + preview + bulk upload
│  └─ ui/                 # Button, Input, Badge primitives
├─ convex/
│  ├─ schema.ts           # lenders table + indexes
│  └─ lenders.ts          # list / get / stats / upsert / bulkUpsert / update / remove
├─ lib/
│  ├─ schema.ts           # Shared Lender type, field metadata
│  ├─ classify.ts         # Auto-classify entity type (same rules as Python)
│  ├─ csv.ts              # CSV parse + dedupe helpers
│  └─ cn.ts               # Tailwind class utility
├─ scripts/
│  ├─ seed.mts            # Seed from ../Comprehensive_Lender_List.csv
│  └─ add-lender-cli.mts  # JSON-payload CLI fallback
└─ AGENTS.md              # Instructions for the Cursor agent
```

## Pipeline / Tasks / Ledger

The app also ships a deal-management surface bolted onto the lender database:

- **`/pipeline`** — files in flight, with a table view *and* a kanban board
  (toggle top right). Status funnel: Confirm Interest → Portal/Collecting
  Docs → Initial Review → Accepted → Underwriting → Closing → Funding →
  Paid/Paying. Click a row to open the detail drawer (inline-everywhere
  edits, percentage-driven fees, term-options generator, lender attach,
  contacts, splits, related tasks). Shop the file with several lenders,
  then **Select** the winner with the star icon — the chosen lender gets
  a "Chosen" badge and is sorted to the top, and a **Clear others**
  button appears so the file can be pruned down to just the funder once
  the decision is made. **Clear all** is also one click away. Each file
  also has a
  **Scenario & lender match** section: save the loan scenario (funding type,
  property type, state, FICO, LTV, industry, etc.) on the file, then hit
  **Match top 50 lenders** to score the entire database against this deal
  and Attach winners straight into the file.
- **`/tasks`** — Eisenhower matrix with drag-and-drop between quadrants.
  View modes: **Matrix**, **Today** (with a Daily Plan pin section),
  **This week**, **Long-term**. Each task can hold subtasks, links, an
  inline checklist, related-task links, and a related pipeline file (open
  the pencil to dive in). **Snooze** any task you're waiting on (3rd
  parties, future-self) using the bell icon — it's hidden from default
  views until the wake date and won't count as overdue. Cycle the
  *Snoozed* filter pill to flip between Hide → Only → Including.
- **`/ledger`** — funding ledger. **Only shows files in Paid/Paying
  status** (in-flight deals live in the Pipeline tab and the
  Projections card below). Auto-populated when a pipeline file flips to
  Paid/Paying. Each row represents a funded loan and tracks one of
  three **funding modes**:
  - **Lump sum** — single payment up front (default for legacy rows).
  - **Scheduled** — paid in full on a future date (`scheduledDate` shown
    inline under the mode badge).
  - **Monthly** — ongoing receivable (`monthlyAmount × termMonths`).
  Expand any row to see the full payment history and **add new
  payments** as they come in (date, gross, net, method, payee, notes).
  Every headline figure is **NET to you** — the dollars that actually
  land in the bank — with a small "gross …" subtotal beside it for
  reconciliation. Each row shows **Expected (net) / Received (net) /
  Balance (net)** so you can see at a glance which deals are still owed
  money.

  A **Projections** card at the top of the page lets you opt
  not-yet-funded pipeline files into a what-if forecast. Click "Add
  file" to pin any in-flight deal; **Hide** removes a pin from the card
  totals without unpinning. The card shows **projected net (and gross)
  only for files included in the forecast** — not booked ledger
  revenue. Pinned files are auto-removed from the forecast the moment
  they flip to Paid/Paying (they then show up in the ledger proper, no
  double-counting).

  Filter by year, mode, method, or payee; **Copy table** copies a TSV
  blob (paste straight into Excel / Google Sheets); **Export CSV**
  writes a self-describing file with one funding row plus one row per
  payment so accountants can subtotal by file; **Print** opens
  `/print/ledger` for a clean PDF / hardcopy.
- **`/print/ledger`** — printable / Save-as-PDF view of the funding
  ledger. Mirrors the Paid/Paying filter and the active URL params
  (`?q=`, `?year=`, `?mode=`, `?method=`, `?payee=`). Lead figures are
  net (gross shown as small subtotals). When projections exist they
  print as a separate "Projections" subsection plus a projected-net
  callout (pinned in-flight only, not added to booked net). Renders an expanded per-funding block
  (with the full payment table) for small result sets and falls back to
  a compact summary table for larger ones.
- **`/print/terms/[id]`** — printable / Save-as-PDF term sheet for any
  pipeline file. Open it from the **Print / PDF** button beside the
  Copy/Email buttons in the Generate Terms section.

### Legacy status migration

The pipeline statuses were renamed to match the broker funnel above. Old
status strings (`lead`, `app`, `approved`, `funded`, `paid`, …) are still
read correctly via `lib/pipelineStatus.ts → LEGACY_STATUS_MAP`, but to
normalize storage on existing rows once, run:

```bash
npx convex run pipeline:migrateLegacyStatuses
```

This is idempotent — running it again on already-canonical rows is a
no-op. Do it once after pulling these changes.

## Dedupe rules (same as the Python pipeline)

A record is considered the same lender if it matches an existing record by:
1. Normalized company name **AND** email address, OR
2. Normalized company name **AND** contact name (when email is absent).

Bulk uploads and the Convex `upsert` mutation use these keys to decide between
insert and update.
