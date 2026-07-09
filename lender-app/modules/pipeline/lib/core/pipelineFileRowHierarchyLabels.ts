import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";

/** Shown on line 2 when no project title resolves (Phase 26.5). */
export const PIPELINE_FILE_ROW_DEFAULT_PROJECT = "General Project";

function parseBorrowerFromSourceLabel(
  sourceLabel: string | undefined,
): string | undefined {
  const raw = sourceLabel?.trim();
  if (!raw) return undefined;
  const who = raw.includes(" — ") ? raw.split(" — ").pop()!.trim() : raw;
  if (!who.includes(" · ")) return who || undefined;
  const client = who.split(" · ")[0]?.trim();
  return client || undefined;
}

function parseProjectFromSourceLabel(
  sourceLabel: string | undefined,
): string | undefined {
  const raw = sourceLabel?.trim();
  if (!raw) return undefined;
  const who = raw.includes(" — ") ? raw.split(" — ").pop()!.trim() : raw;
  if (!who.includes(" · ")) return undefined;
  const parts = who.split(" · ");
  const project = parts.slice(1).join(" · ").trim();
  return project || undefined;
}

/** Client label for pipeline file rows (table + hub list). */
export function pipelineFileRowClientLabel(
  row: PipelineTablePreviewRow,
): string | undefined {
  const primary = row.clientDisplayName?.trim();
  if (primary) return primary;
  const linked =
    row.linkedClients?.find((c) => c.isAuthoritativePrimary)?.displayName?.trim() ??
    row.linkedClients?.[0]?.displayName?.trim();
  if (linked) return linked;
  const graph =
    row.graphLinks?.clients.find((c) => c.relationshipType === "primary")
      ?.label?.trim() ?? row.graphLinks?.clients[0]?.label?.trim();
  if (graph) return graph;
  return parseBorrowerFromSourceLabel(row.sourceLabel);
}

/** Project title for pipeline file rows (table + hub list). */
export function pipelineFileRowProjectLabel(
  row: PipelineTablePreviewRow,
): string {
  const primary = row.projectDisplayTitle?.trim();
  if (primary) return primary;
  const graph =
    row.graphLinks?.projects.find((p) => p.relationshipType === "primary")
      ?.label?.trim() ?? row.graphLinks?.projects[0]?.label?.trim();
  if (graph) return graph;
  return (
    parseProjectFromSourceLabel(row.sourceLabel) ??
    PIPELINE_FILE_ROW_DEFAULT_PROJECT
  );
}

/** Line 1: "{fileTitle} · {client}" when client exists. */
export function pipelineFileRowPrimaryTitle(
  row: PipelineTablePreviewRow,
  fileTitle?: string,
): string {
  const title = (fileTitle ?? row.fileName).trim() || "Untitled file";
  const client = pipelineFileRowClientLabel(row);
  return client ? `${title} · ${client}` : title;
}
