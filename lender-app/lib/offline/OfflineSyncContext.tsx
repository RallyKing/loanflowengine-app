"use client";

/**
 * Offline mutation queue + snapshot helpers. Convex queries still drive live UI;
 * when disconnected we persist last snapshots to IndexedDB and replay mutations
 * in order with optimistic concurrency (`expectedUpdatedAt`) to avoid silent
 * overwrites.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { convexPublicHostnameForSnapshotKey } from "@/lib/convexPublicUrl";
import { idbGet, idbSet, OFFLINE_QUEUE_KEY } from "@/lib/offline/idb";
import { isOfflineConflictError } from "@/lib/offline/conflict";
import { isPatchDealConflictResult } from "@/lib/pipeline/patchDealResult";

export type OfflineQueuedMutation =
  | {
      seq: number;
      kind: "pipeline.patch";
      queueKey: string;
      args: Record<string, unknown>;
    }
  | {
      seq: number;
      kind: "pipeline.patchDeal";
      queueKey: string;
      args: Record<string, unknown>;
    }
  | {
      seq: number;
      kind: "tasks.patch";
      queueKey: string;
      args: Record<string, unknown>;
    }
  | {
      seq: number;
      kind: "pipeline.setClientMomentum";
      queueKey: string;
      args: Record<string, unknown>;
    };

type QueueFile = { items: OfflineQueuedMutation[] };

function mergeRecords(a: Record<string, unknown>, b: Record<string, unknown>) {
  return { ...a, ...b };
}

function mergeDealChanges(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...a, ...b };
  const ac = a.cover;
  const bc = b.cover;
  if (
    ac &&
    bc &&
    typeof ac === "object" &&
    !Array.isArray(ac) &&
    typeof bc === "object" &&
    !Array.isArray(bc)
  ) {
    out.cover = { ...ac, ...bc };
  }
  const asp = a.subjectProperty;
  const bsp = b.subjectProperty;
  if (
    asp &&
    bsp &&
    typeof asp === "object" &&
    !Array.isArray(asp) &&
    typeof bsp === "object" &&
    !Array.isArray(bsp)
  ) {
    out.subjectProperty = { ...asp, ...bsp };
  }
  return out;
}

async function loadQueueFile(): Promise<QueueFile> {
  const raw = await idbGet<QueueFile>(OFFLINE_QUEUE_KEY);
  if (raw && Array.isArray(raw.items)) return raw;
  return { items: [] };
}

async function saveQueueFile(items: OfflineQueuedMutation[]) {
  await idbSet(OFFLINE_QUEUE_KEY, { items });
}

type OfflineCtxValue = {
  pendingCount: number;
  conflictNotice: string | null;
  clearConflictNotice: () => void;
  /** Surfaces hub/file sync conflict messaging (online conflicts, multi-tab). */
  surfaceSyncConflict: (message: string) => void;
  /** Flush is called automatically when `isLive`; exposed for tests/UI. */
  flushQueue: () => Promise<void>;
  enqueue: (item: Omit<OfflineQueuedMutation, "seq"> & { seq?: number }) => Promise<void>;
};

const OfflineCtx = createContext<OfflineCtxValue | null>(null);

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const convex = useConvex();
  const { isLive } = useLiveConnection();
  const [items, setItems] = useState<OfflineQueuedMutation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const seqRef = useRef(1);
  const flushingRef = useRef(false);

  useEffect(() => {
    loadQueueFile()
      .then((f) => {
        setItems(f.items);
        const max = f.items.reduce((m, x) => Math.max(m, x.seq), 0);
        seqRef.current = Math.max(seqRef.current, max + 1);
      })
      .finally(() => setLoaded(true));
  }, []);

  const enqueue = useCallback(async (raw: Omit<OfflineQueuedMutation, "seq"> & { seq?: number }) => {
    const file = await loadQueueFile();
    const next = [...file.items];
    const maxSeq = next.reduce((m, x) => Math.max(m, x.seq), 0);
    const seq = raw.seq ?? maxSeq + 1;
    seqRef.current = Math.max(seqRef.current, seq + 1);
    const item = { ...raw, seq } as OfflineQueuedMutation;

    const idx = next.findIndex((x) => x.queueKey === item.queueKey);
    if (idx < 0) {
      next.push(item);
    } else {
      const existing = next[idx];
      if (item.kind === "pipeline.patch" && existing.kind === "pipeline.patch") {
        const ea = existing.args as Record<string, unknown>;
        const fa = item.args as Record<string, unknown>;
        const merged = mergeRecords(ea, fa);
        merged.id = fa.id;
        merged.expectedUpdatedAt = ea.expectedUpdatedAt;
        merged.preferencesAccountId =
          (fa.preferencesAccountId as string | undefined) ??
          (ea.preferencesAccountId as string | undefined);
        next[idx] = { ...existing, args: merged };
      } else if (
        item.kind === "pipeline.patchDeal" &&
        existing.kind === "pipeline.patchDeal"
      ) {
        const ea = existing.args as Record<string, unknown>;
        const fa = item.args as Record<string, unknown>;
        const prevC = (ea.changes as Record<string, unknown>) ?? {};
        const nextC = (fa.changes as Record<string, unknown>) ?? {};
        next[idx] = {
          ...existing,
          args: {
            ...ea,
            ...fa,
            fileId: fa.fileId ?? ea.fileId,
            preferencesAccountId:
              fa.preferencesAccountId ?? ea.preferencesAccountId,
            expectedUpdatedAt: ea.expectedUpdatedAt,
            changes: mergeDealChanges(prevC, nextC),
          },
        };
      } else if (
        item.kind === "pipeline.setClientMomentum" &&
        existing.kind === "pipeline.setClientMomentum"
      ) {
        const ea = existing.args as Record<string, unknown>;
        const fa = item.args as Record<string, unknown>;
        next[idx] = {
          ...existing,
          args: {
            ...ea,
            ...fa,
            id: fa.id ?? ea.id,
            preferencesAccountId:
              fa.preferencesAccountId ?? ea.preferencesAccountId,
            expectedUpdatedAt: ea.expectedUpdatedAt,
          },
        };
      } else if (item.kind === "tasks.patch" && existing.kind === "tasks.patch") {
        const ea = existing.args as Record<string, unknown>;
        const fa = item.args as Record<string, unknown>;
        const merged = mergeRecords(ea, fa);
        merged.id = fa.id;
        merged.expectedUpdatedAt = ea.expectedUpdatedAt;
        merged.actorUserKey = fa.actorUserKey ?? ea.actorUserKey;
        merged.organizationId = fa.organizationId ?? ea.organizationId;
        merged.memberUserKey = fa.memberUserKey ?? ea.memberUserKey;
        next[idx] = { ...existing, args: merged };
      } else {
        next[idx] = item;
      }
    }
    await saveQueueFile(next);
    setItems(next);
  }, []);

  const flushQueue = useCallback(async () => {
    if (!isLive || !loaded || flushingRef.current) return;
    flushingRef.current = true;
    try {
      let q = [...(await loadQueueFile()).items].sort((a, b) => a.seq - b.seq);
      while (q.length > 0) {
        const head = q[0];
        try {
          if (head.kind === "pipeline.patch") {
            await convex.mutation(api.pipeline.patch, head.args as never);
          } else if (head.kind === "pipeline.patchDeal") {
            const res = await convex.mutation(
              api.pipeline.patchDeal,
              head.args as never,
            );
            if (isPatchDealConflictResult(res)) {
              q = q.filter((x) => x.queueKey !== head.queueKey);
              await saveQueueFile(q);
              setItems(q);
              setConflictNotice(
                "Something changed on the server while you were offline. One pending deal edit was dropped so you see the newest file version.",
              );
              continue;
            }
          } else if (head.kind === "pipeline.setClientMomentum") {
            await convex.mutation(
              api.pipeline.setClientMomentum,
              head.args as never,
            );
          } else {
            await convex.mutation(api.tasks.patch, head.args as never);
          }
          q = q.slice(1);
          await saveQueueFile(q);
          setItems(q);
        } catch (e) {
          if (isOfflineConflictError(e)) {
            q = q.filter((x) => x.queueKey !== head.queueKey);
            await saveQueueFile(q);
            setItems(q);
            setConflictNotice(
              "Something changed on the server while you were offline. One pending edit was dropped to avoid overwriting newer data.",
            );
            continue;
          }
          break;
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [convex, isLive, loaded]);

  useEffect(() => {
    if (isLive && loaded) void flushQueue();
  }, [isLive, loaded, flushQueue]);

  const clearConflictNotice = useCallback(() => setConflictNotice(null), []);

  const surfaceSyncConflict = useCallback((message: string) => {
    setConflictNotice(message);
  }, []);

  const value = useMemo(
    () => ({
      pendingCount: items.length,
      conflictNotice,
      clearConflictNotice,
      surfaceSyncConflict,
      flushQueue,
      enqueue,
    }),
    [
      items.length,
      conflictNotice,
      clearConflictNotice,
      surfaceSyncConflict,
      flushQueue,
      enqueue,
    ],
  );

  return <OfflineCtx.Provider value={value}>{children}</OfflineCtx.Provider>;
}

export function useOfflineSync(): OfflineCtxValue {
  const v = useContext(OfflineCtx);
  if (v == null) {
    throw new Error("useOfflineSync requires OfflineSyncProvider");
  }
  return v;
}

/** Snapshot key for `api.pipeline.listTablePreview` query args. */
export function pipelineListSnapshotKey(args: {
  includeArchived: boolean;
  includeSnoozed: boolean;
  organizationId?: string;
}): string {
  const org = args.organizationId ?? "none";
  const dep = convexPublicHostnameForSnapshotKey();
  return `snapshot:pipeline.listTablePreview:${dep}:${org}:${args.includeArchived ? "a1" : "a0"}:${args.includeSnoozed ? "z1" : "z0"}`;
}

export function tasksListSnapshotKey(): string {
  const dep = convexPublicHostnameForSnapshotKey();
  return `snapshot:tasks.getAll:v2:${dep}`;
}

export async function persistQuerySnapshot<T>(key: string, data: T) {
  await idbSet(key, { savedAt: Date.now(), data } as { savedAt: number; data: T });
}

export async function loadQuerySnapshot<T>(key: string): Promise<T | undefined> {
  const row = await idbGet<{ savedAt: number; data: T }>(key);
  return row?.data;
}
