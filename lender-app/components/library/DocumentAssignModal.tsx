"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import {
  LIBRARY_DOCUMENT_CATEGORY_LABELS,
  type LibraryDocumentCategory,
} from "@/lib/library/documentVaultTaxonomy";
import { PROFILE_ASSET_CATEGORIES } from "@/lib/library/documentVaultProfileAssets";
import type { RegistryItem } from "@/lib/registry/registryItem";

export type DocumentAssignModalProps = {
  open: boolean;
  onClose: () => void;
  organizationId: Id<"organizations">;
  pipelineFileId: Id<"pipeline">;
  memberUserKey?: string;
  documentId: Id<"libraryDocuments">;
  documentTitle: string;
  onSuccess?: () => void;
  onError: (message: string) => void;
};

export function DocumentAssignModal({
  open,
  onClose,
  organizationId,
  pipelineFileId,
  memberUserKey,
  documentId,
  documentTitle,
  onSuccess,
  onError,
}: DocumentAssignModalProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [category, setCategory] = useState<LibraryDocumentCategory>("id");
  const [busy, setBusy] = useState(false);

  const registryRows = useQuery(
    api.registry.list,
    open && memberUserKey
      ? {
          organizationId,
          memberUserKey,
          searchQuery: search.trim() || undefined,
          typeFilter: ["contact", "entity"],
          limit: 40,
        }
      : "skip",
  );

  const assignDocument = useMutation(
    api.libraryDocuments.assignDocumentToRegistry,
  );

  const assignees = useMemo(
    () =>
      (registryRows ?? []).filter(
        (row: RegistryItem) =>
          row.registryType === "contact" || row.registryType === "entity",
      ),
    [registryRows],
  );

  const selected = assignees.find((row) => row._id === selectedId);

  const handleSubmit = async () => {
    if (!memberUserKey || !selected) return;
    setBusy(true);
    try {
      await assignDocument({
        documentId,
        pipelineFileId,
        assigneeKind:
          selected.registryType === "entity" ? "entity" : "contact",
        contactId:
          selected.registryType === "contact"
            ? (selected._id as Id<"contacts">)
            : undefined,
        clientId:
          selected.registryType === "entity"
            ? (selected._id as Id<"clients">)
            : undefined,
        documentCategory: category,
        memberUserKey,
      });
      setSelectedId("");
      setSearch("");
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
      aria-label="Assign to contact or entity"
      panelClassName="w-full max-w-lg p-5"
    >
      <div data-testid="document-assign-modal">
      <h3 className="text-sm font-semibold text-foreground">
        Assign to Contact / Entity
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Permanently link{" "}
        <span className="font-medium text-foreground">{documentTitle}</span> to a
        registry party so it can be recalled on future deals.
      </p>

      <label className="mt-4 flex flex-col gap-1 text-xs">
        <span className="font-medium text-muted-foreground">Search registry</span>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email, entity…"
            className="h-10 pl-8 text-sm"
            data-testid="document-assign-search"
          />
        </div>
      </label>

      <div
        className="mt-3 max-h-48 overflow-y-auto rounded-dlc-md border border-border/70"
        data-testid="document-assign-results"
      >
        {registryRows === undefined ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
        ) : assignees.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            No contacts or entities match your search.
          </p>
        ) : (
          <ul>
            {assignees.map((row) => {
              const active = selectedId === row._id;
              return (
                <li key={row._id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted/40",
                      active && "bg-primary/10",
                    )}
                    onClick={() => setSelectedId(row._id)}
                  >
                    <span className="font-medium text-foreground">
                      {row.displayName}
                    </span>
                    <span className="text-[11px] capitalize text-muted-foreground">
                      {row.registryType}
                      {row.primaryEmail ? ` · ${row.primaryEmail}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <label className="mt-4 flex flex-col gap-1 text-xs">
        <span className="font-medium text-muted-foreground">Document category</span>
        <select
          value={category}
          onChange={(e) =>
            setCategory(e.target.value as LibraryDocumentCategory)
          }
          className="h-10 rounded-dlc-sm border border-input bg-background px-2 text-sm"
          data-testid="document-assign-category"
        >
          {PROFILE_ASSET_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {LIBRARY_DOCUMENT_CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || !selected}
          onClick={() => void handleSubmit()}
          data-testid="document-assign-submit"
        >
          {busy ? "Assigning…" : "Assign"}
        </Button>
      </div>
      </div>
    </OverlayShell>
  );
}
