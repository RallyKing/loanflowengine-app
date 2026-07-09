# Platform philosophy — governance

**Status:** Binding. **Applies to:** Humans, AI sessions, vendors, and future refactors.

---

## What users should feel

The platform MUST always feel:

- **Unified** — one product, one shell, one scroll philosophy; no “mini apps” taped together.
- **Fast** — interactions and scroll stay calm; no visible jank on shipped paths.
- **Calm** — content first; utilities and chrome support work without dominating.
- **Mobile-first** — every surface is designed for touch and small viewports first; desktop is an expansion, not the only target.
- **Operationally efficient** — brokers complete deal work with minimal friction.
- **Professional** — Material-aligned patterns, consistent spacing and typography.
- **Trustworthy** — tenant boundaries, auditability, and predictable data behavior.

---

## Non‑negotiables

- No feature may **compromise platform coherence** (scroll ownership, layout grid, org scope, design language) without an explicit governance update and tests.
- **Convenience for one feature** is not a reason to fork architecture.
- **AI-generated code** is not exempt — same policies as human code (`ai-governance-policy.md`).

---

## How this persists

- **Cursor / Composer:** `.cursor/rules/project-rules.mdc`, `governance-hub.mdc`, repo `.cursorrules`.
- **CI / local gates:** `verify:governance:docs`, `qa:governance` from `lender-app/`.
- **Docs:** `docs/governance/*` + `docs/ai-development-rules.md`.

---

## Related

- `feature-completion-policy.md`
- `design-system-policy.md`
- `no-shadow-systems-policy.md`
