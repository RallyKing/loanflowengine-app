# Phase 24.4D — Binary Isolation Results

**Date:** 2026-05-28  
**Method:** One subsystem disabled at a time. No broad scroll removal. Preview deploy only until root cause confirmed.

---

## Isolation flags

Central config: `lender-app/lib/debug/phase24-4D-isolation.ts`

| Flag | Step | Purpose |
|------|------|---------|
| `omitOperationalOrientationStrip` | 1 | Strip **not in DOM** (not CSS-hidden) |
| `omitHierarchyExpandMotion` | 2 | Remove expand/collapse transitions (functionality kept) |
| `omitScrollRestoration` | 3 | Disable `scrollIntoView` + `withOperationalScrollPreserved` |

**Current flags (this deploy):** Step 1 only — `omitOperationalOrientationStrip: true`

Verify on preview:

```js
document.querySelector("[data-pipeline-page-root]")?.getAttribute("data-phase24-4d-step1-orientation-strip")
// expected: "omitted"
document.querySelector('[data-testid="pipeline-hub-orientation"]')
// expected: null
```

---

## Results table

| System | Enabled (baseline) | Disabled (isolation) | Jump present? | Evidence |
|--------|-------------------|----------------------|---------------|----------|
| **OperationalOrientationStrip** | Sticky `top-0` in `<main>` (`OperationalOrientationStrip.tsx:155-157`, `PipelinePageClient.tsx:~2170`) | **Step 1 — DISABLED** (render path removed) | **PENDING — you test** | Preview URL below |
| Hierarchy expand motion | `transition-transform` chevrons, conditional DOM insert (`PipelineHubHierarchyView.tsx:382,640,498,696`) | Not yet | — | Run only if Step 1 jump = **YES** |
| Scroll restoration | `scrollIntoView` (`PipelinePageClient.tsx:1066`), `withOperationalScrollPreserved` (`PipelinePageClient.tsx:1575`) | Not yet | — | Run only if Step 2 jump = **YES** |

### Step 1 — YES/NO (fill after preview test)

| Question | Answer |
|----------|--------|
| Does scroll jump **still occur** with orientation strip **removed from DOM**? | **YES** (24.4D Step 1 — stakeholder confirmed) |
| Tested on | _(device / browser)_ |
| Jump during normal scroll? | YES / NO |
| Jump on expand/collapse only? | YES / NO |
| Jump on return from file / focus row? | YES / NO |

**If NO (jump gone):** Root cause = **OperationalOrientationStrip sticky band**. Permanent fix in a follow-up: e.g. `sticky={false}` on hub or move strip outside scroll container — **do not re-enable strip without fix.**

**If YES (jump remains):** Proceed to **Step 2** — set `omitHierarchyExpandMotion: true` in isolation config, redeploy preview only.

---

## Step 1 change log

| Item | Detail |
|------|--------|
| Files | `lib/debug/phase24-4D-isolation.ts` (new), `app/pipeline/PipelinePageClient.tsx` |
| Change | `{!omitOperationalOrientationStrip ? <OperationalOrientationStrip … /> : null}` |
| Marker | `data-phase24-4d-step1-orientation-strip="omitted"` on page root |
| Not done | opacity/display:none, CSS sticky override, other subsystems |

---

## Preview deployment (Step 1)

| Field | Value |
|-------|-------|
| Target | Vercel **preview** (not production) |
| Deployment ID | `dpl_FBKxSsx5cCuj8ahT4n15wZzycSMt` |
| Preview URL | https://lender-obixm3mnp-joshua-4539s-projects.vercel.app/pipeline |
| Inspector | https://vercel.com/joshua-4539s-projects/lender-app/FBKxSsx5cCuj8ahT4n15wZzycSMt |
| Production | **Not updated** (`lender-app-zeta.vercel.app` still has strip) |

---

## How to test (Step 1)

1. Open **preview URL** → `/pipeline`
2. Optional debug: `localStorage.setItem("dlc-pipeline-scroll-debug","1"); location.reload();`
3. Confirm strip absent: `[data-testid="pipeline-hub-orientation"]` is **null**
4. Reproduce your usual jump:
   - Scroll hub list continuously (30+ seconds)
   - Expand/collapse client + project
   - Open file → back to hub
5. Record **before** (prod/baseline) vs **after** (this preview) — video or short screen capture
6. Export logs: `copy(JSON.stringify(PIPELINE_SCROLL_DEBUG?.snapshot?.()?.recentEvents?.slice(0,25), null, 2))`
7. Fill **YES/NO** table above

---

## Step 2 plan (only if Step 1 jump = YES)

**Do not enable until Step 1 confirms jump remains.**

1. Set `omitHierarchyExpandMotion: true` in `phase24-4D-isolation.ts`
2. In `PipelineHubHierarchyView.tsx`, remove:
   - `transition-transform` on chevrons (lines ~382, ~640)
   - Any expand/collapse motion wrappers (keep `{expanded && …}` DOM logic)
3. Build + **preview deploy only**
4. Same YES/NO test matrix

---

## Step 3 plan (only if Step 2 jump = YES)

1. Set `omitScrollRestoration: true`
2. Gate:
   - `useEffect` `scrollIntoView` block (`PipelinePageClient.tsx:1061-1072`)
   - `withOperationalScrollPreserved` wrapper on projection change (`PipelinePageClient.tsx:1575`)
3. Build + **preview deploy only**
4. Same YES/NO test matrix

---

## Artifacts (attach when available)

| Artifact | Step 1 | Step 2 | Step 3 |
|----------|--------|--------|--------|
| Before video | — | — | — |
| After video | — | — | — |
| `PIPELINE_SCROLL_DEBUG` export | — | — | — |

---

## Decision tree

```
Step 1: strip omitted
  ├─ Jump NO  → FIX: orientation strip (sticky / placement)
  └─ Jump YES → Step 2: hierarchy motion off
        ├─ Jump NO  → FIX: hierarchy expand motion / anchor
        └─ Jump YES → Step 3: scroll restoration off
              ├─ Jump NO  → FIX: scrollIntoView / scrollContinuity
              └─ Jump YES → Re-run PIPELINE_SCROLL_DEBUG; file new 24.4E scope
```

---

*Phase 24.4D — binary isolation. No permanent fix until one row shows jump **NO** when that subsystem alone is disabled.*
