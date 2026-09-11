# Duplicate system watchlist

**Living document.** List *known* areas where duplication risk is high. Update when adding adjacent features.

---

## Watchlist (do not fork without ADR)

| Area | Why it’s sensitive | Before adding parallel code |
|------|-------------------|------------------------------|
| **Contacts** | Legacy embedded vs link table | Read `contacts` + pipeline joins; extend `contactFileLinks` |
| **Lenders** | Org vs global catalog | Use existing org scoping patterns |
| **Pipeline blocks** | Second drawer system | Extend `pipelineBlockRegistry` |
| **Financials statements (PFS / Simple P&L / Track Record / Construction Budget)** | Shadow P&L or second statement mini-app | Reuse collapsible Financials blocks + shared assign/copy/PDF helpers; Simple P&L is `simplePl` / `simple_pl` |
| **Scroll containers** | CLS + mobile break | Reuse `<main>`; documented exceptions only |
| **Task UI** | Second task backend | Extend tasks schema/mutations |
| **Webhooks / automations** | Double delivery paths | Reuse enqueue + idempotent handlers |
| **Email / SMS / communication templates** | Second template library or competing Settings UI | Canonical store: `communicationTemplates`. Canonical hub: **`/automations`**. Settings → Message templates is link/redirect only — do not rebuild `MessageTemplatesManager` elsewhere |
| **Shared deal fields** | Numeric drift across blocks | Use `fileSharedState` / normalization helpers |
| **AI lender discovery** | Second crawl stack | Extend `convex/discovery.ts` with flags |
| **Org AI API keys / Due Diligence** | Second key vault or LLM caller | Extend `orgAiProviders` + `dueDiligence*` — do not add another encrypted-key table or client-side OpenAI SDK. Platform `OPENAI_API_KEY` remains discovery/assist only. |
| **Document Vault stars / Explorer search** | Second favorites/pin system or second vault finder | Extend `vaultStars` + existing `vaultSearchQuery` / `vaultExplorerFilter` — do not add another starred table or a second Explorer search box with its own query state |
| **Pipeline Client title** | Second displayTitle / frozen file title | Hub `clientDisplayName` is computed live from primary entity + primary individual (`resolveTableRowClientDisplayName`). Write-through `dealData.clientName` only — do not add `displayTitle` / `clientTitle`. |
| **Quantized query clock** | `Date.now()` in `useQuery` args re-subscribes every render | Reuse **`TriageClockProvider`** / `useTriageClockTime()` — do not add a second clock (`convex-reactivity-policy.md` §3.6) |
| **Collaboration presence** | A second heartbeat is a write storm | Reuse **`hooks/usePresence.ts`** — do not add another ping (`resource-consumption-policy.md` §A.6) |
| **Client stores of Convex documents** | Redux/Zustand/context mirrors drift from the subscription | `useQuery` is the source of truth (`state-ownership-map.md`, `convex-reactivity-policy.md` §5) |

---

## Process

1. Search codebase + this list.
2. If duplication is unavoidable, add a row with **rationale** and **convergence plan**.

---

## Related

- `no-shadow-systems-policy.md`
- `convex-reactivity-policy.md`
- `canonical-system-map.md`
