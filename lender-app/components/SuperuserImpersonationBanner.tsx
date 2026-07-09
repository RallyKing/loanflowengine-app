"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useViewer } from "@/lib/sessionContext";
import { Button } from "@/components/ui/Button";

/** Persistent banner while superuser tenant impersonation is active. */
export function SuperuserImpersonationBanner() {
  const viewer = useViewer();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const imp = viewer?.impersonation;
  if (!imp) return null;

  async function onStop() {
    setLoading(true);
    try {
      await fetch("/api/auth/impersonation/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      router.refresh();
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-foreground"
    >
      <span>
        Impersonating <strong>{imp.targetOrganizationName}</strong> as{" "}
        <strong>{imp.mode}</strong>
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={() => void onStop()}
      >
        Exit impersonation
      </Button>
    </div>
  );
}
