# AI development lifecycle

**Binding workflow for AI-assisted sessions** (Cursor, Composer, bots).

---

## Phase 0 — Load policy

1. `docs/ai-development-rules.md`
2. `docs/governance/` policies matching the task (UI → design-system + scroll + mobile; data → tenant + migration).
3. `docs/project-intelligence-summary.md` for affected systems.

---

## Phase 1 — Discover

- Search for existing implementations (`no-shadow-systems-policy.md`).
- Read `duplicate-system-watchlist.md` if touching listed domains.

---

## Phase 2 — Design

- Confirm canonical owners (`canonical-system-map.md`, `state-ownership-map.md`).
- Plan tests + doc updates (`documentation-sync-policy.md`).

---

## Phase 3 — Implement

- Follow scroll/mobile/deploy rules.
- No shadow systems; no silent tenant scope errors.

---

## Phase 4 — Verify

- `npm run verify:governance:docs` if docs/manifest changed.
- `npm run qa:governance` for user-facing work (`lender-app/`).
- `npm run deploy:prod` + smoke when shipping.

---

## Phase 5 — Document

- Update maps/checklists triggered by the change.

---

## Related

- `ai-governance-policy.md`
- `feature-completion-checklist.md`
