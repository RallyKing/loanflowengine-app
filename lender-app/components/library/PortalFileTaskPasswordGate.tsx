"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Lock } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { writePortalTaskAccessProof } from "@/lib/portalTaskAccessProof";

export function PortalFileTaskPasswordGate({
  bundleToken,
  fileTaskId,
  title,
  onUnlocked,
}: {
  bundleToken: string;
  fileTaskId: Id<"documentVaultFileTasks">;
  title: string;
  onUnlocked: () => void;
}) {
  const verify = useMutation(api.portalFileTaskPassword.verifyFileTaskPassword);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-4 space-y-3 rounded-dlc-md border border-border/70 bg-dlc-surface-high/60 p-3"
      data-testid="portal-pfs-password-gate"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        void verify({
          bundleToken,
          fileTaskId,
          password,
        })
          .then((result) => {
            if (result.proofToken) {
              writePortalTaskAccessProof(
                bundleToken,
                String(fileTaskId),
                result.proofToken,
              );
            }
            setPassword("");
            onUnlocked();
          })
          .catch((err) => {
            setError(
              err instanceof Error ? err.message : "Incorrect password.",
            );
          })
          .finally(() => setBusy(false));
      }}
    >
      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Password required
      </p>
      <p className="text-[11px] text-muted-foreground">
        Enter the password for <span className="font-medium">{title}</span> to
        open this request. Other items on this link stay available.
      </p>
      <label className="block">
        <span className="sr-only">Password</span>
        <Input
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="h-10 min-h-[40px]"
          data-testid="portal-pfs-password-input"
        />
      </label>
      {error ? (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        size="sm"
        className="min-h-10 w-full"
        disabled={busy || !password.trim()}
        data-testid="portal-pfs-password-submit"
      >
        {busy ? "Checking…" : "Unlock"}
      </Button>
    </form>
  );
}
