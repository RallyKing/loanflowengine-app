/**
 * Project time-stable hub triage candidates against a local evaluation clock.
 *
 * The heavy Convex query returns candidates with timestamps; minute ticks only
 * re-run this pure projection — they must not change Convex subscription args.
 */
import type { TriageHighlightEntry } from "./hubTriageHighlight";

export type HubTriageLabelCandidate = TriageHighlightEntry & {
  scheduledTriggerTime?: number;
  snoozedUntil?: number;
};

export type HubTriageOpenCandidate = {
  status: "todo" | "in_progress";
  dueDate?: number;
  snoozedUntil?: number;
};

export type HubTriageFileCandidate = {
  fileId: string;
  projectKey: string;
  clientKey: string;
  labels: HubTriageLabelCandidate[];
  open: HubTriageOpenCandidate[];
};

export type ProjectedHubTriageHighlightMap = {
  files: Record<string, TriageHighlightEntry>;
  projects: Record<string, TriageHighlightEntry>;
  clients: Record<string, TriageHighlightEntry>;
  counts: {
    files: Record<
      string,
      { open: number; overdue: number; topStatus: "todo" | "in_progress" | null }
    >;
    projects: Record<
      string,
      { open: number; overdue: number; topStatus: "todo" | "in_progress" | null }
    >;
    clients: Record<
      string,
      { open: number; overdue: number; topStatus: "todo" | "in_progress" | null }
    >;
  };
};

type Rollup = {
  open: number;
  overdue: number;
  topStatus: "todo" | "in_progress" | null;
};

function mergeRollupCounts(current: Rollup | undefined, add: Rollup): Rollup {
  if (!current) return { ...add };
  return {
    open: current.open + add.open,
    overdue: current.overdue + add.overdue,
    topStatus:
      current.topStatus === "in_progress" || add.topStatus === "in_progress"
        ? "in_progress"
        : (current.topStatus ?? add.topStatus),
  };
}

function pickStrongerEntry(
  current: TriageHighlightEntry | undefined,
  candidate: TriageHighlightEntry,
): TriageHighlightEntry {
  if (!current) return candidate;
  if (candidate.severityWeight > current.severityWeight) return candidate;
  if (candidate.severityWeight < current.severityWeight) return current;
  return String(candidate.sourceTaskId) > String(current.sourceTaskId)
    ? candidate
    : current;
}

function toEntry(candidate: HubTriageLabelCandidate): TriageHighlightEntry {
  return {
    triageLabelId: candidate.triageLabelId,
    label: candidate.label,
    colorToken: candidate.colorToken,
    severityWeight: candidate.severityWeight,
    sourceTaskId: candidate.sourceTaskId,
    sourceTaskTitle: candidate.sourceTaskTitle,
    hexCode: candidate.hexCode,
  };
}

/** True when a labeled candidate is active at `now` (schedule fired, not snoozed). */
export function labelCandidateActiveAt(
  candidate: Pick<
    HubTriageLabelCandidate,
    "scheduledTriggerTime" | "snoozedUntil"
  >,
  now: number,
): boolean {
  if (
    typeof candidate.snoozedUntil === "number" &&
    candidate.snoozedUntil > now
  ) {
    return false;
  }
  if (
    typeof candidate.scheduledTriggerTime === "number" &&
    candidate.scheduledTriggerTime > now
  ) {
    return false;
  }
  return true;
}

export function emptyProjectedHubTriageHighlightMap(): ProjectedHubTriageHighlightMap {
  return {
    files: {},
    projects: {},
    clients: {},
    counts: { files: {}, projects: {}, clients: {} },
  };
}

/**
 * Apply schedule / snooze / overdue gates at `now` without re-querying Convex.
 */
export function projectHubTriageHighlightMap(
  candidates: ReadonlyArray<HubTriageFileCandidate> | null | undefined,
  now: number,
): ProjectedHubTriageHighlightMap {
  if (!candidates?.length) return emptyProjectedHubTriageHighlightMap();

  const files: Record<string, TriageHighlightEntry> = {};
  const fileCounts: Record<string, Rollup> = {};
  const fileMeta = new Map<string, { projectKey: string; clientKey: string }>();

  for (const file of candidates) {
    const fileId = file.fileId.trim();
    if (!fileId) continue;
    fileMeta.set(fileId, {
      projectKey: file.projectKey,
      clientKey: file.clientKey,
    });

    for (const open of file.open) {
      if (
        typeof open.snoozedUntil === "number" &&
        open.snoozedUntil > now
      ) {
        continue;
      }
      const overdue =
        typeof open.dueDate === "number" && open.dueDate < now ? 1 : 0;
      fileCounts[fileId] = mergeRollupCounts(fileCounts[fileId], {
        open: 1,
        overdue,
        topStatus: open.status === "in_progress" ? "in_progress" : "todo",
      });
    }

    for (const label of file.labels) {
      if (!labelCandidateActiveAt(label, now)) continue;
      files[fileId] = pickStrongerEntry(files[fileId], toEntry(label));
    }
  }

  const projects: Record<string, TriageHighlightEntry> = {};
  const projectToClient = new Map<string, string>();
  for (const [fileId, entry] of Object.entries(files)) {
    const meta = fileMeta.get(fileId);
    if (!meta?.projectKey) continue;
    projects[meta.projectKey] = pickStrongerEntry(
      projects[meta.projectKey],
      entry,
    );
    if (meta.clientKey) projectToClient.set(meta.projectKey, meta.clientKey);
  }

  const clients: Record<string, TriageHighlightEntry> = {};
  for (const [projectKey, entry] of Object.entries(projects)) {
    const clientKey = projectToClient.get(projectKey);
    if (!clientKey) continue;
    clients[clientKey] = pickStrongerEntry(clients[clientKey], entry);
  }

  const projectCounts: Record<string, Rollup> = {};
  const clientCounts: Record<string, Rollup> = {};
  for (const [fileId, rollup] of Object.entries(fileCounts)) {
    const meta = fileMeta.get(fileId);
    if (!meta) continue;
    if (meta.projectKey) {
      projectCounts[meta.projectKey] = mergeRollupCounts(
        projectCounts[meta.projectKey],
        rollup,
      );
    }
    if (meta.clientKey) {
      clientCounts[meta.clientKey] = mergeRollupCounts(
        clientCounts[meta.clientKey],
        rollup,
      );
    }
  }

  return {
    files,
    projects,
    clients,
    counts: {
      files: fileCounts,
      projects: projectCounts,
      clients: clientCounts,
    },
  };
}
