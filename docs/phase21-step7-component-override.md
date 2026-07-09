# Phase 21.7 — UI Surface Verification & Component Ghost-Fixing

Production showed no visible Phase 21.6 triage UI despite code in `TasksOnFileSection.tsx`. This phase **hard-wires** the canonical block surface and deploys to the **`loanflowengine`** Vercel project (`dlcfunds.vercel.app`).

## Root cause

1. **Wrong deploy target** — prior deploys used the linked `lender-app` project (`lender-app-zeta.vercel.app`), not **`loanflowengine`**.
2. **Indirect mount path** — triage UI lived under `components/pipeline/tasks/TasksOnFileSection.tsx` without a registry-aligned `blocks/` entry (unlike `FileNotesBlock`).
3. **`lazyMount` on Tasks collapsible** — delayed first paint until expand; combined with collapsed default layout, the composer looked “missing”.

## Fix

| Change | Detail |
|--------|--------|
| `components/pipeline/blocks/FileTasksBlock.tsx` | **Canonical** triage block (composer + feed) |
| `PipelineFileWorkspace.tsx` | Imports **`FileTasksBlock`** directly; `id="pipeline-block-tasks"` |
| `TasksOnFileSection.tsx` | Thin re-export alias only (deprecated) |
| `lazyMount` removed | Tasks section content mounts whenever the section is open |
| `?block=tasks` | Expands + scrolls to tasks (parity with file notes) |
| Console diagnostics | `Rendering NEW Triage Composer` + `Rendering NEW FileTasksBlock` |
| Registry | `componentReference` → `FileTasksBlock.tsx` |

## Browser verification

1. Open DevTools console.
2. Navigate to `/pipeline/{fileId}` and expand **Tasks**.
3. Expect logs:
   - `[Phase 21.7] Rendering NEW FileTasksBlock (triage composer + feed)`
   - `Rendering NEW Triage Composer`
4. Expect UI: **Mark urgent**, **Schedule**, 8 color swatches when toggled, `data-testid="file-task-triage-composer"`.

If you see **no** logs and a plain single-line “Add task” input, you are on a stale deployment or the Tasks block is hidden in drawer layout settings.

## Deploy (canonical prod)

```bash
cd lender-app
npm run clean
npm run build
npx vercel@latest deploy --prod --yes --project loanflowengine
```

Production URL: **https://dlcfunds.vercel.app**
