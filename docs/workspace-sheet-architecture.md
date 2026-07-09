# Workspace sheet architecture

**Binding context:** **`docs/governance/runtime-workspace-scroll-authority.md`** — reconciled scroll/sheet mental model for onboarding and reviews.

## Summary

The pipeline **file** experience (`/pipeline/[convexFileId]`) uses a **workspace sheet**: fixed app shell, non-scrolling `<main>`, and an inner **scrollport** for blocks and utilities.

## Layering

```
AppChrome (fixed)
└── main [data-main-scroll-mode="workspace-delegated"]  ← overflow-y hidden on file route
    └── PipelineWorkspaceMobileVaulFrame (mobile: Vaul top sheet + snap)
        └── [data-pipeline-workspace-sheet]
            ├── Snap header (shrink-0, banner role)
            ├── Utilities (collapsible; default collapsed)
            ├── [data-pipeline-workspace-scroll]  ← sole vertical scroll owner
            └── [data-pipeline-workspace-overlay-layer] (reserved)
```

## Snap states (mobile)

| State      | Vaul snap (fraction of embed height) | UX |
|-----------|----------------------------------------|----|
| Compact   | ~0.22                                  | Minimal vertical footprint; title/stage chrome grid |
| Comfort   | ~0.58                                  | Intermediate |
| Expanded  | 1                                      | Full operational workspace |

`data-workspace-snap` reflects `compact` | `comfort` | `expanded` (desktop uses IO-driven compact vs expanded from `MobileChrome`; comfort only appears when Vaul context is active).

## Desktop

At `md+`, `PipelineWorkspaceMobileVaulFrame` is a pass-through: full-width integrated workspace, no drawer chrome.

## Dependencies

- **Vaul** — snap interpolation, pointer handling, keyboard-safe defaults (`repositionInputs`).
