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

## Doc updates (if applicable)

- [ ] `canonical-system-map.md` / `route-ownership-map.md` / `state-ownership-map.md`
- [ ] **`runtime-workspace-scroll-authority.md`** + `workspace-sheet-governance.md` if pipeline file scroll, Vaul, or `<main>` mode changes
- [ ] `duplicate-system-watchlist.md` if touching overlap zones

---

## Related

- `documentation-sync-policy.md`
- `docs/testing/governance-qa-checklist.md`
