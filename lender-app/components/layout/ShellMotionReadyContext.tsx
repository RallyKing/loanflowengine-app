"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const ShellMotionReadyContext = createContext<boolean | null>(null);

/**
 * Defers shell transitions/transforms until after the first paint following
 * hydration so mobile CLS tests (and real devices) do not score first-frame
 * chrome motion as layout instability.
 */
export function ShellMotionReadyProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <ShellMotionReadyContext.Provider value={ready}>
      {children}
    </ShellMotionReadyContext.Provider>
  );
}

/**
 * `true` once the first animation frame after mount has run (transitions allowed).
 * Outside `ShellMotionReadyProvider`, returns `true` (no gating).
 */
export function useShellMotionReady(): boolean {
  const v = useContext(ShellMotionReadyContext);
  return v !== false;
}
