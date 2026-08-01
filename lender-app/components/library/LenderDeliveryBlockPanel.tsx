"use client";

import { useQuery } from "convex/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { DealWorkspaceSheet } from "@/lib/file/dealSectionTypes";
import { AtomicPortalBlockList } from "@/components/library/AtomicPortalBlockRenderer";
import { isClientPortalAssignableBlock } from "@/lib/documentVaultClientBlocks";

type LenderDeliveryBlockSession = {
  status: "loading" | "error" | "ready";
  errorMessage?: string;
  pipelineFileId?: Id<"pipeline">;
  draft: DealWorkspaceSheet | null;
  constructionBudgetLines: Doc<"constructionBudgetLines">[];
};

const LenderDeliveryBlockSessionContext =
  createContext<LenderDeliveryBlockSession | null>(null);

export function useLenderDeliveryBlockSession(): LenderDeliveryBlockSession {
  const ctx = useContext(LenderDeliveryBlockSessionContext);
  if (!ctx) {
    throw new Error(
      "useLenderDeliveryBlockSession must be used within LenderDeliveryBlockSessionProvider",
    );
  }
  return ctx;
}

export function useLenderDeliveryBlockSessionOptional(): LenderDeliveryBlockSession | null {
  return useContext(LenderDeliveryBlockSessionContext);
}

export function LenderDeliveryBlockSessionProvider({
  deliveryToken,
  fileTaskId,
  children,
}: {
  deliveryToken: string;
  fileTaskId: Id<"documentVaultFileTasks">;
  children: ReactNode;
}) {
  const sheet = useQuery(api.lenderDeliveryPortal.getLenderDeliveryDealSheet, {
    token: deliveryToken,
    fileTaskId,
  });
  const [draft, setDraft] = useState<DealWorkspaceSheet | null>(null);

  useEffect(() => {
    if (sheet?.status === "ok" && sheet.sheet) {
      setDraft(sheet.sheet as DealWorkspaceSheet);
    }
  }, [sheet]);

  const session = useMemo((): LenderDeliveryBlockSession => {
    if (sheet === undefined) {
      return { status: "loading", draft: null, constructionBudgetLines: [] };
    }
    if (sheet.status !== "ok") {
      return {
        status: "error",
        errorMessage: "Unable to load deal data for this package.",
        draft: null,
        constructionBudgetLines: [],
      };
    }
    return {
      status: "ready",
      pipelineFileId: sheet.pipelineFileId,
      draft,
      constructionBudgetLines: sheet.constructionBudgetLines ?? [],
    };
  }, [draft, sheet]);

  return (
    <LenderDeliveryBlockSessionContext.Provider value={session}>
      {children}
    </LenderDeliveryBlockSessionContext.Provider>
  );
}

export function LenderDeliveryBlockPanel({
  deliveryToken,
  fileTaskId,
  pipelineFileId,
  assignedBlocks,
  taskTitle,
}: {
  deliveryToken: string;
  fileTaskId: Id<"documentVaultFileTasks">;
  pipelineFileId: Id<"pipeline">;
  assignedBlocks: string[];
  taskTitle: string;
}) {
  const blocks = assignedBlocks.filter((id) => isClientPortalAssignableBlock(id));
  if (blocks.length === 0) return null;

  return (
    <LenderDeliveryBlockSessionProvider
      deliveryToken={deliveryToken}
      fileTaskId={fileTaskId}
    >
      <LenderDeliveryBlockPanelInner
        pipelineFileId={pipelineFileId}
        blocks={blocks}
        taskTitle={taskTitle}
      />
    </LenderDeliveryBlockSessionProvider>
  );
}

function LenderDeliveryBlockPanelInner({
  pipelineFileId,
  blocks,
  taskTitle,
}: {
  pipelineFileId: Id<"pipeline">;
  blocks: string[];
  taskTitle: string;
}) {
  const session = useLenderDeliveryBlockSession();

  if (session.status === "loading") {
    return (
      <p className="text-xs text-muted-foreground">Loading {taskTitle}…</p>
    );
  }
  if (session.status === "error") {
    return (
      <p className="text-xs text-red-700" role="alert">
        {session.errorMessage}
      </p>
    );
  }

  return (
    <section
      className="rounded-dlc-lg border border-border/70 bg-white p-4 shadow-dlc-1"
      data-testid={`lender-data-room-task-${taskTitle}`}
    >
      <h2 className="text-sm font-semibold text-foreground">{taskTitle}</h2>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        Read-only deal data
      </p>
      <div className="mt-3">
        <AtomicPortalBlockList
          blockIds={blocks}
          pipelineFileId={pipelineFileId}
          portalMode
          readOnly
          useCollapsibleChrome
        />
      </div>
    </section>
  );
}
