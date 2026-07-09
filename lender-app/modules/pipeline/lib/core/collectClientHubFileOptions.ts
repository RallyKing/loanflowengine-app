import type { Id } from "@/convex/_generated/dataModel";
import type { HubClientNode } from "@/lib/pipeline/hubHierarchyTree";
import { pipelineFileRowClientLabel } from "@/lib/pipeline/pipelineFileRowHierarchyLabels";

export type ClientHubFileOption = {
  fileId: Id<"pipeline">;
  fileTitle: string;
  projectTitle: string;
};

/**
 * Flatten all loan files under a hub client node for client-scoped note targeting.
 */
export function collectClientHubFileOptions(
  client: HubClientNode,
): ClientHubFileOption[] {
  const options: ClientHubFileOption[] = [];
  const seen = new Set<string>();

  for (const project of client.projects) {
    const projectTitle = project.title.trim() || "Untitled project";
    for (const loan of project.loans) {
      const fileId = loan.row._id;
      const key = String(fileId);
      if (seen.has(key)) continue;
      seen.add(key);
      const fileTitle =
        loan.row.fileName?.trim() ||
        pipelineFileRowClientLabel(loan.row) ||
        "Untitled file";
      options.push({ fileId, fileTitle, projectTitle });
    }
  }

  options.sort((a, b) => {
    const projectCmp = a.projectTitle.localeCompare(b.projectTitle);
    if (projectCmp !== 0) return projectCmp;
    return a.fileTitle.localeCompare(b.fileTitle);
  });

  return options;
}
