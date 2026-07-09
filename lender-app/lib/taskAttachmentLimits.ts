/**
 * Chunk size for `api.tasks.countTaskFilesForTasks`: the handler batches DB
 * work in slices of this many task ids and merges results, so clients can pass
 * arbitrarily large id sets (e.g. full filtered matrix) without a silent cap.
 */
export const MAX_TASK_IDS_FOR_ATTACHMENT_BATCH = 300;
