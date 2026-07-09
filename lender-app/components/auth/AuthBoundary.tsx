"use client";

import type { ReactNode } from "react";
import { useAuthStateOptional } from "@/lib/auth/authStateContext";
import { AuthSuspenseFallback } from "@/components/auth/AuthSuspenseFallback";
import { DegradedModeShell } from "@/components/auth/DegradedModeShell";
import { Button } from "@/components/ui/Button";

type Props = {
  children: ReactNode;
  /** When false, public/marketing subtree without auth machine (skips checks). */
  requireConvex?: boolean;
};

/**
 * Gates children to authenticated, non-invalid sessions. Uses optional context
 * so routes without AuthStateProvider continue to work.
 */
export function AuthBoundary({ children, requireConvex = true }: Props) {
  const auth = useAuthStateOptional();

  if (!requireConvex || !auth) {
    return <>{children}</>;
  }

  const { state, viewer } = auth;

  if (state === "loading") {
    return <AuthSuspenseFallback state="loading" />;
  }

  if (state === "unauthenticated" || !viewer) {
    return (
      <DegradedModeShell
        title="Sign in required"
        description="Your session is not available on this device."
      >
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            window.location.href = "/login";
          }}
        >
          Go to sign in
        </Button>
      </DegradedModeShell>
    );
  }

  if (state === "expired") {
    return (
      <DegradedModeShell
        title="Session expired"
        description="Sign in again to continue."
      >
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            window.location.href = "/session-expired";
          }}
        >
          Continue
        </Button>
      </DegradedModeShell>
    );
  }

  if (state === "revoked") {
    return (
      <DegradedModeShell
        title="Session revoked"
        description="This session was ended. Sign in again if you still have access."
      >
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            window.location.href = "/login";
          }}
        >
          Sign in
        </Button>
      </DegradedModeShell>
    );
  }

  if (state === "reconnecting") {
    return (
      <>
        <DegradedModeShell
          variant="compact"
          title="Reconnecting"
          description="Live data is catching up — edits may queue briefly."
        />
        {children}
      </>
    );
  }

  if (state === "degraded") {
    return (
      <>
        <DegradedModeShell
          variant="compact"
          title="Limited connectivity"
          description="Live updates may be paused. You can keep browsing cached views."
        />
        {children}
      </>
    );
  }

  return <>{children}</>;
}
