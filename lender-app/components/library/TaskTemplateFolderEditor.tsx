"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { FolderTemplateNode } from "@/lib/library/folderTemplateTypes";
import { cn } from "@/lib/cn";

export type TaskTemplateFolderEditorProps = {
  value: FolderTemplateNode[];
  onChange: (nodes: FolderTemplateNode[]) => void;
  disabled?: boolean;
  className?: string;
};

type FlatRow = {
  path: number[];
  name: string;
  sortOrder: number;
};

function flattenNodes(
  nodes: FolderTemplateNode[],
  pathPrefix: number[] = [],
): FlatRow[] {
  const rows: FlatRow[] = [];
  nodes.forEach((node, index) => {
    const path = [...pathPrefix, index];
    rows.push({ path, name: node.name, sortOrder: node.sortOrder });
    if (node.children?.length) {
      rows.push(...flattenNodes(node.children, path));
    }
  });
  return rows;
}

function setNodeAtPath(
  nodes: FolderTemplateNode[],
  path: number[],
  updater: (node: FolderTemplateNode) => FolderTemplateNode,
): FolderTemplateNode[] {
  if (path.length === 0) return nodes;
  const [head, ...rest] = path;
  return nodes.map((node, index) => {
    if (index !== head) return node;
    if (rest.length === 0) return updater(node);
    return {
      ...node,
      children: setNodeAtPath(node.children ?? [], rest, updater),
    };
  });
}

function removeNodeAtPath(
  nodes: FolderTemplateNode[],
  path: number[],
): FolderTemplateNode[] {
  if (path.length === 0) return nodes;
  const [head, ...rest] = path;
  if (rest.length === 0) {
    return nodes.filter((_, index) => index !== head);
  }
  return nodes.map((node, index) =>
    index === head
      ? { ...node, children: removeNodeAtPath(node.children ?? [], rest) }
      : node,
  );
}

function insertChildAtPath(
  nodes: FolderTemplateNode[],
  parentPath: number[],
  child: FolderTemplateNode,
): FolderTemplateNode[] {
  if (parentPath.length === 0) {
    return [...nodes, child];
  }
  return setNodeAtPath(nodes, parentPath, (node) => ({
    ...node,
    children: [...(node.children ?? []), child],
  }));
}

function reindex(nodes: FolderTemplateNode[]): FolderTemplateNode[] {
  return nodes.map((node, index) => ({
    ...node,
    sortOrder: (index + 1) * 1000,
    children: node.children?.length ? reindex(node.children) : undefined,
  }));
}

export function TaskTemplateFolderEditor({
  value,
  onChange,
  disabled = false,
  className,
}: TaskTemplateFolderEditorProps) {
  const rows = flattenNodes(value);

  const updateName = (path: number[], name: string) => {
    onChange(
      reindex(
        setNodeAtPath(value, path, (node) => ({
          ...node,
          name,
        })),
      ),
    );
  };

  const addRoot = () => {
    onChange(
      reindex([
        ...value,
        { name: "New folder", sortOrder: (value.length + 1) * 1000 },
      ]),
    );
  };

  const addChild = (parentPath: number[]) => {
    const childCount = getChildrenAtPath(value, parentPath)?.length ?? 0;
    onChange(
      reindex(
        insertChildAtPath(value, parentPath, {
          name: "New subfolder",
          sortOrder: (childCount + 1) * 1000,
        }),
      ),
    );
  };

  function getChildrenAtPath(
    nodes: FolderTemplateNode[],
    path: number[],
  ): FolderTemplateNode[] | undefined {
    let cursor = nodes;
    for (const index of path) {
      const node = cursor[index];
      if (!node) return undefined;
      cursor = node.children ?? [];
    }
    return cursor;
  }

  const removeRow = (path: number[]) => {
    onChange(reindex(removeNodeAtPath(value, path)));
  };

  return (
    <div className={cn("space-y-2", className)} data-testid="task-template-folder-editor">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Folder structure
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[10px]"
          disabled={disabled}
          onClick={addRoot}
        >
          <Plus className="h-3 w-3" aria-hidden />
          Root folder
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No folders yet. Add a root folder or nested subfolders for document
          upload tasks.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li
              key={row.path.join(".")}
              className="flex items-center gap-1"
              style={{ paddingLeft: `${row.path.length * 14}px` }}
            >
              <Input
                value={row.name}
                disabled={disabled}
                className="h-8 flex-1 text-xs"
                onChange={(e) => updateName(row.path, e.target.value)}
              />
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/50"
                disabled={disabled}
                aria-label={`Add subfolder in ${row.name}`}
                onClick={() => addChild(row.path)}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-dlc-sm text-muted-foreground hover:text-destructive"
                disabled={disabled}
                aria-label={`Remove ${row.name}`}
                onClick={() => removeRow(row.path)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
