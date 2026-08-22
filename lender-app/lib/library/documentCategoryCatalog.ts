import {
  LIBRARY_DOCUMENT_CATEGORY_LABELS,
  type LibraryDocumentCategory,
} from "./documentVaultTaxonomy";

export const MAX_DOCUMENT_CATEGORY_NAME_LENGTH = 64;

export type DocumentCategorySelection =
  | { kind: "builtin"; value: LibraryDocumentCategory }
  | { kind: "custom"; value: string };

export function normalizeDocumentCategoryName(rawName: string): {
  displayName: string;
  normalizedName: string;
} {
  const displayName = rawName.trim().replace(/\s+/g, " ");
  if (!displayName) {
    throw new Error("Category name is required.");
  }
  if (displayName.length > MAX_DOCUMENT_CATEGORY_NAME_LENGTH) {
    throw new Error(
      `Category name must be ${MAX_DOCUMENT_CATEGORY_NAME_LENGTH} characters or fewer.`,
    );
  }
  return {
    displayName,
    normalizedName: displayName.toLocaleLowerCase("en-US"),
  };
}

export function documentCategoryNameConflict(
  rawName: string,
  existingCustomNames: readonly string[],
): string | null {
  const { normalizedName } = normalizeDocumentCategoryName(rawName);
  const candidateNames = [
    ...Object.values(LIBRARY_DOCUMENT_CATEGORY_LABELS),
    ...existingCustomNames,
  ];
  return (
    candidateNames.find(
      (name) =>
        normalizeDocumentCategoryName(name).normalizedName === normalizedName,
    ) ?? null
  );
}

export function categoryOptionValue(
  kind: DocumentCategorySelection["kind"],
  value: string,
): string {
  return `${kind}:${value}`;
}

export function parseCategoryOptionValue(
  optionValue: string,
): DocumentCategorySelection | null {
  const separator = optionValue.indexOf(":");
  if (separator < 1) return null;
  const kind = optionValue.slice(0, separator);
  const value = optionValue.slice(separator + 1);
  if (!value) return null;
  if (kind === "builtin") {
    return { kind, value: value as LibraryDocumentCategory };
  }
  if (kind === "custom") return { kind, value };
  return null;
}

export function findExistingRegistryAssignment<
  T extends { contactId?: string; clientId?: string },
>(
  links: readonly T[],
  assigneeKind: "contact" | "entity",
  assigneeId: string,
): T | undefined {
  return links.find((link) =>
    assigneeKind === "contact"
      ? link.contactId === assigneeId
      : link.clientId === assigneeId,
  );
}
