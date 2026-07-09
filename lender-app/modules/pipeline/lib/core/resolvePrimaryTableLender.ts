import type { Id } from "@/convex/_generated/dataModel";

/** At-a-glance lender on pipeline table rows (Phase 26.3). */
export type PrimaryTableLenderPreview = {
  lenderId: Id<"lenders">;
  company: string;
  /** `selected` = chosen lender; `newest` = latest active (non-declined) link. */
  source: "selected" | "newest";
};

export type FileLenderEdgeLite = {
  lenderId: Id<"lenders">;
  relationshipType: string;
  /** `fileLenders.createdAt` — used for newest-active fallback. */
  createdAt: number;
};

/**
 * Priority: junction `selected` (or pipeline `selectedLenderId` when active) →
 * newest non-declined edge by `createdAt` → last id on `pipeline.lenders[]`.
 */
export function resolvePrimaryTableLender(args: {
  selectedLenderId?: Id<"lenders">;
  pipelineLenderIds: Id<"lenders">[];
  edges: FileLenderEdgeLite[];
  lenderLabelById: Map<string, string>;
}): PrimaryTableLenderPreview | null {
  const declined = new Set(
    args.edges
      .filter((e) => e.relationshipType === "declined")
      .map((e) => String(e.lenderId)),
  );

  const labelFor = (id: Id<"lenders">): string =>
    args.lenderLabelById.get(String(id))?.trim() || "Lender";

  const selectedEdge = args.edges.find(
    (e) =>
      e.relationshipType === "selected" &&
      !declined.has(String(e.lenderId)),
  );
  if (selectedEdge) {
    return {
      lenderId: selectedEdge.lenderId,
      company: labelFor(selectedEdge.lenderId),
      source: "selected",
    };
  }

  if (
    args.selectedLenderId != null &&
    !declined.has(String(args.selectedLenderId))
  ) {
    return {
      lenderId: args.selectedLenderId,
      company: labelFor(args.selectedLenderId),
      source: "selected",
    };
  }

  const activeEdges = args.edges.filter(
    (e) => e.relationshipType !== "declined",
  );
  if (activeEdges.length > 0) {
    const newest = [...activeEdges].sort((a, b) => b.createdAt - a.createdAt)[0]!;
    return {
      lenderId: newest.lenderId,
      company: labelFor(newest.lenderId),
      source: "newest",
    };
  }

  for (let i = args.pipelineLenderIds.length - 1; i >= 0; i--) {
    const id = args.pipelineLenderIds[i]!;
    if (declined.has(String(id))) continue;
    const company = args.lenderLabelById.get(String(id))?.trim();
    if (company) {
      return { lenderId: id, company, source: "newest" };
    }
  }

  return null;
}
