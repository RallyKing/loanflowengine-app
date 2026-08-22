"use client";

/**
 * Host for pipeline “window-in-window” detached blocks.
 *
 * Detach registry + FloatingWindow shells live here (above tab panels) so
 * switching Overview ↔ Documents (etc.) does not unmount floating panels.
 * Block body content is owned by this host once detached (refs + host-local
 * bump), so hooks keep running while the inactive tab’s CollapsibleBlock
 * unmounts — without re-rendering the whole workspace tree on each sync.
 *
 * Ancestor providers required for detached content (host is a *sibling* of
 * tab panels, not inside them):
 * - DocumentVaultStateProvider (Document Vault directory tree)
 * - DealWorkspaceEditorProvider / ClientBlockAssignProvider (already above
 *   this host in PipelineFileWorkspace)
 *
 * Do not place block-specific providers only inside a tab panel — WiW will
 * render outside that subtree and hooks will throw.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { PanelTopClose } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FloatingWindow } from "@/components/ui/FloatingWindow";
import { cn } from "@/lib/cn";

export type FloatingBlockWindowDetachInput = {
  blockKey: string;
  title: string;
  persistKey?: string;
  cascadeIndex?: number;
  description?: ReactNode;
  contentClassName?: string;
  content?: ReactNode;
  trailingExtra?: ReactNode;
  /** Optional jump action (e.g. favorites bar). Survives CollapsibleBlock sync. */
  onGoToSection?: () => void;
  testId?: string;
};

export type FloatingBlockWindowSyncPatch = {
  title?: string;
  description?: ReactNode;
  contentClassName?: string;
  content?: ReactNode;
  trailingExtra?: ReactNode;
  /** Pass `null` to clear; omit to preserve. */
  onGoToSection?: (() => void) | null;
  testId?: string;
};

type WindowMeta = {
  blockKey: string;
  persistKey?: string;
  cascadeIndex: number;
};

type WindowBody = {
  title: string;
  description?: ReactNode;
  contentClassName?: string;
  content: ReactNode;
  trailingExtra?: ReactNode;
  onGoToSection?: () => void;
  testId?: string;
};

type FloatingBlockWindowContextValue = {
  isDetached: (blockKey: string) => boolean;
  detach: (input: FloatingBlockWindowDetachInput) => void;
  sync: (blockKey: string, patch: FloatingBlockWindowSyncPatch) => void;
  reattach: (blockKey: string) => void;
  /**
   * Ask the matching mounted `CollapsibleBlock` to run its normal detach path
   * (same as “Open in window”). Favorites / deep-links use this when the block
   * may still need to mount on another tab.
   */
  requestDetach: (blockKey: string) => void;
  /** True while a favorites/deep-link detach is waiting for the block to mount. */
  hasPendingDetach: (blockKey: string) => boolean;
  /** CollapsibleBlock: clear a consumed pending request. */
  clearPendingDetach: (blockKey: string) => void;
};

const FloatingBlockWindowContext =
  createContext<FloatingBlockWindowContextValue | null>(null);

let cascadeSeq = 0;

export function nextFloatingBlockCascadeIndex(): number {
  cascadeSeq += 1;
  return cascadeSeq;
}

export function useFloatingBlockWindow(): FloatingBlockWindowContextValue | null {
  return useContext(FloatingBlockWindowContext);
}

function FloatingBlockWindowHost({
  windows,
  bodiesRef,
  bumpRef,
  reattach,
}: {
  windows: WindowMeta[];
  bodiesRef: MutableRefObject<Map<string, WindowBody>>;
  bumpRef: MutableRefObject<(() => void) | null>;
  reattach: (blockKey: string) => void;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    bumpRef.current = () => setTick((t) => t + 1);
    return () => {
      bumpRef.current = null;
    };
  }, [bumpRef]);

  return (
    <>
      {windows.map((w) => {
        const body = bodiesRef.current.get(w.blockKey);
        const title = body?.title ?? w.blockKey;
        return (
          <FloatingWindow
            key={w.blockKey}
            title={title}
            onClose={() => reattach(w.blockKey)}
            persistKey={w.persistKey}
            cascadeIndex={w.cascadeIndex}
            data-testid={body?.testId ?? `${w.blockKey}-floating-window`}
            trailing={
              <span className="inline-flex items-center gap-0.5">
                {body?.trailingExtra}
                {body?.onGoToSection ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 min-h-[36px] px-2 text-xs"
                    data-no-drag
                    data-testid={`${w.blockKey}-go-to-section`}
                    onClick={() => {
                      const go = body.onGoToSection;
                      reattach(w.blockKey);
                      go?.();
                    }}
                  >
                    Go to section
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 min-h-[36px] gap-1 px-2 text-xs"
                  aria-label={`Return ${title} to file`}
                  title="Return to file"
                  data-no-drag
                  data-testid={`${w.blockKey}-reattach-window`}
                  onClick={() => reattach(w.blockKey)}
                >
                  <PanelTopClose className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden sm:inline">Return</span>
                </Button>
              </span>
            }
          >
            {body?.description ? (
              <p className="mb-3 shrink-0 px-3 pt-3 text-xs leading-relaxed text-muted-foreground sm:px-3.5 sm:pt-3.5">
                {body.description}
              </p>
            ) : null}
            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain touch-scroll-y p-3 sm:p-3.5",
                body?.contentClassName,
              )}
            >
              {body?.content}
            </div>
          </FloatingWindow>
        );
      })}
    </>
  );
}

export function FloatingBlockWindowProvider({
  children,
  /** When the open pipeline file changes, clear detached windows. */
  scopeKey,
}: {
  children: ReactNode;
  scopeKey?: string;
}) {
  const [windows, setWindows] = useState<WindowMeta[]>([]);
  const [pendingDetachKeys, setPendingDetachKeys] = useState<readonly string[]>(
    [],
  );
  const bodiesRef = useRef(new Map<string, WindowBody>());
  const hostBumpRef = useRef<(() => void) | null>(null);
  const scopeRef = useRef(scopeKey);

  const bumpHost = useCallback(() => {
    hostBumpRef.current?.();
  }, []);

  useEffect(() => {
    if (scopeRef.current === scopeKey) return;
    scopeRef.current = scopeKey;
    bodiesRef.current.clear();
    setWindows([]);
    setPendingDetachKeys([]);
    bumpHost();
  }, [scopeKey, bumpHost]);

  const isDetached = useCallback(
    (blockKey: string) => windows.some((w) => w.blockKey === blockKey.trim()),
    [windows],
  );

  const requestDetach = useCallback((blockKey: string) => {
    const key = blockKey.trim();
    if (!key) return;
    setPendingDetachKeys((prev) =>
      prev.includes(key) ? prev : [...prev, key],
    );
  }, []);

  const hasPendingDetach = useCallback(
    (blockKey: string) => pendingDetachKeys.includes(blockKey.trim()),
    [pendingDetachKeys],
  );

  const clearPendingDetach = useCallback((blockKey: string) => {
    const key = blockKey.trim();
    if (!key) return;
    setPendingDetachKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : prev,
    );
  }, []);

  const detach = useCallback(
    (input: FloatingBlockWindowDetachInput) => {
      const key = input.blockKey.trim();
      if (!key) return;
      const cascadeIndex =
        input.cascadeIndex ?? nextFloatingBlockCascadeIndex();
      bodiesRef.current.set(key, {
        title: input.title,
        description: input.description,
        contentClassName: input.contentClassName,
        content: input.content ?? null,
        trailingExtra: input.trailingExtra,
        onGoToSection: input.onGoToSection,
        testId: input.testId,
      });
      setWindows((prev) => {
        const meta: WindowMeta = {
          blockKey: key,
          persistKey: input.persistKey,
          cascadeIndex,
        };
        const idx = prev.findIndex((w) => w.blockKey === key);
        if (idx === -1) return [...prev, meta];
        const copy = prev.slice();
        const existing = copy[idx]!;
        copy[idx] = {
          ...meta,
          cascadeIndex: existing.cascadeIndex,
        };
        return copy;
      });
      bumpHost();
    },
    [bumpHost],
  );

  const sync = useCallback(
    (blockKey: string, patch: FloatingBlockWindowSyncPatch) => {
      const key = blockKey.trim();
      if (!key) return;
      const prevBody = bodiesRef.current.get(key);
      if (!prevBody) return;
      bodiesRef.current.set(key, {
        title: patch.title !== undefined ? patch.title : prevBody.title,
        description:
          patch.description !== undefined
            ? patch.description
            : prevBody.description,
        contentClassName:
          patch.contentClassName !== undefined
            ? patch.contentClassName
            : prevBody.contentClassName,
        content:
          patch.content !== undefined ? patch.content : prevBody.content,
        trailingExtra:
          patch.trailingExtra !== undefined
            ? patch.trailingExtra
            : prevBody.trailingExtra,
        onGoToSection:
          patch.onGoToSection !== undefined
            ? patch.onGoToSection ?? undefined
            : prevBody.onGoToSection,
        testId: patch.testId !== undefined ? patch.testId : prevBody.testId,
      });
      // Host-local bump only — must not setState on the provider or children loop.
      bumpHost();
    },
    [bumpHost],
  );

  const reattach = useCallback(
    (blockKey: string) => {
      const key = blockKey.trim();
      if (!key) return;
      bodiesRef.current.delete(key);
      setPendingDetachKeys((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : prev,
      );
      setWindows((prev) => prev.filter((w) => w.blockKey !== key));
      bumpHost();
    },
    [bumpHost],
  );

  const value = useMemo<FloatingBlockWindowContextValue>(
    () => ({
      isDetached,
      detach,
      sync,
      reattach,
      requestDetach,
      hasPendingDetach,
      clearPendingDetach,
    }),
    [
      isDetached,
      detach,
      sync,
      reattach,
      requestDetach,
      hasPendingDetach,
      clearPendingDetach,
    ],
  );

  return (
    <FloatingBlockWindowContext.Provider value={value}>
      {children}
      <FloatingBlockWindowHost
        windows={windows}
        bodiesRef={bodiesRef}
        bumpRef={hostBumpRef}
        reattach={reattach}
      />
    </FloatingBlockWindowContext.Provider>
  );
}
