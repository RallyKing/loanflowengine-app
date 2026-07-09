"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import {
  RecordInspectorBody,
  RecordInspectorFooter,
  RecordInspectorHeader,
  RecordInspectorShell,
  RecordInspectorSubtitle,
} from "@/components/RecordInspectorShell";
import { cn } from "@/lib/cn";
import {
  folderDisplayPath,
  folderPortalPath,
} from "@/lib/library/documentVaultFolders";
import {
  LIBRARY_DOCUMENT_CATEGORY_LABELS,
  type LibraryDocumentCategory,
} from "@/lib/library/documentVaultTaxonomy";

type LinkedContact = {
  contactId: Id<"contacts">;
  name: string;
  role: string;
};

type ContactDocRow = {
  _id: Id<"libraryDocuments">;
  title: string;
  documentCategory?: LibraryDocumentCategory;
  taxYear?: string;
  latestFileName?: string;
};

export type RecallFromClientVaultDrawerProps = {
  open: boolean;
  onClose: () => void;
  pipelineFileId: Id<"pipeline">;
  currentFolderId: Id<"documentFolders"> | null;
  memberUserKey?: string;
  onSuccess?: () => void;
  onError: (message: string) => void;
};

export function RecallFromClientVaultDrawer({
  open,
  onClose,
  pipelineFileId,
  currentFolderId,
  memberUserKey,
  onSuccess,
  onError,
}: RecallFromClientVaultDrawerProps) {
  const linkedContacts = useQuery(
    api.contactFileLinks.listLinkedContactsForFile,
    open && memberUserKey
      ? { fileId: pipelineFileId, memberUserKey }
      : open
        ? { fileId: pipelineFileId }
        : "skip",
  );

  const vaultFolders = useQuery(
    api.documentFolders.listFoldersByPipeline,
    open && memberUserKey
      ? { pipelineFileId, memberUserKey }
      : open
        ? { pipelineFileId }
        : "skip",
  );

  const [contactId, setContactId] = useState<Id<"contacts"> | "">("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [destFolderId, setDestFolderId] = useState<
    Id<"documentFolders"> | ""
  >("");
  const [busy, setBusy] = useState(false);

  const contactDocs = useQuery(
    api.libraryDocuments.listForProof,
    open && contactId && memberUserKey
      ? {
          proof: { kind: "contact", contactId },
          limit: 200,
          memberUserKey,
        }
      : "skip",
  );

  const dealDocs = useQuery(
    api.libraryDocuments.listForProof,
    open && memberUserKey
      ? {
          proof: { kind: "pipeline", pipelineFileId },
          limit: 300,
          memberUserKey,
        }
      : "skip",
  );

  const addDocumentLink = useMutation(api.libraryDocuments.addDocumentLink);
  const patchLinkMetadata = useMutation(
    api.libraryDocuments.patchDocumentLinkMetadata,
  );

  const folderRows = vaultFolders ?? [];
  const contacts = linkedContacts ?? [];

  const recallableDocs = useMemo((): ContactDocRow[] => {
    if (!contactDocs) return [];
    const onDeal = new Set((dealDocs ?? []).map((d) => String(d._id)));
    return (contactDocs as ContactDocRow[]).filter(
      (d) => !onDeal.has(String(d._id)),
    );
  }, [contactDocs, dealDocs]);

  const toggleDoc = (id: Id<"libraryDocuments">) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleImport = async () => {
    if (!memberUserKey || selectedIds.size === 0) return;
    setBusy(true);
    try {
      const folderTarget = destFolderId || currentFolderId || undefined;
      for (const docId of selectedIds) {
        await addDocumentLink({
          documentId: docId as Id<"libraryDocuments">,
          link: { kind: "pipeline", pipelineFileId },
          memberUserKey,
        });
        if (folderTarget) {
          await patchLinkMetadata({
            documentId: docId as Id<"libraryDocuments">,
            proof: { kind: "pipeline", pipelineFileId },
            folderId: folderTarget,
            memberUserKey,
          });
        }
      }
      setSelectedIds(new Set());
      setContactId("");
      setDestFolderId("");
      onSuccess?.();
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sortedFolders = useMemo(
    () =>
      [...folderRows].sort((a, b) =>
        folderDisplayPath(folderRows, a._id).localeCompare(
          folderDisplayPath(folderRows, b._id),
          undefined,
          { sensitivity: "base" },
        ),
      ),
    [folderRows],
  );

  if (!open) return null;

  return (
    <RecordInspectorShell
      onClose={onClose}
      recordKind="document"
      ariaLabel="Recall from client vault"
      panelClassName="md:max-w-md"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <RecordInspectorHeader id="recall-client-vault-title">
          <h2 className="text-base font-semibold text-foreground">
            Recall from Client Vault
          </h2>
          <RecordInspectorSubtitle>
            Import documents permanently stored on a linked contact profile —
            no duplicate storage blobs.
          </RecordInspectorSubtitle>
        </RecordInspectorHeader>

        <RecordInspectorBody>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Link a CRM contact to this file first (Borrowers or Contacts tab).
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-muted-foreground">
                  Linked contact
                </span>
                <select
                  value={contactId}
                  onChange={(e) => {
                    setContactId(
                      e.target.value
                        ? (e.target.value as Id<"contacts">)
                        : "",
                    );
                    setSelectedIds(new Set());
                  }}
                  className="h-10 rounded-dlc-sm border border-input bg-background px-2 text-sm"
                  data-testid="recall-client-vault-contact"
                >
                  <option value="">Select contact…</option>
                  {contacts.map((c: LinkedContact) => (
                    <option key={c.contactId} value={c.contactId}>
                      {c.name}
                      {c.role ? ` (${c.role})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {contactId ? (
                contactDocs === undefined ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Loading client vault…
                  </p>
                ) : recallableDocs.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No recallable documents for this contact (all are already on
                    this deal or the profile is empty).
                  </p>
                ) : (
                  <ul
                    className="mt-4 max-h-[min(40vh,20rem)] space-y-2 overflow-y-auto rounded-dlc-md border border-border/70 p-2"
                    data-testid="recall-client-vault-doc-list"
                  >
                    {recallableDocs.map((d) => {
                      const checked = selectedIds.has(String(d._id));
                      return (
                        <li key={d._id}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-start gap-2 rounded-dlc-sm px-2 py-2 hover:bg-muted/40",
                              checked && "bg-muted/30",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              onChange={() => toggleDoc(d._id)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">
                                {d.title}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {d.documentCategory
                                  ? LIBRARY_DOCUMENT_CATEGORY_LABELS[
                                      d.documentCategory
                                    ]
                                  : "Unassigned"}
                                {d.latestFileName ? ` · ${d.latestFileName}` : ""}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : null}

              {contactId && recallableDocs.length > 0 ? (
                <label className="mt-3 flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">
                    Destination folder (optional)
                  </span>
                  <select
                    value={destFolderId || currentFolderId || ""}
                    onChange={(e) =>
                      setDestFolderId(
                        e.target.value
                          ? (e.target.value as Id<"documentFolders">)
                          : "",
                      )
                    }
                    className="h-10 rounded-dlc-sm border border-input bg-background px-2 text-sm"
                  >
                    <option value="">Root</option>
                    {sortedFolders.map((folder) => (
                      <option key={folder._id} value={folder._id}>
                        {folderPortalPath(folderRows, folder._id)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          )}
        </RecordInspectorBody>

        <RecordInspectorFooter>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || selectedIds.size === 0 || contacts.length === 0}
              onClick={() => void handleImport()}
              data-testid="recall-client-vault-submit"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                  Importing…
                </>
              ) : (
                `Import to deal${selectedIds.size ? ` (${selectedIds.size})` : ""}`
              )}
            </Button>
          </div>
        </RecordInspectorFooter>
      </div>
    </RecordInspectorShell>
  );
}
