"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  roundTriageTimeToNearestMinute,
  TRIAGE_CLOCK_TICK_MS,
} from "@/lib/triageClock";

const TriageClockContext = createContext<number>(
  roundTriageTimeToNearestMinute(Date.now()),
);

function useTriageClockSync(): number {
  const [currentTriageTime, setCurrentTriageTime] = useState(() =>
    roundTriageTimeToNearestMinute(Date.now()),
  );

  useEffect(() => {
    const sync = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      const next = roundTriageTimeToNearestMinute(Date.now());
      setCurrentTriageTime((prev) => (prev === next ? prev : next));
    };

    const now = Date.now();
    const msUntilNextMinute =
      TRIAGE_CLOCK_TICK_MS - (now % TRIAGE_CLOCK_TICK_MS);

    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      sync();
      intervalId = window.setInterval(sync, TRIAGE_CLOCK_TICK_MS);
    }, msUntilNextMinute);

    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return currentTriageTime;
}

/**
 * Passive minute-bucket clock for triage highlight queries.
 * Changing `currentTriageTime` re-runs Convex highlight subscriptions without polling the database.
 */
export function TriageClockProvider({ children }: { children: ReactNode }) {
  const currentTriageTime = useTriageClockSync();
  return (
    <TriageClockContext.Provider value={currentTriageTime}>
      {children}
    </TriageClockContext.Provider>
  );
}

/** Minute-rounded Unix ms — pass to `getHubTriageHighlightMap` as `currentTriageTime`. */
export function useTriageClockTime(): number {
  return useContext(TriageClockContext);
}
