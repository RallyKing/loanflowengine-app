# Phase 29.2 — Task color sticky-map fix

**Date:** 2026-05-28  
**Status:** Shipped  
**Follows:** `docs/phase29-1-task-flicker-audit.md`

## Problem

`TriageClockProvider` updates `nowBucket` every 60s, which changes `getHubTriageHighlightMap` query args. While Convex `useQuery` reloads, `raw` is `undefined` and the hook returned `EMPTY_HUB_TRIAGE_HIGHLIGHT_MAP`, clearing hub triage rails/badges for one or more frames.

## Solution

**Sticky last-known-good map** in `hooks/useHubTriageHighlightMap.ts`:

| State | Behavior |
|-------|----------|
| `useQuery` returns data | Normalize, store in `lastKnownMapRef`, return fresh map |
| `useQuery` is `undefined` (in-flight) | Return `lastKnownMapRef` when `loadedContextKeyRef` matches current org+member |
| Query `"skip"` (no org / member) | Return empty map; clear refs |
| Org or member changes | Clear refs before new context’s first load |

Context key: `` `${organizationId}:${memberUserKey}` `` — `nowBucket` is **not** part of the cache key, so minute ticks reuse the prior map until the new result arrives.

## Files

- `lender-app/hooks/useHubTriageHighlightMap.ts` — sticky ref + context guard

## Validation

- `npm run build` (from `lender-app/`)
- Production: `npm run deploy:prod` → https://dlcfunds.vercel.app (`dpl_5V6wUS2fQ3W1DEtxhVmuuYaHNZEf`)

## Manual check

1. Hub client view with a labeled open task — colors visible on file/project/client.
2. Wait 2–3 minutes — colors should **not** flash off at minute boundaries.
3. Complete task — colors clear once (real data change).
4. Switch organization — no colors from previous org until new org map loads.

## Real-time behavior

Convex subscription unchanged; task/label mutations still push new maps. Only the **loading gap** between arg changes is masked.
