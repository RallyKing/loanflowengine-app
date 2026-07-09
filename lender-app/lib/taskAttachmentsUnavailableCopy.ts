/**
 * Single source of truth for the task-attachments degraded state (Convex query
 * failures, missing functions, or deployment skew).
 */
export const TASK_ATTACHMENTS_UNAVAILABLE_MESSAGE =
  "Attachments unavailable. File queries could not load (the backend may be out of sync). From lender-app run `npm run dev` (or `npm run convex:deploy:prod` for production), then `npm run live:check` and refresh.";

export const TASK_ATTACHMENTS_UNAVAILABLE_HINT =
  "You can still open, view, and edit this task and its subtasks.";
