"use client";



import { useCallback, useState } from "react";

import dynamic from "next/dynamic";

import { useMutation } from "convex/react";

import { useRouter } from "next/navigation";

import { CheckSquare, FileText, Paperclip, Pencil, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";

import type { Id } from "@/convex/_generated/dataModel";

import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";

import { Button } from "@/components/ui/Button";

import { touchTargetIconClass } from "@/lib/ui/touchTarget";

import { cn } from "@/lib/cn";

import {

  fileWorkspaceBadgeVariant,

  fileWorkspaceOwnerSummary,

  fileWorkspaceStatusLabel,

  type ClientWorkspaceTreeFile,

} from "@/lib/pipeline/clientWorkspaceTree";

import { pipelineDealEditorHref } from "@/lib/pipeline/routes";



const PipelineFileWorkspace = dynamic(

  () =>

    import("@/components/PipelineFileWorkspace").then((m) => ({

      default: m.PipelineFileWorkspace,

    })),

  { ssr: false, loading: () => null },

);



export type FileWorkspaceContainerProps = {

  file: ClientWorkspaceTreeFile;

  defaultOpen?: boolean;

  /** When set, quick-action navigation preserves client hub context. */

  clientId?: Id<"clients">;

  organizationId?: Id<"organizations">;

  memberUserKey?: string;

  sortDragHandle?: React.ReactNode;

};



/**

 * Phase 55.3 — Level 2 cascade: file collapsible container with quick actions

 * and lazy-mounted embedded workspace.

 */

export function FileWorkspaceContainer({

  file,

  defaultOpen = false,

  clientId,

  organizationId,

  memberUserKey,

  sortDragHandle,

}: FileWorkspaceContainerProps) {

  const router = useRouter();

  const [isOpen, setIsOpen] = useState(defaultOpen);

  const [mutating, setMutating] = useState(false);

  const patchPipeline = useMutation(api.pipeline.patch);

  const deleteFile = useMutation(api.hierarchyCrudMutations.deletePipelineFile);

  const fileId = file._id;

  const blockId = `pipeline-client-file-${String(fileId)}`;

  const displayName = file.fileName.trim() || "Untitled file";

  const canMutate = Boolean(organizationId && memberUserKey?.trim());



  const openFileSurface = useCallback(

    (opts: { tab?: string; block?: string }) => {

      router.push(

        pipelineDealEditorHref(String(fileId), {

          hubMode: "client",

          hubEntity: clientId ? String(clientId) : undefined,

          hubClient: clientId ? String(clientId) : undefined,

          tab: opts.tab,

          focusBlock: opts.block,

        }),

      );

    },

    [clientId, fileId, router],

  );



  const onRenameFile = useCallback(async () => {

    if (!canMutate || !organizationId || !memberUserKey) return;

    const next = window.prompt("Rename loan file", displayName);

    const trimmed = next?.trim();

    if (!trimmed || trimmed === displayName) return;

    setMutating(true);

    try {

      await patchPipeline({

        id: fileId,

        fileName: trimmed,

        preferencesAccountId: memberUserKey,

      });

    } finally {

      setMutating(false);

    }

  }, [

    canMutate,

    displayName,

    fileId,

    memberUserKey,

    organizationId,

    patchPipeline,

  ]);



  const onDeleteFile = useCallback(async () => {

    if (!canMutate || !organizationId || !memberUserKey) return;

    if (

      !window.confirm(

        `Permanently delete "${displayName}"? This cannot be undone.`,

      )

    ) {

      return;

    }

    setMutating(true);

    try {

      await deleteFile({

        organizationId,

        memberUserKey,

        fileId,

      });

    } finally {

      setMutating(false);

    }

  }, [

    canMutate,

    deleteFile,

    displayName,

    fileId,

    memberUserKey,

    organizationId,

  ]);



  const headerActions = (

    <div

      className="inline-flex items-center gap-0.5"

      data-testid={`${blockId}-header-actions`}

    >

      <Button

        type="button"

        variant="ghost"

        size="sm"

        className={cn("h-8 w-8 shrink-0 p-0", touchTargetIconClass)}

        aria-label="Rename loan file"

        disabled={mutating || !canMutate}

        data-testid={`${blockId}-rename`}

        onClick={(e) => {

          e.stopPropagation();

          void onRenameFile();

        }}

      >

        <Pencil className="h-4 w-4 shrink-0" aria-hidden />

      </Button>

      <Button

        type="button"

        variant="ghost"

        size="sm"

        className={cn(

          "h-8 w-8 shrink-0 p-0 text-destructive hover:text-destructive",

          touchTargetIconClass,

        )}

        aria-label="Delete loan file"

        disabled={mutating || !canMutate}

        data-testid={`${blockId}-delete`}

        onClick={(e) => {

          e.stopPropagation();

          void onDeleteFile();

        }}

      >

        <Trash2 className="h-4 w-4 shrink-0" aria-hidden />

      </Button>

      <Button

        type="button"

        variant="ghost"

        size="sm"

        className={cn("h-8 w-8 shrink-0 p-0", touchTargetIconClass)}

        aria-label="Upload documents"

        data-testid={`${blockId}-quick-upload`}

        onClick={(e) => {

          e.stopPropagation();

          openFileSurface({ tab: "documents" });

        }}

      >

        <Paperclip className="h-4 w-4 shrink-0" aria-hidden />

      </Button>

      <Button

        type="button"

        variant="ghost"

        size="sm"

        className={cn("h-8 w-8 shrink-0 p-0", touchTargetIconClass)}

        aria-label="View file tasks"

        data-testid={`${blockId}-quick-tasks`}

        onClick={(e) => {

          e.stopPropagation();

          openFileSurface({ block: "tasks" });

        }}

      >

        <CheckSquare className="h-4 w-4 shrink-0" aria-hidden />

      </Button>

    </div>

  );



  return (

    <div data-testid={blockId}>

      <CollapsibleBlock

        id={blockId}

        title={displayName}

        status={fileWorkspaceStatusLabel(file)}

        summary={fileWorkspaceOwnerSummary(file)}

        badgeVariant={fileWorkspaceBadgeVariant(file)}

        icon={<FileText className="h-4 w-4 shrink-0" aria-hidden />}

        open={isOpen}

        onOpenChange={setIsOpen}

        headerLeading={sortDragHandle}

        headerRight={headerActions}

        animated

        lazyMount={false}

        density="compact"

        contentClassName="p-0"

      >

        {isOpen ? (

          <div

            className="w-full min-w-0 bg-background"

            data-testid={`${blockId}-workspace`}

          >

            <PipelineFileWorkspace

              key={String(fileId)}

              fileId={fileId}

              embedded

            />

          </div>

        ) : null}

      </CollapsibleBlock>

    </div>

  );

}

