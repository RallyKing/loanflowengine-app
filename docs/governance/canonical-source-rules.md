# Canonical source of truth — engineering rules

**Status:** Binding platform policy. **Verification:** `npm run verify:governance:docs` (from `lender-app/`) checks `docs/governance/MANIFEST.json`.

---

## Purpose

Every subsystem MUST declare where truth lives. Conflicting sources of truth cause tenant bugs, duplicate UI, and unfixable scroll/state bugs.

---

## The five canonical owners (MUST)

| Owner | Question | Platform default (unless a map says otherwise) |
|-------|----------|-----------------------------------------------|
| **Data** | Who persists and validates this entity? | Convex tables + org-scoped queries/mutations; see `canonical-system-map.md` |
| **UI surface** | Which route/shell owns primary presentation? | `AppChrome` + route `page.tsx` / feature shell |
| **Client state** | Who holds interactive/transient state? | React state colocated with owner component; server cache via Convex; see `state-ownership-map.md` |
| **Scroll** | Who is the vertical scrollport? | **Default:** `AppChrome` `<main data-app-main-scroll>` — `docs/scroll-architecture-rules.md`. **Pipeline file route:** `[data-pipeline-workspace-scroll]` — **`docs/governance/runtime-workspace-scroll-authority.md`**. |
| **Workflow** | Who orchestrates user/business flow? | Product-owned flows + automation executor; not ad hoc `useEffect` chains across unrelated features |

---

## Before adding code

1. Identify which of the five dimensions your change touches.
2. Open **`canonical-system-map.md`** — confirm you are not creating a second owner.
3. If you introduce a **new** owner (new table, new global store, new scroll container), you MUST update the map and `documentation-sync-policy.md`.

---

## Enforcement

| Mechanism | What it does |
|-----------|----------------|
| `verify:governance:docs` | Fails if any manifest-listed doc is missing |
| `qa:governance` | Build + mobile core + desktop smoke before “done” |
| Cursor | `.cursor/rules/governance-hub.mdc` + `project-rules.mdc` (always on) |

---

## Related

- `no-shadow-systems-policy.md`
- `canonical-system-map.md`
- `state-management-policy.md`
- `route-ownership-policy.md`
