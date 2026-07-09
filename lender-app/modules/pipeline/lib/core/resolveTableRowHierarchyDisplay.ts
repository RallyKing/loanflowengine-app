import type { Doc } from "@/convex/_generated/dataModel";
import type { PipelineRowGraphLinks } from "@/convex/pipelineGraphPreviewLinks";
import {
  legacyClientProjectFromDealData,
  type ResolvedFileHierarchy,
} from "@/lib/pipelineHierarchy";

function trimStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v !== "string") return String(v).trim();
  return v.trim();
}

function intakeBorrowerLabel(intake: Doc<"intakeSheets"> | null): string {
  if (!intake) return "";
  const client = trimStr(intake.clientName);
  if (client) return client;
  const b = intake.business;
  if (b) {
    return [trimStr(b.legalName), trimStr(b.dba)].filter(Boolean).join(" · ");
  }
  return "";
}

function intakeProjectLabel(intake: Doc<"intakeSheets"> | null): string {
  if (!intake) return "";
  return trimStr(intake.projectName);
}

function primaryLinkedClientName(
  hierarchy: ResolvedFileHierarchy,
): string {
  const primary =
    hierarchy.linkedClients.find((c) => c.isAuthoritativePrimary) ??
    hierarchy.linkedClients[0];
  return primary?.displayName?.trim() ?? "";
}

function graphClientLabel(graphLinks?: PipelineRowGraphLinks): string {
  const clients = graphLinks?.clients ?? [];
  const primary =
    clients.find((c) => c.relationshipType === "primary") ?? clients[0];
  return primary?.label?.trim() ?? "";
}

function graphProjectLabel(graphLinks?: PipelineRowGraphLinks): string {
  const projects = graphLinks?.projects ?? [];
  const primary =
    projects.find((p) => p.relationshipType === "primary") ?? projects[0];
  return primary?.label?.trim() ?? "";
}

/**
 * Phase 26.4 — canonical client label for pipeline table/board rows.
 * Never relies on a single FK field; merges hierarchy, junction, graph, and deal payload.
 */
export function resolveTableRowClientDisplayName(args: {
  hierarchy: ResolvedFileHierarchy;
  intake: Doc<"intakeSheets"> | null;
  pipeline: Pick<Doc<"pipeline">, "dealData" | "fileName">;
  graphLinks?: PipelineRowGraphLinks;
  /** Direct `clients` row when `pipeline.clientId` is set (optional batch lookup). */
  clientRecordLabel?: string;
}): string {
  const fromRecord = args.clientRecordLabel?.trim();
  if (fromRecord) return fromRecord;

  const fromHierarchy =
    args.hierarchy.client.kind === "record"
      ? args.hierarchy.client.displayName?.trim()
      : args.hierarchy.client.displayName?.trim();
  if (fromHierarchy) return fromHierarchy;

  const fromLinked = primaryLinkedClientName(args.hierarchy);
  if (fromLinked) return fromLinked;

  const fromGraph = graphClientLabel(args.graphLinks);
  if (fromGraph) return fromGraph;

  const fromIntake = intakeBorrowerLabel(args.intake);
  if (fromIntake) return fromIntake;

  const legacy = legacyClientProjectFromDealData(
    args.pipeline.dealData,
    args.pipeline.fileName,
  );
  return legacy.clientName.trim() || "";
}

/**
 * Phase 26.4 — canonical project title for pipeline table/board rows.
 */
export function resolveTableRowProjectDisplayTitle(args: {
  hierarchy: ResolvedFileHierarchy;
  intake: Doc<"intakeSheets"> | null;
  pipeline: Pick<Doc<"pipeline">, "dealData" | "fileName">;
  graphLinks?: PipelineRowGraphLinks;
  /** Direct `projects.title` when `pipeline.projectId` is set. */
  projectRecordTitle?: string;
}): string {
  const fromRecord = args.projectRecordTitle?.trim();
  if (fromRecord) return fromRecord;

  const fromHierarchy =
    args.hierarchy.project.kind === "record"
      ? args.hierarchy.project.title?.trim()
      : args.hierarchy.project.title?.trim();
  if (fromHierarchy) return fromHierarchy;

  const fromGraph = graphProjectLabel(args.graphLinks);
  if (fromGraph) return fromGraph;

  const fromIntake = intakeProjectLabel(args.intake);
  if (fromIntake) return fromIntake;

  const legacy = legacyClientProjectFromDealData(
    args.pipeline.dealData,
    args.pipeline.fileName,
  );
  return legacy.projectName.trim() || "";
}
