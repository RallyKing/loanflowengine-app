"use client";

import type { ReactNode } from "react";
import { useAuthStateOptional } from "@/lib/auth/authStateContext";
import { AuthSuspenseFallback } from "@/components/auth/AuthSuspenseFallback";

type Props = {
  children: ReactNode;
};

/**
 * Waits for client hydration + session resolution before rendering children
 * (avoids SSR/client divergence for org + storage-dependent hooks).
 */
export function SessionBoundary({ children }: Props) {
  const auth = useAuthStateOptional();

  if (!auth) {
    return <>{children}</>;
  }

  if (!auth.clientHydrated && auth.viewer) {
    return <AuthSuspenseFallback state="loading" />;
  }

  return <>{children}</>;
}
