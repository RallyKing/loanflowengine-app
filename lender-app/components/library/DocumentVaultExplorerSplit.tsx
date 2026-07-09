"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

export const VAULT_EXPLORER_WIDTH_DEFAULT = 250;
export const VAULT_EXPLORER_WIDTH_MIN = 150;
export const VAULT_EXPLORER_WIDTH_MAX = 450;
const VAULT_EXPLORER_WIDTH_LS = "dlc-vault-explorer-width";

export type DocumentVaultExplorerSplitProps = {
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
};

export function DocumentVaultExplorerSplit({
  sidebar,
  children,
  className,
}: DocumentVaultExplorerSplitProps) {
  const [sidebarWidth, setSidebarWidth] = useState(VAULT_EXPLORER_WIDTH_DEFAULT);
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(VAULT_EXPLORER_WIDTH_DEFAULT);
  const liveW = useRef(VAULT_EXPLORER_WIDTH_DEFAULT);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VAULT_EXPLORER_WIDTH_LS);
      if (!raw) return;
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        const clamped = Math.min(
          VAULT_EXPLORER_WIDTH_MAX,
          Math.max(VAULT_EXPLORER_WIDTH_MIN, parsed),
        );
        setSidebarWidth(clamped);
        liveW.current = clamped;
      }
    } catch {
      /* private mode */
    }
  }, []);

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragging.current = true;
      dragStartX.current = e.clientX;
      dragStartW.current = sidebarWidth;
      liveW.current = sidebarWidth;
    },
    [sidebarWidth],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - dragStartX.current;
      const next = Math.min(
        VAULT_EXPLORER_WIDTH_MAX,
        Math.max(VAULT_EXPLORER_WIDTH_MIN, dragStartW.current + dx),
      );
      liveW.current = next;
      setSidebarWidth(next);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      try {
        localStorage.setItem(VAULT_EXPLORER_WIDTH_LS, String(liveW.current));
      } catch {
        /* private mode */
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div
      className={cn(
        "flex min-h-[28rem] min-w-0 flex-col gap-4 lg:flex-row lg:gap-0",
        className,
      )}
      data-testid="document-vault-master-detail"
      style={{ ["--vault-explorer-w" as string]: `${sidebarWidth}px` }}
    >
      <div
        className="min-h-[12rem] w-full min-w-0 shrink-0 lg:min-h-0 lg:w-[var(--vault-explorer-w)]"
        data-testid="document-vault-explorer-pane"
      >
        {sidebar}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize explorer"
        tabIndex={0}
        onPointerDown={onResizePointerDown}
        className={cn(
          "hidden shrink-0 lg:block",
          "w-1 cursor-col-resize bg-border/40 transition-colors duration-dlc-short ease-dlc-standard",
          "hover:bg-primary/30 active:bg-primary/40",
        )}
        data-testid="document-vault-explorer-resize-handle"
        style={{ touchAction: "none" }}
      />

      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch"
        data-testid="document-vault-workbench"
      >
        {children}
      </div>
    </div>
  );
}
