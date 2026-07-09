# Contact communication audit (Phase 24.5.2)

Date: 2026-05-28  
Resolver chain: **preferred → primary → first available** (`resolvePreferredEmail`, `resolvePreferredPhone`, `resolvePreferredContactMethod`).

Schema preference fields exist; **no preference UI** (per scope).

---

## Mailto / tel surfaces (CRM contacts)

| Surface | Resolver | Status |
|---------|----------|--------|
| `FileContactsBlock.tsx` linked rows | `resolvePreferredEmail` / `resolvePreferredPhone` | **Fixed** 24.5.2 |
| `LenderDrawer.tsx` linked CRM list | `resolvePreferredEmail` / `resolvePreferredPhone` | **Fixed** 24.5.2 |
| `ContactMethodsDetail.tsx` | Per-entry links (full list for read-only detail) | OK — shows all methods |
| `ContactMethodsEditor.tsx` | N/A (edit, not send) | OK |

---

## Messaging workflows

| Surface | Field returned | Resolver | Status |
|---------|----------------|----------|--------|
| `fileMessages.listLinkedContactsForMessaging` | `email` on each linked contact | `resolvePreferredEmail` | **Fixed** 24.5.2 |
| `FileMessagingPanel.tsx` | Consumes query `email` for display/options | Inherits fix | OK |

**Gap (acceptable):** Messaging panel does not expose per-email picker for campaigns — single preferred email per contact.

---

## Email send / campaigns

| Surface | CRM contact methods? |
|---------|---------------------|
| `OrgEmailFromFilePanel.tsx` | Manual CSV `to:` — not contact-driven |
| Future campaigns | Should call `resolvePreferredEmail` + `resolvePreferredContactMethod` |

No production email blast module tied to `contacts.email` scalar found.

---

## Create flows (not “send” but data entry)

Pipeline/intake/lender “new contact” use `contactMethodsCreateArgs` → primary `Work` / `Mobile` entries. Users add secondaries in `/contacts` editor.

---

## Non-CRM (unchanged)

| Surface | Notes |
|---------|-------|
| `helpSupportContext.tsx` mailto | Support address, not CRM |
| `PipelineFileWorkspace` lender match cards | `lender.email` / `lender.phone` |
| Lender drawer embedded contacts | Lender schema |

---

## Fallback verification

| `preferredEmailId` | Behavior |
|--------------------|----------|
| Unset | `resolvePreferredEmail` → primary → first email |
| Set, valid id | Uses that entry’s address |
| Orphan id | Falls back to primary (`resolvePreferredEmail` implementation) |

Same for `preferredPhoneId` / `resolvePreferredPhone`.

`resolvePreferredContactMethod`: `sms` and `phone` use preferred phone; default order email → phone when unset.

---

## Recommended follow-up (not 24.5.2)

- File messaging: optional CC picker listing all `resolveContactEmails` entries  
- Campaign module: never read `contact.email` scalar directly  

**Messaging coverage score:** CRM-linked mailto/tel/messaging query **100%** on preferred resolver (24.5.2).
