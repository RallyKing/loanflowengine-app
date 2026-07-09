# Phase 23 — Task Library: Templates, Attachments & Programmatic Grouping

Phase 23 introduces a database-backed **task playbook** system — groups of reusable task definitions with optional triage labels and file attachments that brokers apply in one click from a pipeline file.

## Schema

### `taskTemplateGroups`

| Field | Purpose |
|-------|---------|
| `organizationId` | Tenant scope |
| `name` | e.g. "SBA 504", "Lender: Chase" |
| `description` | Optional group summary |

### `taskTemplates`

| Field | Purpose |
|-------|---------|
| `templateGroupId` | Parent playbook group |
| `title`, `description` | Task definition |
| `triageLabelId` | Optional Phase 22 label |
| `attachmentStorageId` | Convex `_storage` blob (cloned on apply) |
| `attachmentFileName`, etc. | Attachment metadata |

## API (`convex/taskTemplateLibrary.ts`)

| Function | Role |
|----------|------|
| `listTemplateGroups` | Groups + template counts |
| `listTemplatesInGroup` | Ordered templates in a group |
| `upsertTemplateGroup` | Admin create/update group |
| `upsertTaskTemplate` | Admin create/update template + attachment |
| `deleteTemplateGroup` / `deleteTaskTemplate` | Admin cleanup |
| `generateTemplateAttachmentUploadUrl` | Admin file upload |
| `applyTemplateGroupToFile` | Bulk clone tasks + attachments onto a file |

## Admin UI

**`/settings/tasks/library`** — `TaskTemplateLibraryManager`

- Create playbook groups (loan programs, lenders, workflows)
- Add task templates with triage labels and template file attachments
- Linked from Settings → Organization → **Open task library**

## Pipeline apply UI

**File drawer → Tasks** — **Browse templates** button (next to Add task)

- Opens modal listing playbook groups
- Selecting a group runs `applyTemplateGroupToFile`
- Creates tasks with labels; links template attachment storage to each new task (shared blob reference)

## Verification

1. Admin: `/settings/tasks/library` → create "SBA 504" group + tasks with attachments
2. Broker: open pipeline file → Tasks → **Browse templates** → apply group
3. Confirm tasks, labels, and downloadable attachments appear
4. `npm run build` passes

## Deploy

```bash
cd lender-app
npm run convex:codegen
npm run convex:deploy:prod
npm run build
npx vercel@latest deploy --prod --yes --project loanflowengine
```
