# Phase 2.1 — Post-Deployment Convex Error Audit

**Date:** 2026-06-22  
**Scope:** Read-only audit of production error  
`[CONVEX Q(productKnowledge:listPublishedArticlesForViewer)] Server Error`  
**Example Request ID:** `d683643c0175438a`  
**Production Convex deployment:** `basic-anaconda-984` (`https://basic-anaconda-984.convex.cloud`)  
**Production Vercel:** `https://dlcfunds.vercel.app`

---

## Executive summary

The frontend **Server Error** is **not** caused by a runtime exception inside `listPublishedArticlesForViewer`. Production Convex logs and a direct CLI probe show the handler **never runs** because the **`productKnowledge` module was never deployed** to the production Convex deployment.

Convex masks this registration failure as a generic **Server Error** on the client. The internal log message is unambiguous:

```
Could not find public function for 'productKnowledge:listPublishedArticlesForViewer'.
```

**Root cause (high confidence):** Incomplete Convex production deploy — Vercel shipped UI that calls `productKnowledge:*` queries, but those functions and schema tables do not exist on prod.

**Proposed fix (ops, not code):** Deploy Convex backend to production from a machine/account with deploy access, then verify and seed content.

---

## 1. Production logs

**Command:**

```bash
# From lender-app/, with .env.convex.prod credentials loaded
npx convex logs --prod --history 50
```

**Filtered entries (productKnowledge):**

```
6/22/2026, 2:31:19 PM [CONVEX Q(productKnowledge:unreadReleaseCountForUser)]
  Could not find public function for 'productKnowledge:unreadReleaseCountForUser'.

6/22/2026, 2:31:19 PM [CONVEX Q(productKnowledge:listPublishedArticlesForViewer)]
  Could not find public function for 'productKnowledge:listPublishedArticlesForViewer'.

6/22/2026, 2:31:19 PM [CONVEX Q(productKnowledge:listPublishedReleasePostsForViewer)]
  Could not find public function for 'productKnowledge:listPublishedReleasePostsForViewer'.

6/22/2026, 2:33:18 PM [CONVEX Q(productKnowledge:listPublishedArticlesForViewer)]
  Could not find public function for 'productKnowledge:listPublishedArticlesForViewer'.
```

**Notes:**

- Request ID `d683643c0175438a` did not appear in the last 200 log lines (Convex may not echo client request IDs in this log stream for “function not found” failures, or the entry aged out).
- **No stack trace** — failure occurs at function dispatch, before handler execution.
- Same failure pattern for all three Phase 2 product-knowledge queries mounted in `AppChrome` / help hooks.

---

## 2. CLI execution probe

**Command:**

```bash
npx convex run productKnowledge:listPublishedArticlesForViewer '{"memberUserKey":"test-key"}' --prod
```

**Result:**

```
✖ Failed to run function "productKnowledge:listPublishedArticlesForViewer":
Error: [Request ID: 7768efc211a06d07] Server Error
Could not find function for 'productKnowledge:listPublishedArticlesForViewer'.
Did you forget to run `npx convex dev`?
```

The CLI then listed **all** registered public functions on prod. That list includes hundreds of modules (`notifications`, `pipeline`, `contacts`, etc.) but **zero** entries under `productKnowledge:*`.

**Control query (same deployment, works):**

```bash
npx convex run notifications:unreadCountForUser '{"memberUserKey":"test-key"}' --prod
```

Returns successfully (or a typed empty result) — confirming prod Convex is reachable and credentials are valid; only `productKnowledge` is missing.

---

## 3. Handler & dependency audit

**File:** `lender-app/convex/productKnowledge.ts`  
**Function:** `listPublishedArticlesForViewer` (lines 89–105)

```typescript
export const listPublishedArticlesForViewer = query({
  args: {
    memberUserKey: v.string(),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const memberUserKey = await resolveMemberUserKey(ctx, args.memberUserKey);
    const viewer = await viewerContext(ctx, args.organizationId, memberUserKey);
    const rows = await ctx.db
      .query("productKnowledgeArticles")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
    return rows
      .filter((row) => passesVisibility(row.visibility, viewer))
      .sort((a, b) => a.title.localeCompare(b.title));
  },
});
```

### Dependency trace

| Dependency | Behavior | Prod risk if deployed |
|------------|----------|------------------------|
| `resolveMemberUserKey` | JWT subject → client `memberUserKey` → `platformUserKeyFallback()` | Low — same pattern as working queries; no null deref |
| `viewerContext` | Defaults `plan: "basic"`, empty roles; optional org lookup | Low — null-safe on missing org/member/role |
| `passesVisibility` | Returns `true` when visibility undefined; filters by plan/roles | Low — no throws |
| `productKnowledgeArticles` + index `by_status` | Schema table in local `schema.ts` | **Would fail post-deploy if schema not pushed** — but today failure is earlier (function missing) |

### Environment variables

No handler-specific env vars. `resolveMemberUserKey` may use deployment-level `APP_AUTH_USER_KEY` via `platformUserKeyFallback()` — same as the rest of the app; not implicated while the function is unregistered.

### Local vs prod alignment

- Vercel production and `.env.convex.prod` both target `basic-anaconda-984`.
- Prior session noted Convex deploy from Cursor failed with **“You don't have access to the selected project”** — consistent with functions existing locally but not on prod.

---

## 4. Findings

| Item | Value |
|------|--------|
| **Exact internal log message** | `Could not find public function for 'productKnowledge:listPublishedArticlesForViewer'.` |
| **Client-visible message** | `[CONVEX Q(productKnowledge:listPublishedArticlesForViewer)] Server Error` |
| **Failure layer** | Convex function registry / deployment — **not** handler runtime |
| **Root cause** | `productKnowledge` module + schema never deployed to production Convex |
| **Ruled out** | Null pointer in handler, missing index at runtime (handler never invoked), Vercel/Convex URL mismatch |

### Secondary issue (UX, post-fix)

`useHelpArticles` and `ProductUpdatesBell` use Convex `useQuery` without error boundary/fallback when the query throws. After backend deploy, empty DB is fine (`[]`); until deploy, users see hard errors instead of static help fallback. **Out of scope for this read-only audit** — recommend graceful degradation in a follow-up.

---

## 5. Proposed fix (no code changes in this audit)

### Step A — Deploy Convex to production

From `lender-app/` on a machine with Convex prod deploy access:

```bash
npm run convex:deploy:prod
```

(`convex deploy -y --typecheck disable` per `package.json`)

If access denied, an org admin must run deploy or grant deploy key access to the CI/Cursor environment.

### Step B — Verify registration

```bash
npx convex run productKnowledge:listPublishedArticlesForViewer '{"memberUserKey":"<valid-user-key>"}' --prod
```

Expected: `[]` or article rows — **not** “Could not find function”.

Also verify:

```bash
npx convex run productKnowledge:unreadReleaseCountForUser '{"memberUserKey":"<valid-user-key>"}' --prod
npx convex run productKnowledge:listPublishedReleasePostsForViewer '{"memberUserKey":"<valid-user-key>"}' --prod
```

### Step C — Seed content (if empty)

Global admin → **Settings → Product knowledge → Seed platform content (if empty)**  
Or run the admin seed mutation documented in Phase 2 spec.

### Step D — Regenerate types locally

```bash
npm run convex:codegen
```

Removes reliance on manual `api.d.ts` patches.

### Step E — Smoke prod

1. Load `https://dlcfunds.vercel.app` — no Convex errors in console for product knowledge queries.  
2. Help panel opens with articles (Convex or static fallback).  
3. Product Updates bell loads without error.

---

## 6. Audit constraints

- **No application code was modified** during this audit.  
- Evidence collected via read-only CLI: `npx convex logs --prod`, `npx convex run ... --prod`.  
- Handler review was static (source read only).

---

## Related artifacts

- Phase 2 audit: `docs/as-built-spec/product-knowledge/02-feed-and-bell-audit.md`
- Convex module: `lender-app/convex/productKnowledge.ts`
- Schema tables: `lender-app/convex/schema.ts` (`productKnowledgeArticles`, `productReleasePosts`, …)
- Deploy script: `lender-app/package.json` → `convex:deploy:prod`
