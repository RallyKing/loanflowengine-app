"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Plus, Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OverlayShell } from "@/components/ui/OverlayShell";
import { cn } from "@/lib/cn";
import {
  LIBRARY_DOCUMENT_CATEGORY_LABELS,
} from "@/lib/library/documentVaultTaxonomy";
import { PROFILE_ASSET_CATEGORIES } from "@/lib/library/documentVaultProfileAssets";
import {
  categoryOptionValue,
  normalizeDocumentCategoryName,
  parseCategoryOptionValue,
} from "@/lib/library/documentCategoryCatalog";
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
  const [category, setCategory] = useState(categoryOptionValue("builtin", "id"));
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryMessage, setCategoryMessage] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
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

  const existingAssignments = useQuery(
    api.libraryDocuments.listDocumentRegistryAssignments,
    open && memberUserKey
      ? { documentId, pipelineFileId, memberUserKey }
      : "skip",
  );
  const customCategories = useQuery(
    api.documentCategories.listForOrganization,
    open
      ? {
          organizationId,
          ...(memberUserKey ? { memberUserKey } : {}),
        }
      : "skip",
  );

  const assignDocument = useMutation(
    api.libraryDocuments.assignDocumentToRegistry,
  );
  const createCategory = useMutation(
    api.documentCategories.createForDocumentAssignment,
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
  const assignedIds = useMemo(
    () =>
      new Set(
        (existingAssignments ?? []).map(
          (assignment) => `${assignment.kind}:${assignment.registryId}`,
        ),
      ),
    [existingAssignments],
  );
  const selectedAlreadyAssigned = selected
    ? assignedIds.has(`${selected.registryType}:${selected._id}`)
    : false;

  const handleCreateCategory = async () => {
    if (!memberUserKey) return;
    setCategoryMessage("");
    let normalized: ReturnType<typeof normalizeDocumentCategoryName>;
    try {
      normalized = normalizeDocumentCategoryName(newCategoryName);
    } catch (error) {
      setCategoryMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    setCategoryBusy(true);
    try {
      const result = await createCategory({
        organizationId,
        pipelineFileId,
        memberUserKey,
        displayName: normalized.displayName,
      });
      setCategory(categoryOptionValue("custom", result.category._id));
      setNewCategoryName("");
      setAddingCategory(false);
      setCategoryMessage(
        result.created
          ? `${result.category.displayName} created and selected.`
          : `${result.category.displayName} already exists and is now selected.`,
      );
    } catch (error) {
      setCategoryMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCategoryBusy(false);
    }
  };

  const handleSubmit = async () => {
    const categorySelection = parseCategoryOptionValue(category);
    if (
      !memberUserKey ||
      !selected ||
      selectedAlreadyAssigned ||
      !categorySelection
    ) {
      return;
    }
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
        ...(categorySelection.kind === "builtin"
          ? { documentCategory: categorySelection.value }
          : {
              customDocumentCategoryId:
                categorySelection.value as Id<"organizationDocumentCategories">,
            }),
        memberUserKey,
      });
      setSelectedId("");
      setSearch("");
      setCategory(categoryOptionValue("builtin", "id"));
      setCategoryMessage("");
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
      panelClassName="max-h-[min(90dvh,720px)] w-full max-w-lg overflow-y-auto overscroll-contain p-5"
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

      <section className="mt-4" aria-labelledby="document-existing-assignees">
        <h4
          id="document-existing-assignees"
          className="text-xs font-medium text-muted-foreground"
        >
          Already assigned
        </h4>
        {existingAssignments === undefined ? (
          <p className="mt-1 text-xs text-muted-foreground">Loading assignments…</p>
        ) : existingAssignments.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Not assigned to a contact or entity yet.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {existingAssignments.map((assignment) => (
              <span
                key={`${assignment.kind}:${assignment.registryId}`}
                className="inline-flex items-center gap-1 rounded-dlc-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground"
              >
                <Check className="h-3 w-3 text-primary" aria-hidden />
                {assignment.displayName}
                <span className="capitalize text-muted-foreground">
                  · {assignment.kind}
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

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
              const alreadyAssigned = assignedIds.has(
                `${row.registryType}:${row._id}`,
              );
              return (
                <li key={row._id}>
                  <button
                    type="button"
                    className={cn(
                      "flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors duration-dlc-short2 ease-dlc-standard hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-65",
                      active && "bg-primary/10",
                    )}
                    onClick={() => setSelectedId(row._id)}
                    disabled={alreadyAssigned}
                    aria-label={`${row.displayName}${alreadyAssigned ? ", already assigned" : ""}`}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-medium text-foreground">
                        {row.displayName}
                      </span>
                      <span className="text-[11px] capitalize text-muted-foreground">
                        {row.registryType}
                        {row.primaryEmail ? ` · ${row.primaryEmail}` : ""}
                      </span>
                    </span>
                    {alreadyAssigned ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        Assigned
                      </span>
                    ) : null}
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
          onChange={(event) => {
            if (event.target.value === "__add__") {
              setAddingCategory(true);
              setCategoryMessage("");
              return;
            }
            setCategory(event.target.value);
          }}
          className="h-10 rounded-dlc-sm border border-input bg-background px-2 text-sm"
          data-testid="document-assign-category"
        >
          {PROFILE_ASSET_CATEGORIES.map((cat) => (
            <option key={cat} value={categoryOptionValue("builtin", cat)}>
              {LIBRARY_DOCUMENT_CATEGORY_LABELS[cat]}
            </option>
          ))}
          {(customCategories ?? []).map((customCategory) => (
            <option
              key={customCategory._id}
              value={categoryOptionValue("custom", customCategory._id)}
            >
              {customCategory.displayName}
            </option>
          ))}
          <option value="__add__">Add category…</option>
        </select>
      </label>

      {addingCategory ? (
        <div
          className="mt-3 rounded-dlc-md border border-border/70 bg-dlc-surface-high p-3"
          role="group"
          aria-labelledby="new-document-category-label"
        >
          <label className="flex flex-col gap-1 text-xs">
            <span
              id="new-document-category-label"
              className="font-medium text-muted-foreground"
            >
              New category
            </span>
            <Input
              autoFocus
              value={newCategoryName}
              onChange={(event) => {
                setNewCategoryName(event.target.value);
                setCategoryMessage("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCreateCategory();
                }
              }}
              maxLength={64}
              placeholder="e.g. Bank Statements"
              aria-describedby="document-category-message"
              data-testid="document-assign-new-category"
            />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAddingCategory(false);
                setNewCategoryName("");
                setCategoryMessage("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={categoryBusy || !newCategoryName.trim()}
              onClick={() => void handleCreateCategory()}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {categoryBusy ? "Adding…" : "Add category"}
            </Button>
          </div>
        </div>
      ) : null}
      <p
        id="document-category-message"
        className={cn(
          "mt-2 min-h-4 text-xs",
          categoryMessage
            ? "text-muted-foreground"
            : "text-transparent",
        )}
        role="status"
        aria-live="polite"
      >
        {categoryMessage || "No category message"}
      </p>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || !selected || selectedAlreadyAssigned}
          onClick={() => void handleSubmit()}
          data-testid="document-assign-submit"
        >
          {selectedAlreadyAssigned
            ? "Already assigned"
            : busy
              ? "Assigning…"
              : "Assign"}
        </Button>
      </div>
      </div>
    </OverlayShell>
  );
}
