"use client";

import { useEffect, useState } from "react";

/**
 * False on SSR and the first client render; true after commit.
 * Keeps localStorage / document.cookie reads off the SSR path to avoid hydration mismatches.
 */
export function useClientHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
