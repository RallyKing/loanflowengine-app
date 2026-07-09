# Production deployment policy

**Binding** for shipping frontend + backend changes.

---

## MUST before production deploy

1. **`npm run build`** succeeds in `lender-app/`.
2. **Schema / Convex** changes deployed or ordered safely with frontend (`data-migration-safety-policy.md`).
3. **Mobile validation** completed for UI-facing changes (`feature-completion-policy.md`).
4. **Regression** baseline — `qa:governance` or documented equivalent.
5. **Deploy** via **Vercel CLI** **`npm run deploy:prod`** — do not treat GitHub auto-deploy as sole discipline (`docs/deployment-rules.md`).
6. **Post-deploy verification** — production smoke: login, pipeline, tasks, contacts, lenders, mobile scroll.

---

## Convex

- **`convex deploy`** (or org-approved pipeline) MUST align with schema expectations before users hit new UI.

---

## Related

- `documentation-sync-policy.md`
- `observability-policy.md`
