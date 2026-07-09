"use client";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { LibraryDocumentsWorkspace } from "@/components/library/LibraryDocumentsWorkspace";
import type { Id } from "@/convex/_generated/dataModel";
import { FolderOpen } from "lucide-react";

export type LibraryDocumentsContext =
  | { kind: "pipeline"; pipelineFileId: Id<"pipeline"> }
  | { kind: "contact"; contactId: Id<"contacts"> }
  | { kind: "task"; taskId: Id<"tasks"> };

/** Convex `proof` argument shared with e-sign and library document mutations. */
export type LibraryDocumentsProof = LibraryDocumentsContext;

export function LibraryDocumentsPanel({
  context,
  memberUserKey,
  canUseHub,
  actionTitle,
  defaultOpen = false,
  sectionOpen,
  onSectionOpenChange,
}: {
  context: LibraryDocumentsContext;
  memberUserKey?: string;
  canUseHub: boolean;
  actionTitle: (hint: string) => string;
  defaultOpen?: boolean;
  sectionOpen?: boolean;
  onSectionOpenChange?: (open: boolean) => void;
}) {
  const sectionControlled =
    sectionOpen !== undefined && onSectionOpenChange !== undefined;

  return (
    <CollapsibleSection
      variant="card"
      animated
      lazyMount
      {...(sectionControlled
        ? { open: sectionOpen, onOpenChange: onSectionOpenChange }
        : { defaultOpen })}
      title={
        <span className="flex items-center gap-2 normal-case">
          <FolderOpen className="h-3.5 w-3.5" aria-hidden />
          Document library
        </span>
      }
      description="Versioned workspace documents (any file type). The same item can be linked to a deal, contact, and task; uploads are stored securely in Convex file storage."
    >
      <LibraryDocumentsWorkspace
        layout="embedded"
        context={context}
        memberUserKey={memberUserKey}
        canUseHub={canUseHub}
        actionTitle={actionTitle}
      />
    </CollapsibleSection>
  );
}
