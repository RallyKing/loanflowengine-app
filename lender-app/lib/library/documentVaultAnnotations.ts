/** Phase 40.2 — version-scoped annotation metadata (not baked into PDF bytes). */

export type VaultHighlightAnnotation = {
  id: string;
  type: "highlight";
  pageIndex: number;
  /** Normalized 0–1 relative to rendered page box. */
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
};

export type VaultNoteAnnotation = {
  id: string;
  type: "note";
  pageIndex: number;
  x: number;
  y: number;
  text: string;
};

export type VaultVersionAnnotations = {
  highlights: VaultHighlightAnnotation[];
  notes: VaultNoteAnnotation[];
};

export const EMPTY_VAULT_ANNOTATIONS: VaultVersionAnnotations = {
  highlights: [],
  notes: [],
};

export function normalizeVaultAnnotations(
  raw: VaultVersionAnnotations | null | undefined,
): VaultVersionAnnotations {
  if (!raw) return { ...EMPTY_VAULT_ANNOTATIONS };
  return {
    highlights: Array.isArray(raw.highlights) ? raw.highlights : [],
    notes: Array.isArray(raw.notes) ? raw.notes : [],
  };
}
