/**
 * Convex cron intervals for durable-job *backup* sweeps.
 *
 * Enqueue paths already call `ctx.scheduler.runAfter` for the real send/execute.
 * These crons only recover missed fires. Every tick is a billed function call
 * even when the due query is empty — keep them rare.
 */
export const DURABLE_JOB_BACKUP_SWEEP_MINUTES = 15 as const;
