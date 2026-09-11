# Client-upload quiet-window review (Phase 1–3)

## What this is

After a client uploads into Document Vault, the broker still gets the **immediate**
per-upload Alert (and phone Web Push when allowlisted). **Additionally**, when
auto-review is enabled, the system waits **15 minutes after the last upload** on
that pipeline file, then builds a review package for broker approval.

**Outbound client email / SMS / task reassignment is Phase 4** — this phase only
drafts those actions and asks the broker to approve. Approve does **not** send.

## Two notification layers

| Layer | When | What | Gated by flags? |
|-------|------|------|-----------------|
| **1. Immediate** | Every `recordClientVaultUpload` | In-app Alert + Web Push (`document_activity`) | **No** — always on for eyes-on-each-upload |
| **2. Review ready** | 15m after *last* upload (generation debounce) | New Alert: “Client upload review ready” + drafts | **Yes** — org master **and** per-file |

Debounce behavior: two uploads 1 minute apart → only one review job, timed from the
**second** upload. Older scheduled jobs no-op when `generation` mismatches.

## Manual vs automatic (coexistence)

**Auto 15m review is additive. It does not replace the manual Document Task
Request + Templates flow.**

| Path | Owner | What it does | What it must not do |
|------|--------|--------------|---------------------|
| **Manual (unchanged)** | Broker | Create/apply `documentTaskTemplates` / stacks; inject into a file as live `documentVaultFileTasks`; set portal-visible / required; use existing **notifyClient** and portal invite flows for initial requests | N/A — remains the source of truth for *what* was requested |
| **Automatic (this PR)** | Quiet window after client uploads | Read the **same** live vault tasks on the pipeline; gap report; draft email/SMS (and optional reassign **draft**); notify Joshua/broker that a package awaits approval | Replace templates; invent a parallel checklist; delete/alter template definitions; send client outbound; auto-reassign live tasks |

### Same requested-task model

Gap analysis uses **`documentVaultFileTasks`** on the pipeline file — the same rows
brokers see after manual create or template injection:

- `title`
- `isRequired`
- `status` (`incomplete` | `pending_review` | `complete`)
- `isPortalVisible`
- `taskType` (document-upload requests: unset or `document_upload`)
- plus linked uploads via `libraryDocumentLinks.fileTaskId`

Template-injected tasks are **not** a second schema: once applied, they are ordinary
vault file tasks. Auto review never opens `documentTaskTemplates` / stacks for
write (or delete).

### Drafts

- Email/SMS bodies list **those existing task titles** for missing / unclear items.
- Optional `draftTaskReassignment` is suggested **only when there are incomplete
  vault tasks still missing uploads** — never for complete-only packages, and
  never applied in Phase 1–3 (status/approve only).
- Approving a package does **not** mutate templates or vault task definitions.

## Feature flags

Both default **ON** when unset (dev-friendly). Explicit `false` turns them off.

1. **Account / org master** — `organizationSettings.clientUploadAutoReviewEnabled`  
   Settings UI: Organization settings → “Auto client-upload review”.  
   Auth: `settings.manage`.

2. **Per-file** — `pipeline.clientUploadAutoReviewEnabled`  
   UI: Document Vault tab strip — “Auto client-upload review (15 min)”.  
   Auth: pipeline mutate permission.

**Gating:**

- Master OFF → no 15m jobs, no review-ready notifies. Immediate uploads still notify.
- Per-file OFF → that deal skips 15m review; other deals still run if master ON.
- Both must be ON (or unset) for a file to schedule the quiet-window job.

Flags are re-checked when the quiet window fires (so turning off mid-wait cancels
the package).

## Data model

- `clientUploadReviewDebounce` — one row per pipeline file (`lastUploadAt`, `generation`)
- `clientUploadReviews` — packages with `gapReport`, `draftEmail`, `draftSms`,
  optional `draftTaskReassignment`, status `awaiting_broker_approval` | …

## Broker actions (status only)

- `approveReview` / `requestChanges` / `dismiss` — update status only
- `sendFollowUp` internal stub exists but is **never** called from approve in this PR

## Phase split (locked with Stacy)

### Phase 1–3 (this PR)

Build debounce + gap analysis + drafts + **Joshua/broker notify**. **No client send.**

Both notification layers stay on:

1. Immediate per-upload `document_activity` push (in-app + Web Push)
2. 15m review-package notify (“Client upload review ready”)

No GHL incomplete-docs tags in Phase 1–3.

### Phase 4 (later PR — Stacy handoff locked)

After Joshua **approves**, **Cloud Minion** calls **Stacy** (GHL & LFE Manager) with:

| Field | Notes |
|-------|--------|
| Contact phone + email | Or GHL `contactId` when already known |
| LFE pipeline file id | The deal/file the review belongs to |
| Approved SMS body | From the review package |
| Approved email subject + body | From the review package |
| Channels | `SMS` / `email` / `both` |

**Outbound owner (default: one):** Stacy sends via **GHL SMS + Gmail only**.

Do **NOT** also fire LFE portal Notify on the same package unless Joshua
explicitly asks for portal. Default: Stacy is the sole outbound owner for the
approved quiet-window follow-up.

**Manual LFE “Notify client”** remains for **initial** Document Task Request /
portal invite flows. Auto Phase 4 is only the quiet-window follow-up after
approval.

## Convex usage (fail closed)

- Event-driven `scheduler.runAfter(15m)` only — **no cron**, no idle pump
- Generation token: stale jobs no-op
- Bounded `.take()` on tasks / links / grants / contacts
- Approve / dismiss do not schedule further reviews or outbound sends
- Immediate upload notify does not re-enter the upload path
- No writes to `documentTaskTemplates` / stacks from this feature
