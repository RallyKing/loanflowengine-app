## Phase 18.8F — Modal positioning forensics

### Reported UX failure

The delete modal felt **pinned to the right**, claustrophobic, and side-panel-like — not centered, dominant, or operationally comfortable on desktop.

---

## Layout chain (pre-18.8F)

```
document.body
└─ [data-destructive-confirm-root]  fixed inset-0 flex
   ├─ scrim
   └─ [data-destructive-confirm-host]  flex child OR bottom-sheet child
```

### Root causes (proven)

| ID | Cause | Mechanism | Visual effect |
|----|--------|-----------|----------------|
| **PF-1** | **Viewport-centered flex** (`justify-center` on full viewport) | Modal X-center = `50vw`, while SaaS **main column** center = `sidebar + (viewport − sidebar) / 2` → offset **~128px right** of viewport center when sidebar is `w-64` | Modal mass sits **right-heavy** in the workspace; feels edge-anchored |
| **PF-2** | **Unified shell** `align: center \| bottom-sheet` | Sheet used `items-end` + `sm:items-center` hybrid; desktop still shared width tokens with sheet | Sheet DNA on breakpoints; not a true desktop modal |
| **PF-3** | **Footer `md:justify-between`** | Cancel pinned left of footer, danger cluster pinned right | Action weight on **right edge** of panel → reinforces “stuck to the right” |
| **PF-4** | **Danger zone `md:justify-end`** | Typed confirm + delete hug right inside danger box | Right-side compression inside an already right-biased panel |
| **PF-5** | **Narrow fixed max-width (560px)** without workspace anchor | Correct width but wrong **anchor point** | “Floating side card” rather than workspace-centered overlay |

### What 18.8A–18.8E fixed (and did not)

- Fixed internal shrink, portal, footer nesting, timeouts — **did not** change **where** the panel is anchored in the viewport/workspace.
- 18.8E still centered on **viewport**, not **main scroll column**.

---

## 18.8F correction

1. **Split presentation**: `desktop-modal` vs `mobile-sheet` (no shared positioning logic).
2. **Desktop anchor**: `measureWorkspaceAnchor()` from `#app-main-scroll` / `[data-app-shell-root]` → `position: fixed; left; top; transform: translate(-50%, -50%)`.
3. **Desktop size**: `clamp(440px, 42vw, 620px)`, `max-h: min(82vh, 760px)`.
4. **Footer**: `justify-center` action cluster — no `justify-between`.
5. **Stable error slot**: `min-h-[3.25rem]` in footer.

---

## Verification signals

In DevTools on desktop:

- `[data-presentation="desktop-modal"]` on host
- Host `transform` includes `translate(-50%, -50%)`
- Host center ≈ center of `#app-main-scroll` bounding rect (not raw viewport if sidebar open)
