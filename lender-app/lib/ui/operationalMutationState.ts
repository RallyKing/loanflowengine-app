/**
 * Phase 18.8C — deterministic operational mutation state machine (UI only).
 *
 * Goals:
 * - Provide a shared, retry-safe wrapper for destructive/critical mutations.
 * - Ensure pending state ALWAYS clears and errors are ALWAYS surfaced.
 * - Allow safe dismiss/cancel without leaving frozen overlays (results ignored after cancel).
 *
 * This is intentionally UI-scoped (no schema/ACL/graph changes).
 */
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { convexClientErrorMessage } from "@/lib/ui/convexErrorMessage";
import { withOperationalTimeout } from "@/lib/ui/operationalAsync";

export type OperationalMutationStatus =
  | "idle"
  | "confirming"
  | "executing"
  | "success"
  | "failed"
  | "timeout";

export type OperationalMutationError = {
  /** Human-readable operational message (safe for UI). */
  message: string;
  /** Optional technical details (expandable disclosure). */
  details?: string;
  /** Categorization for diagnostics / analytics (best-effort). */
  kind?:
    | "permission"
    | "ownership"
    | "validation"
    | "conflict"
    | "network"
    | "timeout"
    | "unknown";
};

export type OperationalMutationState = {
  status: OperationalMutationStatus;
  busy: boolean;
  error: OperationalMutationError | null;
  lastRunId: number;
};

function classifyErrorKind(message: string): OperationalMutationError["kind"] {
  const m = message.toLowerCase();
  if (m.includes("permission") || m.includes("not authorized") || m.includes("unauthorized")) {
    return "permission";
  }
  if (m.includes("owner") || m.includes("ownership")) return "ownership";
  if (m.includes("invalid") || m.includes("required") || m.includes("must")) return "validation";
  if (m.includes("conflict") || m.includes("stale") || m.includes("expected")) return "conflict";
  if (m.includes("network") || m.includes("offline") || m.includes("fetch")) return "network";
  if (m.includes("timeout") || m.includes("taking longer")) return "timeout";
  return "unknown";
}

export type UseOperationalMutationStateOptions = {
  timeoutMs?: number;
  timeoutMessage?: string;
};

export type OperationalMutationController = OperationalMutationState & {
  /** Begins execution; rejects duplicate submits while busy. */
  execute: (work: () => void | Promise<void>) => Promise<{ ok: true } | { ok: false }>;
  /** Clears error and returns to idle/confirming-safe state. */
  reset: () => void;
  /**
   * Cancels the current run from the UI perspective.
   * The underlying promise may still complete, but its result is ignored.
   */
  cancel: () => void;
  /** Whether the UI should allow closing the dialog right now. */
  closeAllowed: boolean;
};

export function useOperationalMutationState(
  opts?: UseOperationalMutationStateOptions,
): OperationalMutationController {
  const timeoutMs = Math.max(1_000, opts?.timeoutMs ?? 25_000);
  const timeoutMessage =
    opts?.timeoutMessage ??
    "This is taking longer than expected. Check your connection, then try again.";

  const runIdRef = useRef(0);
  const busyRef = useRef(false);
  const [state, setState] = useState<OperationalMutationState>({
    status: "idle",
    busy: false,
    error: null,
    lastRunId: 0,
  });

  const reset = useCallback(() => {
    busyRef.current = false;
    setState((s) => ({
      ...s,
      status: "idle",
      busy: false,
      error: null,
    }));
  }, []);

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    busyRef.current = false;
    setState((s) => ({
      ...s,
      status: "idle",
      busy: false,
      error: null,
      lastRunId: runIdRef.current,
    }));
  }, []);

  const execute = useCallback(
    async (work: () => void | Promise<void>) => {
      if (busyRef.current) return { ok: false as const };

      const runId = (runIdRef.current += 1);
      busyRef.current = true;
      setState((s) => ({
        ...s,
        status: "executing",
        busy: true,
        error: null,
        lastRunId: runId,
      }));

      try {
        const res = await withOperationalTimeout(Promise.resolve(work()), {
          timeoutMs,
          message: timeoutMessage,
        });
        // If cancelled/dismissed, ignore.
        if (runId !== runIdRef.current) {
          busyRef.current = false;
          return { ok: false as const };
        }

        if (!res.ok) {
          busyRef.current = false;
          setState((s) => ({
            ...s,
            status: "timeout",
            busy: false,
            error: {
              message: res.message,
              kind: "timeout",
            },
          }));
          return { ok: false as const };
        }

        busyRef.current = false;
        setState((s) => ({
          ...s,
          status: "success",
          busy: false,
          error: null,
        }));
        return { ok: true as const };
      } catch (e) {
        // If cancelled/dismissed, ignore.
        if (runId !== runIdRef.current) {
          busyRef.current = false;
          return { ok: false as const };
        }

        const message = convexClientErrorMessage(e);
        busyRef.current = false;
        setState((s) => ({
          ...s,
          status: "failed",
          busy: false,
          error: {
            message,
            details: e instanceof Error ? e.stack : undefined,
            kind: classifyErrorKind(message),
          },
        }));
        return { ok: false as const };
      }
    },
    [timeoutMs, timeoutMessage],
  );

  const closeAllowed = useMemo(() => state.status !== "executing", [state.status]);

  return {
    ...state,
    execute,
    reset,
    cancel,
    closeAllowed,
  };
}

