"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useViewer } from "@/lib/sessionContext";
import { setStoredActiveOrganizationId } from "@/lib/activeOrganizationId";
import { parseOrganizationId } from "@/lib/orgIdValidation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

/** Superuser tenant impersonation — canonical Joshua primary only. */
export function SuperuserImpersonationPanel({ className }: { className?: string }) {
  const viewer = useViewer();
  const router = useRouter();
  const [targetId, setTargetId] = useState("");
  const [mode, setMode] = useState<"readonly" | "operator">("readonly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!viewer?.canSuperuserImpersonate) return null;

  const active = viewer.impersonation;

  async function onStart() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/impersonation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetOrganizationId: targetId, mode }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? "Failed to start impersonation.");
      }
      const orgId = parseOrganizationId(targetId);
      if (orgId) setStoredActiveOrganizationId(orgId);
      router.refresh();
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onStop() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/impersonation/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        homeOrganizationId?: string;
      };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? "Failed to stop impersonation.");
      }
      if (body.homeOrganizationId) {
        const home = parseOrganizationId(body.homeOrganizationId);
        if (home) setStoredActiveOrganizationId(home);
      }
      router.refresh();
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-dlc-md border border-border bg-dlc-surface p-4",
        className,
      )}
    >
      <div>
        <h3 className="text-sm font-semibold">Superuser tenant impersonation</h3>
        <p className="text-xs text-muted-foreground">
          Secure, audited tenant context switch. Readonly blocks all mutations; operator
          allows full writes in the target workspace.
        </p>
      </div>
      {active ? (
        <div className="space-y-2">
          <p className="text-sm">
            Active: <strong>{active.targetOrganizationName}</strong> ({active.mode})
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void onStop()}
          >
            Stop impersonation
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-medium">Target organization id</label>
          <input
            className="w-full max-w-md rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value.trim())}
            placeholder="Organization id"
          />
          <Select
            className="w-full max-w-md"
            value={mode}
            onChange={(e) =>
              setMode(e.target.value === "operator" ? "operator" : "readonly")
            }
          >
            <option value="readonly">Readonly</option>
            <option value="operator">Operator</option>
          </Select>
          <Button type="button" disabled={loading || !targetId} onClick={() => void onStart()}>
            Start impersonation
          </Button>
        </div>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
