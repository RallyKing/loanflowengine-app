"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useViewer } from "@/lib/sessionContext";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { useBrowserOnline } from "@/lib/useBrowserOnline";
import { useClientHydrated } from "@/lib/auth/clientHydration";
import type { SessionInvalidReason } from "@/lib/auth/authTypes";
import { subscribeSessionInvalid } from "@/lib/auth/sessionInvalidation";
import type { AuthMachineState } from "@/lib/auth/authTypes";
import { deriveAuthMachineState } from "@/lib/auth/deriveAuthState";
import { setStoredActiveOrganizationId } from "@/lib/activeOrganizationId";

export type AuthStateContextValue = {
  state: AuthMachineState;
  viewer: ReturnType<typeof useViewer>;
  clientHydrated: boolean;
  sessionInvalid: SessionInvalidReason | null;
  /** Re-dispatch session invalid (e.g. from API 401 handler). */
  setSessionInvalid: (reason: SessionInvalidReason | null) => void;
  clearSessionInvalid: () => void;
};

const Ctx = createContext<AuthStateContextValue | null>(null);

export function AuthStateProvider({ children }: { children: ReactNode }) {
  const viewer = useViewer();
  const live = useLiveConnection();
  const browserOnline = useBrowserOnline();
  const clientHydrated = useClientHydrated();
  const [sessionInvalid, setSessionInvalidState] =
    useState<SessionInvalidReason | null>(null);

  const setSessionInvalid = useCallback((reason: SessionInvalidReason | null) => {
    setSessionInvalidState(reason);
    if (reason) {
      setStoredActiveOrganizationId(null);
    }
  }, []);

  const clearSessionInvalid = useCallback(() => {
    setSessionInvalidState(null);
  }, []);

  useEffect(() => {
    return subscribeSessionInvalid((reason) => {
      setSessionInvalidState(reason);
      setStoredActiveOrganizationId(null);
    });
  }, []);

  const viewerUserKey = viewer?.userKey;
  const convexPhase = live.phase;
  const connectionRetries = live.state.connectionRetries;
  const isWebSocketConnected = live.state.isWebSocketConnected;

  const state = useMemo(
    () =>
      deriveAuthMachineState({
        viewerPresent: Boolean(viewerUserKey),
        clientHydrated,
        sessionInvalid,
        convexPhase,
        connectionRetries,
        browserOnline,
        isWebSocketConnected,
      }),
    [
      viewerUserKey,
      clientHydrated,
      sessionInvalid,
      convexPhase,
      connectionRetries,
      isWebSocketConnected,
      browserOnline,
    ],
  );

  const value = useMemo(
    () => ({
      state,
      viewer,
      clientHydrated,
      sessionInvalid,
      setSessionInvalid,
      clearSessionInvalid,
    }),
    [
      state,
      viewer,
      clientHydrated,
      sessionInvalid,
      setSessionInvalid,
      clearSessionInvalid,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuthState(): AuthStateContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useAuthState requires AuthStateProvider (inside ConvexClientProvider).");
  }
  return v;
}

/** Optional: returns null outside AuthStateProvider instead of throwing. */
export function useAuthStateOptional(): AuthStateContextValue | null {
  return useContext(Ctx);
}

