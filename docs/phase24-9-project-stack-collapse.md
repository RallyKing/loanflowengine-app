# Phase 24.9 — Project view subsection default collapse

**Date:** 2026-05-29  
**Production target:** `loanflowengine` (paperworkprocessing.com)

## Problem

On Pipeline hub **Project** projection (and expanded project rows in **Client** view), **Project clients** and **Capital stack** always rendered fully expanded with no chevron — noisy and not aligned with Phase 24.8 hub collapse patterns.

## Solution

| Artifact | Role |
|----------|------|
| `HubCollapsibleSubsection.tsx` | Chevron header + grid collapse animation |
| `hubProjectSubsectionExpansion.ts` | Per-project persistence (`clients` / `capitalStack`); **default collapsed** when key missing |
| `HubProjectDetailSubsections.tsx` | Shared mount for both subsection editors |
| `LinkedClientsEditor` / `ProjectCapitalStackEditor` | `suppressTitle` — header owned by collapsible wrapper |

## Default state

- Initial mount: **collapsed** (`expanded === false`)
- localStorage key: `dlc.pipeline.hub.project-subsection.v1`
- Stored value `true` only when user explicitly expanded a subsection

## Surfaces

1. **Client** hierarchy — project row nested area (`PipelineHubHierarchyView`)
2. **Project** projection — `ProjectFocusSection` (`PipelineHubProjectionView`)

## Verification

1. Pipeline hub → **Project** projection mode.
2. Expand a project card.
3. **Project clients** and **Capital stack** show as collapsed headers with right-facing chevron.
4. Click chevron → section expands; chevron rotates down.
5. Refresh page → still collapsed unless you had expanded (persisted).

## Deploy

`npm run deploy:prod` from `lender-app/` → `--project loanflowengine`.
