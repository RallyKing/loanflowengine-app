## Phase 18.8E — Delete modal layout forensics

### Failure state (production, pre-18.8E)

Desktop delete confirmation was horizontally compressed, vertically cramped, with collapsing footer actions — unusable despite 18.8A–18.8D passes.

---

## Layout tree (pre-reconstruction)

```
document.body
└─ [portal] OverlayShell root (fixed inset-0 flex)          ← flex formatting context
   ├─ scrim (absolute inset-0)
   └─ wrapPanel=false host (relative mx-auto w-full max-w-[28rem] shrink-0)  ← WIDTH CAP #1
      └─ OP_CONFIRM_PANEL (w-full max-w-[28rem] flex-col overflow-hidden)   ← WIDTH CAP #2 (duplicate)
         ├─ header (shrink-0)
         ├─ OP_CONFIRM_BODY (min-h-0 flex-1 overflow-y-auto)
         └─ footer (min-w-0 shrink-0)                                         ← SHRINK ALLOWED
            └─ OP_CONFIRM_ACTIONS (min-w-0 flex-col sm:flex-row)
               ├─ cancel zone (shrink-0)
               └─ OP_CONFIRM_DANGER_ZONE (flex-1 min-w-0)                    ← COMPRESSION SOURCE
```

**In-tree variant (file delete before portal):** same panel nested under drawer → `[data-pipeline-workspace-scroll]` → snap header (`transform: scale`) → fixed positioning trapped in small containing block.

---

## Root cause map

| ID | Container / rule | Constraint | Symptom |
|----|------------------|------------|---------|
| RC-1 | `max-w-[min(100%,28rem)]` on host **and** panel | Hard cap **448px** on desktop (not 560px spec) | Horizontal compression |
| RC-2 | Double width wrappers (`OverlayShell` + `OP_CONFIRM_PANEL`) | Nested `w-full` + duplicate max-width | Unstable width resolution in flex centering |
| RC-3 | `OP_CONFIRM_DANGER_ZONE` → `flex-1 min-w-0` | Flex shrink below content intrinsic width | Footer buttons/typed input squish |
| RC-4 | `OP_CONFIRM_ACTIONS` / footer → `min-w-0` | Permits footer row to shrink under host width | Vertical/horizontal cramp |
| RC-5 | `sm:items-stretch` on action row | Stretch distorts button zones | Uneven footer height |
| RC-6 | Error text inside scroll body | Footer jumps when error appears | Unstable footer during failure |
| RC-7 | No `isolate` on overlay root | Stacking vs workspace chrome edge cases | Overlay under chrome (intermittent) |
| RC-8 | Pre-18.8D: no portal / in-tree placement | `transform` on workspace snap header | Modal painted inside clipped sub-rectangle |

---

## Why 18.8A–18.8D failed

| Phase | What it did | Why insufficient |
|-------|-------------|------------------|
| 18.8A–B | Safe-area, file delete timeout/redirect | Did not fix modal geometry |
| 18.8C | Button `shrink-0`, mutation state machine, footer token tweaks | Still left **28rem cap** and **flex-1/min-w-0** danger zone |
| 18.8D | Portal to `document.body`, sibling footer zones, removed some `pending` cancel block | **Kept double wrapper** and **448px max-width**; danger zone still had `flex-1 min-w-0` until 18.8E |

Cosmetic classes cannot overcome an architecture that (a) caps width at 448px, (b) allows footer flex shrink, and (c) stacks two competing width hosts.

---

## 18.8E reconstruction (summary)

New `DestructiveConfirmShell.tsx`:

- Single portal host on `document.body`
- **One** width constraint: `w-[min(560px,calc(100vw-32px))] min-w-[420px] max-w-[560px]`
- `isolate` + `MODAL` z-index
- Body scroll lock while open
- Shell `overflow-hidden`; **only** `OP_CONFIRM_BODY` scrolls
- Footer `shrink-0`, `min-h-[4.75rem]`, no `min-w-0` / `flex-1` on action zones
- Errors rendered in footer (stable chrome)

See `docs/phase18-step8E-delete-modal-reconstruction.md`.
