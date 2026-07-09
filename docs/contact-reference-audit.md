# Pipeline & CRM contact reference audit

Date: 2026-05-28  

**Canonical resolvers** (use these instead of raw `contact.email` / `contact.phone` for CRM `Doc<"contacts">`):

| Requested name | Implemented as |
|----------------|----------------|
| `resolvePrimaryEmail()` | `primaryContactEmail()` / **`resolvePrimaryEmail`** alias |
| `resolvePrimaryPhone()` | `primaryContactPhone()` / **`resolvePrimaryPhone`** alias |
| Full lists | `resolveContactEmails()`, `resolveContactPhones()` |
| Search / dedupe | `allContactEmailStrings()`, `allContactPhoneStrings()` |

Location: `lender-app/lib/contact/contactMethods.ts`

Legacy scalars remain valid **only** as denormalized primary mirrors; resolvers fall back when arrays are empty.

---

## Status legend

- **OK** — Uses resolver helpers
- **GAP** — Reads `contact.email` / `contact.phone` (or scalar-only search)
- **N/A** — Not CRM `contacts` (lender embedded, intake borrower, auth user, etc.)

---

## CRM `/contacts` workspace

| Surface | File | Status | Notes |
|---------|------|--------|-------|
| List subtitle | `app/contacts/page.tsx` | **OK** | `primaryContactEmail(c)` |
| Client search | `app/contacts/page.tsx` | **OK** | `allContactEmailStrings` + `allContactPhoneStrings` |
| Detail panel | `components/contacts/ContactMethodsDetail.tsx` | **OK** | `resolveContactEmails/Phones` |
| Editor | `components/contacts/ContactMethodsEditor.tsx` | **OK** | Works on arrays; save sends `emails`/`phones` |
| Save payload | `app/contacts/page.tsx` | **OK** | `emails` / `phones` args |

---

## Pipeline file workspace

| Surface | File | Status | Notes |
|---------|------|--------|-------|
| File contacts block (linked CRM) | `components/pipeline/blocks/FileContactsBlock.tsx` | **OK** | `primaryContactEmail` / `primaryContactPhone` |
| Create + link | `components/PipelineFileWorkspace.tsx` | **GAP** | `createContact({ email, phone })` scalars only — backend normalizes to one primary each |
| Intake dashboard create | `components/intake/Dashboard.tsx` | **GAP** | Same scalar create fields |
| New file dialog | `components/NewPipelineFileDialog.tsx` | **GAP** | Scalar `row.email` / `row.phone` on create |
| Legacy `pipeline.contacts[]` | `convex/pipeline.ts` | **N/A** | Embedded file contacts, not CRM table |
| Messaging picker | `convex/fileMessages.ts` `listLinkedContactsForMessaging` | **GAP** | Returns `c.email` scalar |
| Global search hit subtitle | `convex/globalSearch.ts` | **OK** | `primaryContactEmail(r)` |

---

## Contact selectors & drawers

| Surface | File | Status | Notes |
|---------|------|--------|-------|
| Task related contact search | `components/TaskDrawer.tsx` | **GAP** | Filters `(c.email ?? "")` only — misses secondary emails/phones |
| Lender drawer linked CRM list | `components/LenderDrawer.tsx` | **GAP** | `mailto:` / `tel:` use `contact.email`, `contact.phone` |
| Lender drawer embedded edit | `components/LenderDrawer.tsx` | **N/A** | `lenders.contacts[]` shape (single email/phone per row) |
| Contact selector options | `Dashboard.tsx`, `NewPipelineFileDialog.tsx` | **OK** | Name-only in `<option>` labels |
| Onboarding checklist | `components/UserOnboardingChecklist.tsx` | **OK** | List query only, no method display |

---

## Client & project profiles (indexed graph)

| Surface | File | Status | Notes |
|---------|------|--------|-------|
| `indexedGraphClients` | `convex/schema.ts`, hierarchy modules | **N/A** | Separate `primaryContactEmail` field on **client** nodes, not CRM `contacts` |
| Hub badges | `PipelineHubHierarchyView.tsx`, focus badges | **N/A** | Displays graph client names |
| Backfill | `convex/indexedGraphBackfill.ts` | **GAP** | Copies `c.email`, `c.phone` scalars into graph payloads |

These are **hierarchy client records**, not multi-method CRM contacts. Align only if clients are merged with CRM contacts in a future model.

---

## Convex / integration reads

| Surface | File | Status |
|---------|------|--------|
| `contacts.create` / `update` | `convex/contacts.ts` | **OK** (normalizes methods) |
| `integrationHttp` contact list | `convex/integrationHttp.ts` | Pass-through API — consumers see full doc |
| `buildContactGlobalSearchText` | `lib/globalSearchText.ts` | **OK** |
| Activity feed | `convex/activityFeed.ts` | Name-focused |

---

## Half-migrated UI summary

**Must fix for parity (CRM `contacts` display/search):**

1. `components/TaskDrawer.tsx` — contact filter haystack  
2. `components/LenderDrawer.tsx` — linked global contact mailto/tel  
3. `convex/fileMessages.ts` — messaging contact email field  

**Acceptable short-term (create flows):** Scalar-only create in pipeline dialogs — server `normalizeContactMethods` produces primary entry; users add secondaries in `/contacts`.

**Do not change without design:** `lenders.contacts[]`, CSV lender contacts, discovery candidates (different schemas).

---

## Recommended migration pattern

```ts
import {
  resolvePrimaryEmail,
  resolvePrimaryPhone,
  resolveContactEmails,
} from "@/lib/contact/contactMethods";

const email = resolvePrimaryEmail(contact);
const phone = resolvePrimaryPhone(contact);
```

For search:

```ts
import { allContactEmailStrings, allContactPhoneStrings } from "@/lib/contact/contactMethods";
```
