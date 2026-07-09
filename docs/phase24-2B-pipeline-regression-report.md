# Phase 24.2B — Pipeline view regression (root cause)

**Error:** `Cannot read properties of undefined (reading '<convexId>')`  
**Example key:** `y9716haxr4jwpqzgza1bbnzvps87jxz1` (pipeline file id)

## Exact throw location

**File:** `lender-app/components/pipeline/PipelineHubHierarchyView.tsx`  
**Function:** `LoanStackRow`  
**Line (pre-fix):** 154

```ts
const fileHighlight = triageHighlights.byFileId[String(row._id)] ?? null;
```

## Exact undefined object

`triageHighlights.byFileId` — the **container** was `undefined`, not the highlight entry.

JavaScript evaluates `undefined[fileId]` →  
`Cannot read properties of undefined (reading '<fileId>')`.

## Why the key is a Convex document id

The bracket key is `String(row._id)` — the pipeline **file** id for the loan row being rendered.

## Root cause classification

**Primary:** null-safety / shape mismatch — **NOT** orphaned archived labels.

| Hypothesis | Verdict |
|------------|---------|
| Orphaned archived label | **Ruled out** for this throw — label lookups use `.get()` / optional chaining in task UI |
| Missing highlight map entirely | **Partial** — map object existed but **wrong shape** or missing `byFileId` |
| Query timing (`undefined` during load) | **Ruled out** — loading uses `EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP` with `{}` buckets |
| Null safety on hub resolver | **Confirmed** — one code path bypassed `resolveTriageHighlight` |

### Shape mismatch detail

Phase 24.2A server query returns:

```ts
{ files: Record<fileId, entry>, projects: ..., clients: ... }
```

UI map uses:

```ts
{ byFileId, byProjectId, byClientId }
```

`hubTriageMapFromQuery()` converts server → UI. **`LoanStackRow` was the only hub row that read `byFileId` directly.** If any caller ever passed the **server shape** (or a partial `{}` without buckets), `byFileId` was undefined and render crashed.

`resolveTriageHighlight()` had the same latent bug (`map.byFileId[id]` without `?.`) but was not used in `LoanStackRow`.

### Relation to Phase 24.2B

24.2B did **not** change `LoanStackRow` line 154. The regression surfaced when:

1. More files had active triage highlights (24.2A + 24.2B label usage), so **`LoanStackRow` highlight path executed more often**.
2. Client hierarchy view became the primary path exercising the unsafe lookup.

Archived label filtering in 24.2B affects **composer label lists**, not `getHubTriageHighlightMap` bucket structure.

## Fix applied

1. **`normalizeHubTriageHighlightMap()`** — accepts server or UI shape; always returns safe buckets.
2. **`resolveTriageHighlight()`** — uses normalization + optional bucket access; never throws on bad input.
3. **`LoanStackRow`** — uses `resolveTriageHighlight()` instead of direct `byFileId` access.
4. **`hubHierarchyExpansion`** — optional chaining on expansion maps (secondary hardening).
5. **Projection file rows** — pass `triageHighlights` into `PipelineHubFileRow` (missing prop, non-crash).

## Verification

- `npm run build` (local)
- Hub client hierarchy with labeled open tasks → no crash, highlights render
- Complete task → highlight clears without refresh
