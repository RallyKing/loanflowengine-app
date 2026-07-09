# Product Knowledge — as-built spec index

Living documentation for the **Product Knowledge System** (Feature Encyclopedia, Product Feed, documentation automation). Every implementation phase starts with a read-only audit in this folder before code ships.

## Audit protocol

1. Copy structure from [`00-audit-template.md`](./00-audit-template.md).
2. Write `NN-<phase>-audit.md` for the phase.
3. Implement only after gaps and risks are explicit in the audit.

## Artifacts

| File | Phase | Status |
|------|-------|--------|
| [`00-audit-template.md`](./00-audit-template.md) | 0A | Template |
| [`00-baseline-audit.md`](./00-baseline-audit.md) | 0B | Complete |
| `01-encyclopedia-audit.md` | 1 | Complete |
| `02-feed-and-bell-audit.md` | 2 | Complete |
| `03-automation-audit.md` | 3 | Pending |
| `04-workbook-audit.md` | 4 | Pending |

## Code foundation (Phase 0C)

- Types: [`lender-app/lib/product-knowledge/types.ts`](../../lender-app/lib/product-knowledge/types.ts)
- Category enum + census map: [`lender-app/lib/product-knowledge/censusArticleMap.ts`](../../lender-app/lib/product-knowledge/censusArticleMap.ts)

## Related census (broader as-built)

- Pipeline hub census (Prompt 2A) — in progress; will live under `docs/as-built-spec/pipeline/`
- Route inventory, Convex domain audit — planned under `docs/as-built-spec/`

## Target systems

1. **Feature Encyclopedia** — extends `HelpCenterPanel` + static/Convex articles
2. **Product Feed** — separate bell (`ProductUpdatesBell`), not operational notifications
3. **Documentation engine** — drift detector → AI drafts → admin publish (never auto-publish jargon)
