/**
 * Undo / revert specs stored on `pipelineFileActivity` rows (verified rollback).
 */

import type { Doc, Id } from "../convex/_generated/dataModel";
import {
  normalizePipelineDrawerLayout,
  type PipelineDrawerLayoutV1,
} from "./pipelineDrawerLayoutStorage";

export type UndoSpec =
  | {
      v: 1;
      kind: "pipeline_fields";
      keys: string[];
      /** Values to re-apply with `pipeline.patch`-style semantics (cloned JSON). */
      pre: Record<string, unknown>;
    }
  | {
      v: 1;
      kind: "drawer_layout";
      /** Normalized layout before the change. */
      pre: PipelineDrawerLayoutV1;
    }
  | {
      v: 1;
      kind: "block_overrides";
      pre: Record<string, { n: number; updatedAt: number }> | undefined;
    }
  | {
      v: 1;
      kind: "contact_link_patch";
      linkId: Id<"contactFileLinks">;
      pre: { role: string; notes: string | undefined };
    }
  | {
      v: 1;
      kind: "contact_link_insert";
      linkId: Id<"contactFileLinks">;
    }
  | {
      v: 1;
      kind: "contact_unlink_restore";
      contactId: Id<"contacts">;
      fileId: Id<"pipeline">;
      role: string;
      notes: string | undefined;
      createdAt: number;
      updatedAt: number;
    }
  | {
      v: 1;
      kind: "lenders_state";
      pre: {
        lenders: Id<"lenders">[];
        selectedLenderId: Id<"lenders"> | undefined;
        selectedLenderSentAt: number | undefined;
      };
    };

export function patchKeysForUndo(
  patchObj: Record<string, unknown>,
): string[] {
  return Object.keys(patchObj).filter((k) => k !== "updatedAt");
}

export function snapshotPipelineFields(
  doc: Doc<"pipeline">,
  keys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const d = doc as unknown as Record<string, unknown>;
  for (const k of keys) {
    const v = d[k];
    out[k] = v === undefined ? undefined : cloneJson(v);
  }
  return out;
}

export function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function stableValueKey(x: unknown): string {
  try {
    return JSON.stringify(sortJsonForStableKey(x));
  } catch {
    return String(x);
  }
}

function sortJsonForStableKey(x: unknown): unknown {
  if (x === null || typeof x !== "object") return x;
  if (Array.isArray(x)) return x.map(sortJsonForStableKey);
  const o = x as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = sortJsonForStableKey(o[k]);
  }
  return out;
}

export function pipelineFieldsMatchSnapshot(
  doc: Doc<"pipeline">,
  expect: Record<string, unknown>,
  keys: string[],
): boolean {
  const cur = snapshotPipelineFields(doc, keys);
  return stableValueKey(cur) === stableValueKey(expect);
}

export function drawerLayoutStableKey(fileDrawerLayout: unknown): string {
  const n = normalizePipelineDrawerLayout(fileDrawerLayout);
  return stableValueKey({
    order: n.order,
    hidden: n.hidden,
    settings: n.settings ?? {},
  });
}

/** Compare persisted drawer layout (sections + block settings) to an expected stable key. */
export function drawerLayoutMatchesExpectation(
  fileDrawerLayout: Doc<"pipeline">["fileDrawerLayout"],
  expectKey: string,
): boolean {
  return drawerLayoutStableKey(fileDrawerLayout) === expectKey;
}

export const MAX_UNDO_PAYLOAD_CHARS = 48_000;

/** Caps arbitrary undo blobs (layout JSON, lender snapshots, etc.). */
export function undoJsonPairWithinLimit(a: unknown, b: unknown): boolean {
  try {
    return (
      JSON.stringify(a).length + JSON.stringify(b).length <=
      MAX_UNDO_PAYLOAD_CHARS
    );
  } catch {
    return false;
  }
}

export function undoPayloadWithinLimit(
  pre: Record<string, unknown>,
  post: Record<string, unknown>,
): boolean {
  try {
    return (
      JSON.stringify(pre).length + JSON.stringify(post).length <=
      MAX_UNDO_PAYLOAD_CHARS
    );
  } catch {
    return false;
  }
}
