"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import {
  folderDisplayPath,
  folderPortalPath,
} from "@/lib/library/documentVaultFolders";
import {
  LIBRARY_DOCUMENT_CATEGORY_LABELS,
  type LibraryDocumentCategory,
} from "@/lib/library/documentVaultTaxonomy";
import {
  isEvergreenContactDocument,
  PROFILE_ASSET_CATEGORIES,
} from "@/lib/library/documentVaultProfileAssets";

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

export type SaveToContactModalProps = {
  open: boolean;
  onClose: () => void;
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  documentId: Id<"libraryDocuments">;
  documentTitle: string;
  onSuccess?: () => void;
  onError: (message: string) => void;
};

export function SaveToContactModal({
  open,
  onClose,
  pipelineFileId,
  memberUserKey,
  documentId,
  documentTitle,
  onSuccess,
  onError,
}: SaveToContactModalProps) {
  const linkedContacts = useQuery(
    api.contactFileLinks.listLinkedContactsForFile,
    open && memberUserKey
      ? { fileId: pipelineFileId, memberUserKey }
      : open
        ? { fileId: pipelineFileId }
        : "skip",
  );

  const linkAndCategorize = useMutation(
    api.libraryDocuments.linkAndCategorizeDocument,
  );

  const [contactId, setContactId] = useState<Id<"contacts"> | "">("");
  const [category, setCategory] = useState<LibraryDocumentCategory>("id");
  const [busy, setBusy] = useState(false);

  const contacts = linkedContacts ?? [];

  const handleSubmit = async () => {
    if (!memberUserKey || !contactId) return;
    setBusy(true);
    try {
      await linkAndCategorize({
        documentId,
        pipelineFileId,
        contactId,
        documentCategory: category,
        memberUserKey,
      });
      setContactId("");
      setCategory("id");
      onSuccess?.();
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      aria-label="Save to contact profile"
      panelClassName="w-full max-w-md p-5"
    >
      <h3 className="text-sm font-semibold text-foreground">
        Save to Contact Profile
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Link{" "}
        <span className="font-medium text-foreground">{documentTitle}</span> to
        a borrower&apos;s global CRM profile so it travels across deals.
      </p>

      {contacts.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Link a CRM contact to this file first (Borrowers or Contacts tab).
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-muted-foreground">Contact</span>
            <select
              value={contactId}
              onChange={(e) =>
                setContactId(
                  e.target.value
                    ? (e.target.value as Id<"contacts">)
                    : "",
                )
              }
              className="h-10 rounded-dlc-sm border border-input bg-background px-2 text-sm"
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
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-muted-foreground">
              Asset type
            </span>
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as LibraryDocumentCategory)
              }
              className="h-10 rounded-dlc-sm border border-input bg-background px-2 text-sm"
            >
              {PROFILE_ASSET_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {LIBRARY_DOCUMENT_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || !contactId || contacts.length === 0}
          onClick={() => void handleSubmit()}
          data-testid="save-to-contact-submit"
        >
          {busy ? "Saving…" : "Save to profile"}
        </Button>
      </div>
    </OverlayShell>
  );
}

export type ImportFromContactModalProps = {
  open: boolean;
  onClose: () => void;
  pipelineFileId: Id<"pipeline">;
  currentFolderId: Id<"documentFolders"> | null;
  memberUserKey?: string;
  onSuccess?: () => void;
  onError: (message: string) => void;
};

export function ImportFromContactModal({
  open,
  onClose,
  pipelineFileId,
  currentFolderId,
  memberUserKey,
  onSuccess,
  onError,
}: ImportFromContactModalProps) {
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
          limit: 120,
          memberUserKey,
        }
      : "skip",
  );

  const dealDocs = useQuery(
    api.libraryDocuments.listForProof,
    open && memberUserKey
      ? {
          proof: { kind: "pipeline", pipelineFileId },
          limit: 200,
          memberUserKey,
        }
      : "skip",
  );

  const addDocumentLink = useMutation(api.libraryDocuments.addDocumentLink);
  const patchLinkMetadata = useMutation(
    api.libraryDocuments.patchDocumentLinkMetadata,
  );

  const folderRows = vaultFolders ?? [];

  const importableDocs = useMemo((): ContactDocRow[] => {
    if (!contactDocs) return [];
    const onDeal = new Set(
      (dealDocs ?? []).map((d) => String(d._id)),
    );
    return (contactDocs as ContactDocRow[]).filter(
      (d) =>
        !onDeal.has(String(d._id)) &&
        isEvergreenContactDocument(d.documentCategory),
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
      const folderTarget =
        destFolderId || currentFolderId || undefined;
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

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      aria-label="Import from contact profile"
      panelClassName="w-full max-w-lg p-5"
    >
      <h3 className="text-sm font-semibold text-foreground">
        Import from Contact Profile
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Pull evergreen assets (ID, DD-214, tax returns) from a linked contact
        into this deal&apos;s vault.
      </p>

      <label className="mt-4 flex flex-col gap-1 text-xs">
        <span className="font-medium text-muted-foreground">Contact</span>
        <select
          value={contactId}
          onChange={(e) => {
            setContactId(
              e.target.value ? (e.target.value as Id<"contacts">) : "",
            );
            setSelectedIds(new Set());
          }}
          className="h-10 rounded-dlc-sm border border-input bg-background px-2 text-sm"
        >
          <option value="">Select contact…</option>
          {(linkedContacts ?? []).map((c: LinkedContact) => (
            <option key={c.contactId} value={c.contactId}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {contactId ? (
        contactDocs === undefined ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading assets…</p>
        ) : importableDocs.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No importable profile assets for this contact (already on this file
            or none tagged as ID / DD-214 / tax return).
          </p>
        ) : (
          <ul
            className="mt-4 max-h-52 space-y-2 overflow-y-auto rounded-dlc-md border border-border/70 p-2"
            data-testid="import-from-contact-doc-list"
          >
            {importableDocs.map((d) => {
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

      {contactId && importableDocs.length > 0 ? (
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

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || selectedIds.size === 0}
          onClick={() => void handleImport()}
          data-testid="import-from-contact-submit"
        >
          {busy
            ? "Importing…"
            : `Import${selectedIds.size ? ` (${selectedIds.size})` : ""}`}
        </Button>
      </div>
    </OverlayShell>
  );
}
