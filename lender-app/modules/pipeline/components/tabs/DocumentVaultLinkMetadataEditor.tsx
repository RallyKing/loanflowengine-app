"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";
import { cn } from "@/lib/cn";
import {
  LIBRARY_DOCUMENT_CATEGORIES,
  LIBRARY_DOCUMENT_CATEGORY_LABELS,
  type LibraryDocumentCategory,
  vaultTaxYearOptions,
} from "@/lib/library/documentVaultTaxonomy";
import {
  categoryOptionValue,
  parseCategoryOptionValue,
} from "@/lib/library/documentCategoryCatalog";

const DEBOUNCE_MS = 400;

export type DocumentVaultLinkMetadataEditorProps = {
  documentId: Id<"libraryDocuments">;
  proof: LibraryDocumentsProof;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  canMutate: boolean;
  documentCategory?: LibraryDocumentCategory;
  customDocumentCategoryId?: Id<"organizationDocumentCategories">;
  customDocumentCategoryName?: string;
  taxYear?: string;
  onOptimisticChange?: (patch: {
    documentCategory?: LibraryDocumentCategory | null;
    customDocumentCategoryId?: Id<"organizationDocumentCategories"> | null;
    customDocumentCategoryName?: string | null;
    taxYear?: string | null;
  }) => void;
  onError?: (message: string) => void;
  className?: string;
};

export function DocumentVaultLinkMetadataEditor({
  documentId,
  proof,
  organizationId,
  memberUserKey,
  canMutate,
  documentCategory,
  customDocumentCategoryId,
  customDocumentCategoryName,
  taxYear,
  onOptimisticChange,
  onError,
  className,
}: DocumentVaultLinkMetadataEditorProps) {
  const patchLinkMetadata = useMutation(
    api.libraryDocuments.patchDocumentLinkMetadata,
  );
  const customCategories = useQuery(
    api.documentCategories.listForOrganization,
    organizationId
      ? {
          organizationId,
          ...(memberUserKey ? { memberUserKey } : {}),
        }
      : "skip",
  );

  const initialCategory = documentCategory
    ? categoryOptionValue("builtin", documentCategory)
    : customDocumentCategoryId
      ? categoryOptionValue("custom", customDocumentCategoryId)
      : "";
  const [category, setCategory] = useState(initialCategory);
  const [year, setYear] = useState(taxYear ?? "");
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestArgsRef = useRef<{
    documentCategory?: LibraryDocumentCategory | "__unset__";
    customDocumentCategoryId?:
      | Id<"organizationDocumentCategories">
      | "__unset__";
    taxYear?: string | "__unset__";
  } | null>(null);

  useEffect(() => {
    setCategory(
      documentCategory
        ? categoryOptionValue("builtin", documentCategory)
        : customDocumentCategoryId
          ? categoryOptionValue("custom", customDocumentCategoryId)
          : "",
    );
    setYear(taxYear ?? "");
  }, [customDocumentCategoryId, documentCategory, taxYear, documentId]);

  useEffect(
    () => () => {
      if (pendingRef.current) clearTimeout(pendingRef.current);
    },
    [],
  );

  const flushPatch = useCallback(async () => {
    if (!memberUserKey || !latestArgsRef.current) return;
    const args = latestArgsRef.current;
    latestArgsRef.current = null;
    try {
      await patchLinkMetadata({
        documentId,
        proof,
        memberUserKey,
        ...args,
      });
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    }
  }, [documentId, memberUserKey, onError, patchLinkMetadata, proof]);

  const schedulePatch = useCallback(
    (args: {
      documentCategory?: LibraryDocumentCategory | "__unset__";
      customDocumentCategoryId?:
        | Id<"organizationDocumentCategories">
        | "__unset__";
      taxYear?: string | "__unset__";
    }) => {
      latestArgsRef.current = {
        ...latestArgsRef.current,
        ...args,
      };
      if (pendingRef.current) clearTimeout(pendingRef.current);
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null;
        void flushPatch();
      }, DEBOUNCE_MS);
    },
    [flushPatch],
  );

  const onCategoryChange = (nextRaw: string) => {
    const nextSelection = parseCategoryOptionValue(nextRaw);
    const nextCategory =
      nextSelection?.kind === "builtin" ? nextSelection.value : null;
    const nextCustomCategory =
      nextSelection?.kind === "custom"
        ? (nextSelection.value as Id<"organizationDocumentCategories">)
        : null;
    setCategory(nextRaw);
    if (nextCategory !== "tax_return") {
      setYear("");
    }
    onOptimisticChange?.({
      documentCategory: nextCategory,
      customDocumentCategoryId: nextCustomCategory,
      customDocumentCategoryName:
        nextSelection?.kind === "custom"
          ? customCategories?.find(
              (item) => String(item._id) === nextSelection.value,
            )?.displayName ?? null
          : null,
      taxYear: nextCategory === "tax_return" ? year || null : null,
    });
    if (!canMutate || !memberUserKey) return;
    if (nextRaw === "") {
      schedulePatch({
        documentCategory: "__unset__",
        customDocumentCategoryId: "__unset__",
      });
      return;
    }
    if (nextSelection?.kind === "builtin") {
      schedulePatch({
        documentCategory: nextSelection.value,
        customDocumentCategoryId: "__unset__",
        ...(nextSelection.value !== "tax_return"
          ? { taxYear: "__unset__" }
          : {}),
      });
    } else if (nextCustomCategory) {
      schedulePatch({
        documentCategory: "__unset__",
        customDocumentCategoryId: nextCustomCategory,
        taxYear: "__unset__",
      });
    }
  };

  const onYearChange = (nextYear: string) => {
    const currentSelection = parseCategoryOptionValue(category);
    const currentCategory =
      currentSelection?.kind === "builtin" ? currentSelection.value : null;
    setYear(nextYear);
    onOptimisticChange?.({
      documentCategory: currentCategory,
      taxYear: nextYear || null,
    });
    if (!canMutate || !memberUserKey || currentCategory !== "tax_return") return;
    schedulePatch({
      taxYear: nextYear.trim() ? nextYear.trim() : "__unset__",
    });
  };

  const categoryLabel =
    documentCategory
      ? LIBRARY_DOCUMENT_CATEGORY_LABELS[documentCategory]
      : customDocumentCategoryName || "Unassigned";

  if (!canMutate) {
    return (
      <div
        className={cn("mt-1.5 flex flex-wrap items-center gap-2 text-[11px]", className)}
        data-testid={`pipeline-documents-vault-meta-${documentId}`}
      >
        <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 font-medium text-muted-foreground">
          {categoryLabel}
        </span>
        {documentCategory === "tax_return" && taxYear ? (
          <span className="text-muted-foreground">Tax year {taxYear}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-2 flex min-w-0 flex-wrap items-end gap-2 border-t border-border/50 pt-2",
        className,
      )}
      data-testid={`pipeline-documents-vault-meta-${documentId}`}
    >
      <label className="flex min-w-[9.5rem] flex-col gap-0.5 text-[10px]">
        <span className="font-medium text-muted-foreground">Category</span>
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="h-8 rounded-dlc-sm border border-input bg-background px-2 text-xs text-foreground"
          aria-label={`Category for ${documentId}`}
        >
          <option value="">Unassigned</option>
          {LIBRARY_DOCUMENT_CATEGORIES.map((cat) => (
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
        </select>
      </label>
      {category === categoryOptionValue("builtin", "tax_return") ? (
        <label className="flex min-w-[5.5rem] flex-col gap-0.5 text-[10px]">
          <span className="font-medium text-muted-foreground">Tax year</span>
          <select
            value={year}
            onChange={(e) => onYearChange(e.target.value)}
            className="h-8 rounded-dlc-sm border border-input bg-background px-2 text-xs text-foreground"
            aria-label="Tax year"
            data-testid={`pipeline-documents-vault-tax-year-${documentId}`}
          >
            <option value="">Year…</option>
            {vaultTaxYearOptions().map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
