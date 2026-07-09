# Phase 25.7a — New Referral Link Display Audit (read-only)

**Date:** 2026-06-03  
**Track:** C — Core CRM Architecture  
**Prerequisite:** [phase25-6-lender-leak-fix.md](./phase25-6-lender-leak-fix.md), [phase25-5-strict-referral-enforcement.md](./phase25-5-strict-referral-enforcement.md)  
**Constraint:** Diagnostic only — no code, schema, or UI changes in this phase.

---

## Executive summary

New referral links from the file workspace **are saving correctly on `contactFileLinks`** (link-level `contactRoleId: referral_partner`). They **do not appear** in the Pipeline Hub Referral Partner view because **Phase 25.6 introduced a contact veto** that requires the **master** `contacts.contactRoleId` to already be `referral_partner` before a link can enter the hub graph.

**This is not a stale cache or missing reactive query.** `api.pipeline.listTablePreview` is a live Convex query that re-reads `contactFileLinks` on every link mutation. The row is omitted at **graph build time** by design of the veto.

The dominant failure mode is **“Link existing contact”** (and **“Change CRM role on linked row”**): the workspace updates **only the link row**, not the contact master record.

---

## 1. Veto logic (`lib/contact/contactRoles.ts`)

### Functions (Phase 25.6)

```typescript
contactQualifiesForReferralHub(contact) :=
  contact != null
  AND canonicalContactRoleIdFromDoc(contact) === "referral_partner"
  // canonical = contacts.contactRoleId.trim() only — no legacy inference

isReferralPartnerFileAssociation({ linkContactRoleId, contact }) :=
  IF NOT contactQualifiesForReferralHub(contact) → false   // ← contact veto (runs first)
  ELSE IF linkContactRoleId is set → linkContactRoleId === "referral_partner"
  ELSE → true
```

### Truth table (hub inclusion via CFL)

| Master `contacts.contactRoleId` | Link `contactFileLinks.contactRoleId` | `contactQualifiesForReferralHub` | `isReferralPartnerFileAssociation` | In `gl.referrals`? |
|--------------------------------|----------------------------------------|----------------------------------|-------------------------------------|-------------------|
| `referral_partner` | `referral_partner` | true | true | **Yes** |
| `referral_partner` | `client` (or other) | true | false | No |
| `client` | `referral_partner` | **false** | **false** (veto) | **No** |
| `undefined` / unset | `referral_partner` | **false** | **false** (veto) | **No** |
| `lender_rep` | `referral_partner` | **false** | **false** (veto) | **No** |
| `lender_rep` | `lender_rep` | false | false | No |

### Catch-22 (confirmed)

> User links an existing **client** (or role-unset) contact to a file with CRM role **Referral Partner** on the link.

1. `contactFileLinks.upsert` writes `contactRoleId: "referral_partner"` on the **link** row.
2. `contacts.contactRoleId` remains `client` (or unset).
3. `batchGraphLinksForPipelineFiles` loads the contact and evaluates `contactQualifiesForReferralHub(contact)` → **false**.
4. Server **skips** the link before `addReferral` (see `pipelineGraphPreviewLinks.ts` ~393–404).
5. Client `buildReferralFocusTree` never sees a referral graph entry for that file/partner.

**Boolean that drops the link (server):**

```text
!contact || !contactQualifiesForReferralHub(contact)  →  continue (drop)
```

**Second drop (client, if graph row ever existed with wrong canonical):**

```text
canonical && !contactQualifiesForReferralHub({ contactRoleId: canonical })  →  continue
!canonical || !isReferralPartnerRoleId(canonical)  →  skip linkReferral
```

### `isReferralPartnerGraphLink` (client)

Requires both:

- Link tag: `contactRoleId` or `relationshipType` === `referral_partner`
- If `canonicalContactRoleId` present on graph row: must also be `referral_partner`

Graph rows are only emitted when canonical is referral (server), so client checks are consistent with the veto.

### Edge sync (`indexedGraphEdgeSync.ts`)

`syncFileReferralEdgeFromContactLink` calls `isReferralContactFileLink` → same `isReferralPartnerFileAssociation` veto.

So for **client master + referral link**, junction `fileReferralPartners` is **not** upserted either (Phase 25.6 disabled junction for hub preview anyway, but sync still matters for other tooling).

---

## 2. Workspace save payloads

### `FileContactsBlock.tsx` → `PipelineFileWorkspace.tsx`

| User action | `contacts` master | `contactFileLinks` | Hub-visible? |
|-------------|-------------------|------------------|--------------|
| **Create & link** new contact with Referral Partner | `createContact({ contactRoleId })` → **set** | `upsert({ contactRoleId })` → **set** | **Yes** (if master is `referral_partner`) |
| **Link existing** contact, pick Referral Partner | **Not updated** | `upsert({ contactRoleId: "referral_partner" })` → **set** | **No** (veto) |
| **Edit CRM role** on existing link row | **Not updated** | `onUpdateLink` → `upsert` with link’s `contactRoleId` | **No** if master still `client` |

### `onLink` (link existing) — `PipelineFileWorkspace.tsx` ~4066–4081

```typescript
await upsertContactFileLink({
  contactId,
  fileId: p._id,
  role: roleLabel,
  notes,
  contactRoleId,  // from dropdown — e.g. referral_partner
});
// No contacts.update / patch
```

### `onCreateAndLink` — ~4083–4116

```typescript
const contactId = await createContact({ ..., contactRoleId });  // master set
await upsertContactFileLink({ contactId, ..., contactRoleId });
```

### `onUpdateLink` — ~4118–4136

Uses `link.contactRoleId` from the file block dropdown; **does not** call `contacts.update`.

### `contactFileLinks.upsert` (Convex) — `convex/contactFileLinks.ts` ~287–305

```typescript
resolvedContactRoleId = explicitRoleId ?? effectiveContactRoleIdFromDoc(contact);
// Patches ONLY contactFileLinks row — never patches contacts.contactRoleId
```

Link row gets `referral_partner`; master contact doc is unchanged.

---

## 3. Reactivity and graph sync

### Hub data source

- **UI:** `PipelinePageClient.tsx` → `useQuery(api.pipeline.listTablePreview, listPreviewArgs)`
- **Per row:** `graphLinks` embedded by `batchGraphLinksForPipelineFiles` inside the `listTablePreview` handler (`convex/pipeline.ts` ~796–817)

### Is there a separate cache index?

**No.** Graph links are computed **inline on each query execution** from current `contactFileLinks`, `contacts`, and junction tables. There is no separate “pipeline graph cache” table that must be manually invalidated for hub preview.

### Does the query re-run when a new link is created?

**Yes (Convex reactivity).** `batchGraphLinksForPipelineFiles` executes:

```typescript
const cflAll = (await ctx.db.query("contactFileLinks").collect()).filter(...)
```

Any insert/patch/delete on `contactFileLinks` invalidates queries that read that table. Subscribed clients re-fetch `listTablePreview`; `graphLinks.referrals` is rebuilt.

`contactFileLinks.upsert` does **not** bump `pipeline.updatedAt`, but that is **not required** for invalidation because the query already depends on `contactFileLinks`.

### Manual sync trigger missing?

**Not for hub display.** `syncFileReferralEdgeFromContactLink` runs on upsert but is gated by the same veto; it does not block hub preview (junction pass is disabled in `pipelineGraphPreviewLinks.ts` Phase 25.6). Missing junction rows are **not** why the hub is empty for valid new links — **veto on CFL pass** is.

---

## 4. End-to-end drop diagram

```text
File workspace: Link "Jane Client" as Referral Partner on File X
        │
        ▼
contactFileLinks.upsert
  • link.contactRoleId = "referral_partner"  ✓
  • contacts.contactRoleId = "client"        (unchanged)
        │
        ▼
listTablePreview re-runs (Convex)            ✓
        │
        ▼
batchGraphLinksForPipelineFiles
  • contactQualifiesForReferralHub(jane) = false
  • continue → referrals[] empty for File X
        │
        ▼
buildReferralFocusTree (client)
  • no referral graph entries → partner not in tree
```

---

## 5. Why Phase 25.6 fixed lenders but broke new links

| Issue | Phase 25.6 behavior |
|-------|---------------------|
| **Lender leak** (“A-Paper Lender”, “Has 9 lenders”) | Master wrongly `referral_partner` + stale junction → removed by veto + data fix |
| **New valid referral** (client master, referral on file) | Same veto treats as invalid → **regression** |

---

## 6. Recommended patch (for Phase 25.7b — not implemented here)

Goal: Allow **per-file** referral assignment without reopening lender leak (`lender_rep` must never appear in referral hub).

### Option A — **Promote master on save** (recommended)

When workspace or `contactFileLinks.upsert` sets link `contactRoleId` to `referral_partner`:

- Also `patch` `contacts.contactRoleId` to `referral_partner` **unless** canonical is `lender_rep` (hard block promotion from lender rep).
- Implement in **one canonical place** (`contactFileLinks.upsert`) so all callers (workspace, intake, dialogs) stay consistent.

**Pros:** Matches user expectation (“this person is a referral partner on this deal”); hub veto stays strict; lender rep rows stay excluded.  
**Cons:** Master role becomes global, not per-file only (product decision — may be desired for CRM).

### Option B — **Relax veto with lender guard only**

Change `isReferralPartnerFileAssociation` to:

```text
IF linkRole === "referral_partner"
  AND canonical !== "lender_rep"
  → true
ELSE IF contactQualifiesForReferralHub(contact) AND link agrees
  → true
ELSE → false
```

Keep referral hub **filter dropdown** on `strictCanonicalRoleMatch` so only true referral masters appear in pickers; tree can show partners with referral **links** even if master still `client`.

**Pros:** True per-file role without mutating master.  
**Cons:** Must audit all paths so `lender_rep` canonical never pairs with referral link in graph (25.6 data cleanup must stay).

### Option C — **Hybrid (promote + relaxed graph)**

Promote master on explicit user selection in workspace **and** allow graph when `linkRole === referral_partner` && `canonical !== lender_rep`.

Strongest UX; slightly more complex.

### Not recommended

- Re-enabling blind `fileReferralPartners` junction merge without canonical checks (reopens 25.6 leak).
- Using `effectiveContactRoleIdFromDoc` for hub veto (reopens label-inference leak).

---

## 7. Verification checklist (after 25.7b)

1. Link existing **client** as Referral Partner on a file → hub Referral view shows file under partner within one Convex tick.
2. **A-Paper Lender** / **Has 9 lenders** do not reappear (`lender_rep` master still excluded).
3. **Create & link** new referral still works.
4. Ryan Suetrong (or org’s true `referral_partner` contacts) unchanged.

---

*End of Phase 25.7a audit.*
