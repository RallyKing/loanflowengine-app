"use client";

import { useMutation, useQuery } from "convex/react";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DealWorkspaceSheet } from "@/lib/file/dealSectionTypes";
import type { DealWorkspaceUpdater } from "@/lib/file/dealSectionTypes";
import {
  extractFormDataForAtomicBlock,
  hasSubstantivePortalSubmission,
} from "@/lib/clientPortalFormExtract";
import {
  isAtomicPortalBlockId,
  type AtomicPortalBlockId,
} from "@/lib/atomicPortalBlockRegistry";

const AUTOSAVE_DEBOUNCE_MS = 1000;
const REMOTE_SYNC_PAUSE_MS = 1500;

export type PortalConstructionBudgetLine = {
  _id: Id<"constructionBudgetLines">;
  sortOrder: number;
  category: string;
  description?: string;
  budgetAmount?: string;
  spentAmount?: string;
  drawNumber?: string;
  status: "planned" | "in_progress" | "complete" | "on_hold";
};

export type ClientPortalBlockSession = {
  status: "loading" | "error" | "ready";
  errorMessage?: string;
  portalEditorFileId?: Id<"pipeline">;
  readOnlyPreview?: boolean;
  draft: DealWorkspaceSheet | null;
  updateSheet: DealWorkspaceUpdater;
  constructionBudgetLines: PortalConstructionBudgetLine[];
  moduleDrafts: Record<string, Record<string, unknown>>;
  setModuleDraft: (blockId: string, patch: Record<string, unknown>) => void;
  extractFormData: (blockId: AtomicPortalBlockId) => Record<string, unknown>;
  canSubmitBlock: (blockId: AtomicPortalBlockId) => boolean;
  scheduleAutosave: (blockId: AtomicPortalBlockId) => void;
  flushAutosave: (blockId: AtomicPortalBlockId) => void;
  autosaveStatus: "idle" | "pending" | "saving";
};

const ClientPortalBlockSessionContext =
  createContext<ClientPortalBlockSession | null>(null);

export function useClientPortalBlockSession(): ClientPortalBlockSession {
  const ctx = useContext(ClientPortalBlockSessionContext);
  if (!ctx) {
    throw new Error(
      "useClientPortalBlockSession must be used within ClientPortalBlockSessionProvider",
    );
  }
  return ctx;
}

export function useClientPortalBlockSessionOptional(): ClientPortalBlockSession | null {
  return useContext(ClientPortalBlockSessionContext);
}

export type ClientPortalBlockSessionProviderProps = {
  bundleToken: string;
  fileTaskId: Id<"documentVaultFileTasks">;
  children: ReactNode;
};

export function ClientPortalBlockSessionProvider({
  bundleToken,
  fileTaskId,
  children,
}: ClientPortalBlockSessionProviderProps) {
  const portalSheet = useQuery(
    api.documentVaultClientBundlePortal.getPortalDealSheet,
    { bundleToken, fileTaskId },
  );
  const autosaveDraft = useMutation(
    api.documentVaultClientBundlePortal.autosaveClientBlockDraftFromBundle,
  );

  const [draft, setDraft] = useState<DealWorkspaceSheet | null>(null);
  const [moduleDrafts, setModuleDrafts] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [localDirty, setLocalDirty] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<
    "idle" | "pending" | "saving"
  >("idle");

  const lastSyncedUpdatedAt = useRef<number | undefined>(undefined);
  const lastLocalEditAt = useRef(0);
  const autosaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const savingBlocks = useRef<Set<string>>(new Set());
  const draftRef = useRef<DealWorkspaceSheet | null>(null);
  const moduleDraftsRef = useRef(moduleDrafts);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    moduleDraftsRef.current = moduleDrafts;
  }, [moduleDrafts]);

  useEffect(() => {
    if (portalSheet?.status !== "ok" || !portalSheet.sheet) return;

    const remoteAt = portalSheet.pipelineUpdatedAt;
    const remoteChanged =
      lastSyncedUpdatedAt.current !== undefined &&
      remoteAt !== lastSyncedUpdatedAt.current;
    const userPaused =
      Date.now() - lastLocalEditAt.current >= REMOTE_SYNC_PAUSE_MS;
    const canAcceptRemote =
      !localDirty ||
      (remoteChanged && userPaused && savingBlocks.current.size === 0);

    if (canAcceptRemote) {
      setDraft(portalSheet.sheet as DealWorkspaceSheet);
      if (remoteChanged) {
        setModuleDrafts({});
        setLocalDirty(false);
        setAutosaveStatus("idle");
      }
    }

    lastSyncedUpdatedAt.current = remoteAt;
  }, [portalSheet, localDirty]);

  const persistBlock = useCallback(
    async (blockId: AtomicPortalBlockId) => {
      if (portalSheet?.status !== "ok" || portalSheet.readOnlyPreview) return;
      if (!isAtomicPortalBlockId(blockId)) return;
      const currentDraft = draftRef.current;
      if (!currentDraft) return;

      const formData = extractFormDataForAtomicBlock(
        blockId,
        currentDraft,
        moduleDraftsRef.current[blockId],
      );

      savingBlocks.current.add(blockId);
      setAutosaveStatus("saving");
      try {
        const result = await autosaveDraft({
          bundleToken,
          fileTaskId,
          blockId,
          formData,
        });
        setLocalDirty(false);
        if (result.pipelineUpdatedAt != null) {
          lastSyncedUpdatedAt.current = result.pipelineUpdatedAt;
        }
        setAutosaveStatus("idle");
      } catch {
        setAutosaveStatus("idle");
      } finally {
        savingBlocks.current.delete(blockId);
      }
    },
    [autosaveDraft, bundleToken, fileTaskId, portalSheet],
  );

  const scheduleAutosave = useCallback(
    (blockId: AtomicPortalBlockId) => {
      if (portalSheet?.status !== "ok" || portalSheet.readOnlyPreview) return;
      setAutosaveStatus("pending");
      const existing = autosaveTimers.current.get(blockId);
      if (existing) clearTimeout(existing);
      autosaveTimers.current.set(
        blockId,
        setTimeout(() => {
          autosaveTimers.current.delete(blockId);
          void persistBlock(blockId);
        }, AUTOSAVE_DEBOUNCE_MS),
      );
    },
    [persistBlock, portalSheet],
  );

  const flushAutosave = useCallback(
    (blockId: AtomicPortalBlockId) => {
      const existing = autosaveTimers.current.get(blockId);
      if (existing) clearTimeout(existing);
      autosaveTimers.current.delete(blockId);
      void persistBlock(blockId);
    },
    [persistBlock],
  );

  useEffect(() => {
    const timers = autosaveTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const updateSheet = useCallback<DealWorkspaceUpdater>((key, value) => {
    setLocalDirty(true);
    lastLocalEditAt.current = Date.now();
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const setModuleDraft = useCallback(
    (blockId: string, patch: Record<string, unknown>) => {
      setLocalDirty(true);
      lastLocalEditAt.current = Date.now();
      setModuleDrafts((prev) => ({
        ...prev,
        [blockId]: { ...(prev[blockId] ?? {}), ...patch },
      }));
    },
    [],
  );

  const session = useMemo((): ClientPortalBlockSession => {
    if (portalSheet === undefined) {
      return {
        status: "loading",
        draft: null,
        updateSheet,
        constructionBudgetLines: [],
        moduleDrafts,
        setModuleDraft,
        extractFormData: () => ({}),
        canSubmitBlock: () => false,
        scheduleAutosave: () => {},
        flushAutosave: () => {},
        autosaveStatus: "idle",
      };
    }
    if (portalSheet.status !== "ok") {
      return {
        status: "error",
        errorMessage:
          portalSheet.status === "expired"
            ? "This portal link has expired."
            : portalSheet.status === "unauthorized"
              ? "This task is not included in your portal link."
              : "Unable to load form data.",
        draft: null,
        updateSheet,
        constructionBudgetLines: [],
        moduleDrafts,
        setModuleDraft,
        extractFormData: () => ({}),
        canSubmitBlock: () => false,
        scheduleAutosave: () => {},
        flushAutosave: () => {},
        autosaveStatus: "idle",
      };
    }

    const extractFormData = (blockId: AtomicPortalBlockId) => {
      if (!draft) return {};
      return extractFormDataForAtomicBlock(
        blockId,
        draft,
        moduleDrafts[blockId],
      );
    };

    const canSubmitBlock = (blockId: AtomicPortalBlockId) => {
      if (portalSheet.readOnlyPreview) return false;
      const editable = portalSheet.blockEditable?.[blockId] === true;
      if (!editable) return false;
      return hasSubstantivePortalSubmission(blockId, extractFormData(blockId));
    };

    return {
      status: "ready",
      readOnlyPreview: portalSheet.readOnlyPreview,
      portalEditorFileId: portalSheet.portalEditorFileId,
      draft,
      updateSheet,
      constructionBudgetLines: portalSheet.constructionBudgetLines ?? [],
      moduleDrafts,
      setModuleDraft,
      extractFormData,
      canSubmitBlock,
      scheduleAutosave,
      flushAutosave,
      autosaveStatus,
    };
  }, [
    portalSheet,
    draft,
    moduleDrafts,
    setModuleDraft,
    updateSheet,
    scheduleAutosave,
    flushAutosave,
    autosaveStatus,
  ]);

  return (
    <ClientPortalBlockSessionContext.Provider value={session}>
      {children}
    </ClientPortalBlockSessionContext.Provider>
  );
}

export function isPortalBlockSessionReady(
  session: ClientPortalBlockSession,
): session is ClientPortalBlockSession & {
  status: "ready";
  draft: DealWorkspaceSheet;
} {
  return session.status === "ready" && session.draft != null;
}
