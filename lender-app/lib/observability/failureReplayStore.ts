import { redactDeep } from "./redact";
import { obsLog } from "./logger";

export type FailureReplayEntry = {
  id: string;
  receivedAt: string;
  source: string;
  errorCode?: string;
  summary?: string;
  payload: unknown;
};

const MAX = 100;
const store: FailureReplayEntry[] = [];

function replayEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.DLC_FAILURE_REPLAY === "1"
  );
}

export function pushFailureReplay(entry: Omit<FailureReplayEntry, "id" | "receivedAt" | "payload"> & {
  payload?: unknown;
}): FailureReplayEntry | null {
  if (!replayEnabled()) return null;
  const row: FailureReplayEntry = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    payload: redactDeep(entry.payload ?? {}),
    source: entry.source,
    errorCode: entry.errorCode,
    summary: entry.summary,
  };
  store.push(row);
  while (store.length > MAX) store.shift();
  obsLog("info", "replay.captured", {
    replayId: row.id,
    source: row.source,
    errorCode: row.errorCode,
  });
  return row;
}

export function listFailureReplays(): FailureReplayEntry[] {
  return [...store];
}

export function clearFailureReplays(): void {
  store.length = 0;
}
