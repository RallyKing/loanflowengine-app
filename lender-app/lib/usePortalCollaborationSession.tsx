"use client";

import { useCallback, useMemo, useState } from "react";

export type PortalSessionMode = "read" | "write";

export type UsePortalSessionOptions = {
  /** Broker preview links that support agent-assisted editing. */
  brokerAgentCapable?: boolean;
  /** Server-enforced read-only preview (client view). */
  readOnlyPreview?: boolean;
  defaultMode?: PortalSessionMode;
};

export type PortalSession = {
  mode: PortalSessionMode;
  setMode: (mode: PortalSessionMode) => void;
  /** True when inputs/uploads/submits are allowed. */
  canWrite: boolean;
  /** Show View as Client | Edit as Agent toggle. */
  showAgentToggle: boolean;
  isAgentWriteMode: boolean;
};

/**
 * Portal collaboration session — brokers can switch between read-only client
 * mirror and agent write mode on capable preview links.
 */
export function usePortalSession({
  brokerAgentCapable = false,
  readOnlyPreview = false,
  defaultMode,
}: UsePortalSessionOptions): PortalSession {
  const initialMode: PortalSessionMode =
    defaultMode ??
    (brokerAgentCapable && !readOnlyPreview ? "write" : "read");

  const [mode, setModeState] = useState<PortalSessionMode>(initialMode);

  const setMode = useCallback((next: PortalSessionMode) => {
    setModeState(next);
  }, []);

  return useMemo(() => {
    const showAgentToggle = brokerAgentCapable;
    const isAgentWriteMode = brokerAgentCapable && mode === "write";
    const canWrite =
      !readOnlyPreview && (!brokerAgentCapable || mode === "write");

    return {
      mode,
      setMode,
      canWrite,
      showAgentToggle,
      isAgentWriteMode,
    };
  }, [brokerAgentCapable, mode, readOnlyPreview, setMode]);
}
