import type { Id } from "@/convex/_generated/dataModel";
import type { FileSharedNumericFieldKey } from "@/lib/fileSharedFields";

export type BlockLocalOverrideEntry = Partial<
  Record<FileSharedNumericFieldKey, number>
>;

/** Stable empty snapshot for `useSyncExternalStore` / SSR. */
export const EMPTY_BLOCK_LOCAL_OVERRIDES: Readonly<BlockLocalOverrideEntry> =
  Object.freeze({});

function compoundKey(fileId: Id<"pipeline">, blockId: string): string {
  return `${fileId}\0${blockId}`;
}

/**
 * Ephemeral per-(file, block) numeric overrides layered **above** Convex
 * `getResolvedForBlock` (`displayValue = local ?? serverDisplay`).
 * Subscribers get a stable snapshot reference until the entry mutates.
 */
class BlockDataLocalOverrideStore {
  private entries = new Map<string, BlockLocalOverrideEntry>();
  private listeners = new Map<string, Set<() => void>>();

  subscribe(
    fileId: Id<"pipeline">,
    blockId: string,
    onStoreChange: () => void
  ): () => void {
    const key = compoundKey(fileId, blockId);
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(onStoreChange);
    return () => {
      set!.delete(onStoreChange);
      if (set!.size === 0) {
        this.listeners.delete(key);
      }
    };
  }

  getSnapshot(fileId: Id<"pipeline">, blockId: string): BlockLocalOverrideEntry {
    return this.entries.get(compoundKey(fileId, blockId)) ?? EMPTY_BLOCK_LOCAL_OVERRIDES;
  }

  setField(
    fileId: Id<"pipeline">,
    blockId: string,
    field: FileSharedNumericFieldKey,
    value: number | undefined
  ): void {
    const key = compoundKey(fileId, blockId);
    const prev = this.entries.get(key) ?? {};
    const next: BlockLocalOverrideEntry = { ...prev };
    if (value === undefined || !Number.isFinite(value)) {
      delete next[field];
    } else {
      next[field] = value;
    }
    if (Object.keys(next).length === 0) {
      this.entries.delete(key);
    } else {
      this.entries.set(key, next);
    }
    this.emit(key);
  }

  clear(fileId: Id<"pipeline">, blockId: string): void {
    const key = compoundKey(fileId, blockId);
    if (!this.entries.has(key)) return;
    this.entries.delete(key);
    this.emit(key);
  }

  private emit(key: string): void {
    const set = this.listeners.get(key);
    if (!set) return;
    for (const fn of set) {
      fn();
    }
  }
}

export const blockDataLocalOverrideStore = new BlockDataLocalOverrideStore();
