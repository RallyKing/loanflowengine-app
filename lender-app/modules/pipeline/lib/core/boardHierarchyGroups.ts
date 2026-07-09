import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";

export type BoardHierarchyGroup = {
  groupKey: string;
  clientDisplayName: string;
  projectDisplayTitle: string;
  rows: PipelineTablePreviewRow[];
};

export function groupBoardRowsByHierarchy(
  rows: PipelineTablePreviewRow[],
): BoardHierarchyGroup[] {
  const map = new Map<string, BoardHierarchyGroup>();
  for (const row of rows) {
    const clientName = row.clientDisplayName?.trim() || "Client";
    const projectTitle = row.projectDisplayTitle?.trim() || "Project";
    const groupKey = `${row.clientId ?? clientName}:${row.projectId ?? projectTitle}`;
    let g = map.get(groupKey);
    if (!g) {
      g = {
        groupKey,
        clientDisplayName: clientName,
        projectDisplayTitle: projectTitle,
        rows: [],
      };
      map.set(groupKey, g);
    }
    g.rows.push(row);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.rows.sort((a, b) => (b.fundingAmount ?? 0) - (a.fundingAmount ?? 0));
  }
  groups.sort((a, b) =>
    `${a.clientDisplayName}:${a.projectDisplayTitle}`.localeCompare(
      `${b.clientDisplayName}:${b.projectDisplayTitle}`,
    ),
  );
  return groups;
}
