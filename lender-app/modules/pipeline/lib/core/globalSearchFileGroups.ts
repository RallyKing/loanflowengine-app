/** Group global-search file hits Client → Project for palette display. */

export type GlobalSearchFileHit = {
  kind: "file";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  clientLabel?: string;
  projectLabel?: string;
  clientKey?: string;
  projectKey?: string;
  ownershipLine?: string;
  ownershipBadge?: string | null;
  matchedRelationship?: string;
};

export type GlobalSearchFileGroup = {
  clientKey: string;
  clientLabel: string;
  projects: Array<{
    projectKey: string;
    projectLabel: string;
    hits: GlobalSearchFileHit[];
  }>;
};

export function groupGlobalSearchFileHits(
  hits: GlobalSearchFileHit[],
): GlobalSearchFileGroup[] {
  const clientMap = new Map<string, GlobalSearchFileGroup>();
  for (const hit of hits) {
    const clientKey = hit.clientKey ?? "unknown-client";
    const clientLabel = hit.clientLabel ?? "Client";
    let client = clientMap.get(clientKey);
    if (!client) {
      client = { clientKey, clientLabel, projects: [] };
      clientMap.set(clientKey, client);
    }
    const projectKey = hit.projectKey ?? "unknown-project";
    const projectLabel = hit.projectLabel ?? "Project";
    let project = client.projects.find((p) => p.projectKey === projectKey);
    if (!project) {
      project = { projectKey, projectLabel, hits: [] };
      client.projects.push(project);
    }
    project.hits.push(hit);
  }
  return [...clientMap.values()].sort((a, b) =>
    a.clientLabel.localeCompare(b.clientLabel),
  );
}
