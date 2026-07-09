# AI governance policy

**Binding** for all AI-assisted edits (Cursor, Composer, external bots).

---

## AI MUST NOT

- Bypass **`verify:governance:docs`** / **`qa:governance`** expectations for user-facing work (document explicit exemptions).
- Introduce **shadow systems** or duplicate canonical owners without updating maps (`no-shadow-systems-policy.md`).
- Break **scroll**, **mobile**, or **tenant** contracts.
- Ship **undocumented temporary** hacks (`temporary-code-policy.md`).
- Add **unbounded** subscriptions, observers, or synchronous heavy work on hot paths (`performance-budget-policy.md`).

---

## AI MUST

- Read **`docs/ai-development-rules.md`** + **`docs/governance/`** policy set for the areas touched.
- Search for existing implementations before adding parallel ones.
- Update **`documentation-sync-policy.md`** triggers when architecture changes.

---

## Lifecycle

See **`ai-development-lifecycle.md`** for step-by-step AI workflow.

---

## Related

- `feature-completion-policy.md`
- `documentation-sync-policy.md`
