## Phase 15 Step 9 — Universal Stage Sorting Across Projections

### Goal
Fix a client-side bug where **stage sort (funnel order)** did not apply consistently across projection modes (Client / Project / File / Lender / Referral / Team / Task).

### Root cause
The hub’s `sort` state was applied only to the **flat `filtered` rows list** in `PipelinePageClient.tsx`, but the projection builders in `lib/pipeline/graphProjection.ts`:

- Sorted **parents** (clients/projects/entities) by labels (A–Z)
- Sorted **children** (loan files within parents) by funding amount
- Did not receive the active sort state or stage ordering index, so stage ordering was effectively ignored once data was grouped.

### Fix (sorting state injection)
We injected the active hub sorting state into all projection `useMemo` builders by passing:

- `sort` (now supports both `stageAsc` and `stageDesc`)
- `stageIndex` (org-scoped stage/substage ordering from `useOrganizationPipelineStages`)

Key changes:

- `PipelinePageClient.tsx`: passes `{ sort, stageIndex }` into:
  - `buildClientFocusTree`
  - `buildProjectFocusTree`
  - `buildFileFlatList`
  - `buildLenderFocusTree` / `buildReferralFocusTree` / `buildTeamFocusTree`
  - `buildTaskFocusTree`
- `graphProjection.ts`: implements **stage-aware parent + child sorting** when `sort` is `stageAsc` / `stageDesc`.

### Hierarchical sorting rules implemented

#### Flat view (File Focus)
- Files are deduped and sorted by stage weight:
  - **Asc**: early → late
  - **Desc**: late → early

#### Hierarchical views (Client / Project / Lender / Referral / Team)
- **Child ordering**: files inside each parent are sorted by stage weight (asc/desc).
- **Parent ordering**: parents are sorted by the **most advanced file stage** among their underlying files.
  - “Most advanced” is computed as **max stage weight** across that parent’s files.
  - Direction is applied to that key:
    - **Desc**: higher max stage weight first
    - **Asc**: lower max stage weight first

This matches the requirement: in descending order, the parent with a file closest to “Funded” rises to the top.

#### Task focus
Tasks are sorted by their underlying file’s stage weight (asc/desc), then by label for stability.

### UI polish
- Added an explicit `stageDesc` sort option so users can directly select reverse funnel ordering.
- Projection expansion state is preserved because expansion is keyed by stable entity ids; changing sort only reorders arrays (no key churn, no reload).

### Performance constraints
- No new Convex queries/subscriptions were added.
- Sorting happens client-side inside existing `useMemo` pipelines, using already-fetched rows + existing `stageIndex`.

### Manual production proof (Joshua session)
On `/pipeline`:

- **File Focus**: set Sort → *Stage (funnel order · early → late)* and then *Stage (funnel order · late → early)*; confirm instant resort.
- **Project Focus**: confirm projects reorder based on **most advanced** file stage; expand a project and confirm files inside reorder by stage.
- **Client Focus**: confirm clients reorder based on **most advanced** file stage; expand a client and confirm files inside reorder by stage.
- **Expansion preservation**: expand a client/project, change stage sort direction, confirm the expanded state remains open.

### Validation
Executed:
- `npm run convex:codegen`
- `npm run build`
- `npm run convex:deploy:prod`
- `npm run deploy:prod`
- `npm run auth:validate`

### Stop gate
Phase 15 Step 9 complete. **STOP** and wait for review. Do not begin Phase 16.

