/** Nested folder blueprint stored on document task templates. */
export type FolderTemplateNode = {
  name: string;
  sortOrder: number;
  children?: FolderTemplateNode[];
};

export type FolderTemplateRow = {
  name: string;
  depth: number;
  sortOrder: number;
};

export function normalizeFolderTemplate(
  nodes: FolderTemplateNode[] | undefined | null,
): FolderTemplateNode[] {
  if (!nodes?.length) return [];
  return nodes
    .map((node, index) => ({
      name: node.name.trim(),
      sortOrder:
        typeof node.sortOrder === "number" && Number.isFinite(node.sortOrder)
          ? node.sortOrder
          : (index + 1) * 1000,
      children: node.children?.length
        ? normalizeFolderTemplate(node.children)
        : undefined,
    }))
    .filter((node) => node.name.length > 0);
}

export function folderTreeToRows(nodes: FolderTemplateNode[]): FolderTemplateRow[] {
  const rows: FolderTemplateRow[] = [];
  const walk = (list: FolderTemplateNode[], depth: number) => {
    for (const node of list) {
      rows.push({ name: node.name, depth, sortOrder: node.sortOrder });
      if (node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(normalizeFolderTemplate(nodes), 0);
  return rows;
}

export function folderRowsToTree(rows: FolderTemplateRow[]): FolderTemplateNode[] {
  const sorted = [...rows]
    .map((row, index) => ({
      name: row.name.trim(),
      depth: Math.max(0, Math.min(12, Math.floor(row.depth))),
      sortOrder:
        typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder)
          ? row.sortOrder
          : (index + 1) * 1000,
    }))
    .filter((row) => row.name.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const roots: FolderTemplateNode[] = [];
  const stack: { depth: number; node: FolderTemplateNode }[] = [];
  for (const row of sorted) {
    const node: FolderTemplateNode = {
      name: row.name,
      sortOrder: row.sortOrder,
    };
    while (stack.length > 0 && stack[stack.length - 1]!.depth >= row.depth) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1]!.node;
      parent.children = [...(parent.children ?? []), node];
    }
    stack.push({ depth: row.depth, node });
  }
  return normalizeFolderTemplate(roots);
}
