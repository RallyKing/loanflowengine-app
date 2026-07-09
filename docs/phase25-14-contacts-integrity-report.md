# Phase 25.14 — Contacts module integrity & type safety audit

**Date:** 2026-05-28  
**Mode:** Read-only diagnostic (no schema or UI changes applied)  
**Scope:** CRM contacts — `contactRoleIds` multi-role migration, form stability (Phase 25.9/25.10), cross-file role append (Phase 25.7b)

---

## Executive summary

| Check | Result |
|-------|--------|
| Schema ↔ resolver alignment for `contactRoleIds` | **PASS** |
| `normalizeContactForClient` on public read APIs | **PASS** (all `contacts` queries) |
| Contacts UI form null-safety | **PASS** |
| `appendMasterContactRoleId` deduplication | **PASS** |
| TypeScript errors under contacts module paths | **0** |
| Compiler-breaking mismatches requiring hotfix | **None found** |

The contacts module is **structurally sound** for roadmap continuation. Residual `contactRoleId` (singular) usage is **intentional** for backward-compatible mutation args, per-link CRM roles, and list filters — not un-coalesced master-contact leaks.

---

## 1. Data type alignment (`convex/schema.ts` & resolvers)

### Schema (`contacts` table)

| Field | Definition | Status |
|-------|------------|--------|
| `contactRoleIds` | `v.optional(v.array(v.string()))` | Canonical multi-role storage |
| `contactRoleId` | `v.optional(v.string())` | Deprecated mirror; documented as primary/legacy single |
| `labels` / `crmRelationshipTypes` | optional deprecated | Unmigrated rows only; inference via `effectiveContactRoleIdsFromDoc` |

Link tables (`contactFileLinks`, `contactLenderLinks`) correctly keep **per-link** `contactRoleId` (single string per association) — separate from master `contacts.contactRoleIds`.

### Mutation / query validators (`convex/contacts.ts`)

| API | Role inputs | Write behavior |
|-----|-------------|----------------|
| `create` | `contactRoleId?`, `contactRoleIds?` | `coalesceContactRoleIdsFromArgs` → `resolveContactRoleIdsForOrg` (org-validated, **deduped**) → persists **both** `contactRoleIds` + mirrored `contactRoleId` |
| `update` | same | Role patch only when either field sent; same resolution path |
| `list` | `contactRoleIdFilter?` (filter param name) | Filter uses `contactMatchesRoleFilter` (multi-role + optional link inference) |
| `get` | — | Returns normalized row |

**Finding:** No mutation treats `contactRoleIds` as a single string. Optional `contactRoleId` on create/update is a **documented bridge** (`coalesceContactRoleIdsFromArgs` in `lib/contact/contactRoles.ts`), not a stale storage path.

### Shared coercion library (`lib/contact/contactRoles.ts`)

- `uniqRoleIds` / `sanitizeContactRoleIds` — trim, dedupe, reject empty keys, object `{ value }` coercion (defensive for dirty UI).
- `canonicalContactRoleIdsFromDoc` — merges array + legacy single without duplicates.
- `contactRoleIdsMutationPayload` — UI → Convex payload always `{ contactRoleIds: string[], contactRoleId: string }` with non-empty array.

---

## 2. `normalizeContactForClient` coverage (read paths)

### Applied (required)

| Resolver | File | Line(s) | Notes |
|----------|------|---------|-------|
| `contacts.list` | `convex/contacts.ts` | ~272–274 | Every row mapped through `normalizeContactForClient` |
| `contacts.get` | `convex/contacts.ts` | ~287 | Single-row normalize before return |

All app consumers of **`api.contacts.list`** / **`api.contacts.get`** receive coalesced `contactRoleIds` + mirrored `contactRoleId`:

- `app/contacts/page.tsx`
- `components/intake/Dashboard.tsx`, `NewPipelineFileDialog.tsx`
- `components/LenderDrawer.tsx`, `TaskDrawer.tsx`
- `hooks/usePipelineFileWorkspaceData.ts`
- `convex/integrationHttp.ts` `/api/v1/contacts` (delegates to `contacts.list`)

### Not normalized (acceptable / out of scope)

| Path | Why acceptable |
|------|----------------|
| `convex/globalSearch.ts` `pushContactRows` | Builds search **hits** (title/subtitle/href only); does not return full contact documents to CRM UI |
| Internal migrations / backfills | Direct `ctx.db` access by design |
| `contactFileLinks.*` queries | Return link rows; master role normalization is client's responsibility when joining to `contacts.get` |

**Finding:** **Zero un-coalesced legacy master-contact shapes** on the two public read queries that power the Contacts module and CRM pickers.

---

## 3. Form state structural safety (`app/contacts/page.tsx`)

### Defensive patterns verified

| Mechanism | Purpose |
|-----------|---------|
| `emptyDraft()` | Known-safe defaults; `contactRoleIds: [client]` |
| `normalizeDraft(partial?)` | Coerces `name`/`notes`/`company` to `string`; filters email/phone arrays; `sanitizeContactRoleIds` for roles |
| `editorDraft = useMemo(() => normalizeDraft(draft), [draft])` | Render path never sees null draft fields |
| `patchDraft` | Always `setDraft((c) => normalizeDraft({ ...c, ...patch }))` |
| `draftFromDoc` | Uses `effectiveContactRoleIdsFromDoc(c)` on server rows (already normalized from `get`/`list`) |
| Controlled inputs | `e.currentTarget?.value ?? ""` on name, company, notes |
| `onSave` | Re-normalizes with `normalizeDraft(draft)` before `contactRoleIdsMutationPayload` |

### `ContactMethodsEditor` (`components/contacts/ContactMethodsEditor.tsx`)

- Email: `value={entry.email ?? ""}`; phone: `value={entry.number ?? ""}`; label selects use `e.currentTarget?.value ?? ""`.
- Add/remove rows preserve primary-flag invariants.

### `ContactRoleMultiSelect`

- Input `value` sanitized via `sanitizeContactRoleIds(value)` before render.
- Minimum one role enforced on toggle (cannot delete last role).

**Finding:** Phase 25.9/25.10 null `value` crash class is **mitigated** at draft boundary + input fallbacks. No `TypeError: Cannot read properties of null (reading 'value')` path identified in static review.

---

## 4. Cross-wiring: `appendMasterContactRoleId` (`convex/lib/contactRoleMasterSync.ts`)

Called from `contactFileLinks.upsert` when `contactRoleId` is explicit on link.

| Step | Behavior |
|------|----------|
| Resolve role | `resolveRoleIdForOrg` (trim + org catalog validation) |
| Idempotent append | If `canonicalContactRoleIdsFromDoc(contact).includes(resolved)` → **return contact unchanged** (no duplicate DB write) |
| Merge | `mergeContactRoleIds(current, [resolved])` → `uniqRoleIds` (trim + Set dedupe) |
| Persist | Patches `contactRoleIds`; sets `contactRoleId` only if legacy single was empty |
| Side effect | `refreshContactGlobalSearchText` |

**Scenario:** Same contact linked as Referral Partner on **multiple pipeline files** — second and subsequent links with `referral_partner` do **not** duplicate array entries or throw index warnings.

**Finding:** **PASS** — deduplication is correct and idempotent.

---

## 5. TypeScript compile status

Command: `npx tsc --noEmit -p tsconfig.json` (from `lender-app/`)

| Scope | Errors |
|-------|--------|
| `app/contacts/**` | **0** |
| `components/contacts/**` | **0** |
| `lib/contact/**` (roles + methods) | **0** |
| `convex/contacts.ts` | **0** |

**Repo-wide note:** Full-project `tsc` currently reports **2 errors** in `tests/e2e/` only (`pipeline-scroll.spec.ts`, `smoke.spec.ts`) — **unrelated** to the contacts module. `npm run build` (Next.js app compile) succeeds for product code.

---

## 6. Intentional singular `contactRoleId` references (not leaks)

These remain by design and should **not** be “fixed” without a product decision:

| Location | Role |
|----------|------|
| `contacts.create` / `update` args | Backward-compatible mutation bridge |
| `contacts.list` `contactRoleIdFilter` | Filter API name (matches one role in effective set) |
| `contactFileLinks` / `contactLenderLinks` | Per-association CRM role (one role per link) |
| `app/contacts/page.tsx` link display | Shows `link.contactRoleId` for file associations |
| Pipeline file contact linking | Link-level role + optional `contactRoleIds: [id]` on master when creating contact |

---

## 7. Low-priority observations (no action required for 25.14)

1. **`globalSearch` contact hits** — Raw DB rows used only for display strings; roles not exposed in palette. Optional future hardening: run `normalizeContactForClient` if hit payload ever includes role metadata.
2. **`onDelete` success path** — Uses `setDraft(emptyDraft())` instead of `normalizeDraft(emptyDraft())`; equivalent safety because `emptyDraft()` is already fully defined.
3. **`ContactRoleMultiSelect`** imports `cn` from `@/lib/utils` (alias) — cosmetic consistency only.

---

## 8. Checklist sign-off

- [x] **TypeScript compiling for contacts module paths: 0 errors**
- [x] **Zero un-coalesced legacy master-contact paths on `contacts.list` / `contacts.get`**
- [x] **Mutations enforce array semantics with org validation and dedupe**
- [x] **Form state structural safety verified (normalizeDraft + `?? ""` + editorDraft)**
- [x] **`appendMasterContactRoleId` dedupe verified for repeat referral links**
- [x] **No compiler-breaking type mismatch discovered — no hotfix applied**

---

## References

- `docs/phase25-1b-contact-roles-execution.md` — initial roles migration
- `docs/phase25-2a-referral-contacts-audit.md` / `phase25-2b` — referral link hardening
- `lender-app/convex/contacts.ts` — canonical API
- `lender-app/lib/contact/contactRoles.ts` — client/server role coercion
