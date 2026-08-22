# Feature completion checklist

**Printable / PR embedding.** Mirrors `feature-completion-policy.md`.

---

## Gates

- [ ] **Desktop** exercised
- [ ] **Mobile** exercised (UI/layout/scroll/sticky/drawer/responsive)
- [ ] **Tablet** exercised if layout diverges
- [ ] **Loading** state
- [ ] **Empty** state
- [ ] **Error** state / retry
- [ ] **Permissions / org scope** validated server-side
- [ ] **Accessibility** (keyboard, focus, reduced motion)
- [ ] **Performance** sane on large data (virtualize if needed)
- [ ] **`npm run qa:governance`** (unless exempt — state reason)
- [ ] **`npm run deploy:prod`** + prod smoke if shipping

---

## Convex resource & cost gates (if the change touches Convex functions, crons, schedulers, `useQuery` args, or write paths)

Full rules: **`resource-consumption-policy.md`** (§7 checklist, §D load-check gate).

- [ ] **`npm run verify:resource-safety`** green (also runs inside `npm run build`; includes `verify:convex-reactivity`)
- [ ] **Load-check on a local dev backend** — flow performed once, calls counted in the `npx convex dev` log
- [ ] **Idle silence** — 60s idle after the flow produces **zero** new Convex calls
- [ ] **No subscription churn** — `window.__dlcConvexCostReport()` shows `duplicateSubscriptions === 0` and near-zero arg churn
- [ ] **Cron registry table** in `resource-consumption-policy.md` §C updated if `convex/crons.ts` changed
- [ ] **Convex Insights → top functions** checked after deploy (and again ~24h later)

---

## Convex reactivity & React correctness (same Convex-touching changes)

Full rules: **`convex-reactivity-policy.md`** (§8 checklist, §6 architectural validation). Do not treat this as a second cost list.

- [ ] Data path matches the decision table (`useQuery` / `useMutation` / action / webhook / user-triggered aggregate / `preloadQuery`)
- [ ] No `useState`+`useEffect` mirror of a live query used for rendering; no refresh-key / remount-`key` hacks
- [ ] `useEffect` deps exhaustive; new `exhaustive-deps` disables carry `// reactivity-allow: <reason>`
- [ ] Mutations skip no-op patches; submit disabled while in-flight
- [ ] **Dev-backend architectural check** — no unexpected repeat invocations, no subscription storms on interaction, effects once per meaningful change, no-op writes skipped (**never** in production)

---

## Doc updates (if applicable)

- [ ] `canonical-system-map.md` / `route-ownership-map.md` / `state-ownership-map.md`
- [ ] **`runtime-workspace-scroll-authority.md`** + `workspace-sheet-governance.md` if pipeline file scroll, Vaul, or `<main>` mode changes
- [ ] `duplicate-system-watchlist.md` if touching overlap zones

---

## Related

- `documentation-sync-policy.md`
- `docs/testing/governance-qa-checklist.md`
- `convex-reactivity-policy.md`
- `resource-consumption-policy.md`
