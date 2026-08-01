"use client";

import { X } from "lucide-react";
import { useQueries, type RequestForQueries } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  getStoredActiveOrganizationId,
  setStoredActiveOrganizationId,
} from "@/lib/activeOrganizationId";
import { useAuthStateOptional } from "@/lib/auth/authStateContext";
import { cn } from "@/lib/cn";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useViewer } from "@/lib/sessionContext";
import { parseOrganizationId } from "@/lib/orgIdValidation";
import { useConvexOrgQueryReady } from "@/lib/useConvexOrgQueryReady";

/** Don’t flash “transient server” copy during initial RBAC load or brief subscription churn. */
const TRANSIENT_SCOPE_DEBOUNCE_MS = 2800;

function scopeMessage(code: string | undefined): string {
  switch (code) {
    case "ORG_NOT_FOUND":
      return "This workspace no longer exists. If you had it saved on this device, that selection was cleared.";
    case "ORG_ID_MALFORMED":
      return "Your saved workspace id was invalid and has been cleared.";
    case "AUTH_PENDING":
      return "Signing you in to this workspace…";
    case "SCOPE_TRANSIENT":
      return "We couldn’t verify workspace access right now (connection or temporary server issue). Your team selection was left unchanged — try again shortly.";
    case "SCOPE_ERROR":
      return "You can't open this workspace with your current account. Try another organization in Settings, or sign in again.";
    default:
      return "Your workspace scope could not be verified. Try choosing an organization in Settings.";
  }
}

/**
 * Validates the active org id against Convex (exists + membership) and clears
 * a bad `localStorage` selection so the app can fall back without hard errors.
 */
export function OrgScopeRecoveryBanner() {
  const auth = useAuthStateOptional();
  const sessionBroken =
    auth?.state === "expired" ||
    auth?.state === "revoked" ||
    auth?.state === "unauthenticated";
  const { activeOrganizationId, effective } = useOrgPermissions();
  const actorKey = useActorUserKey();
  const viewer = useViewer();
  const orgQueryReady = useConvexOrgQueryReady();
  const trimmed = actorKey.trim();
  const scopeCheckEnabled = Boolean(
    orgQueryReady && activeOrganizationId && trimmed && !sessionBroken,
  );

  const scopeQueries = useMemo((): RequestForQueries => {
    if (!scopeCheckEnabled || !activeOrganizationId) return {};
    return {
      scopeCheck: {
        query: api.organizations.validateActiveScope,
        args: {
          organizationId: activeOrganizationId as Id<"organizations">,
          memberUserKey: trimmed,
        },
      },
    };
  }, [scopeCheckEnabled, activeOrganizationId, trimmed]);

  const scopeResults = useQueries(scopeQueries);
  const scopeRaw = scopeCheckEnabled ? scopeResults.scopeCheck : undefined;

  const clearedForRef = useRef<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(false);
  const [code, setCode] = useState<string | undefined>();

  useEffect(() => {
    if (!scopeCheckEnabled || scopeRaw === undefined) return;

    // Same org + session as `effectivePermissions`; if RBAC loaded, membership is already proven.
    if (effective !== undefined && effective !== null) {
      setShow(false);
      setCode(undefined);
      setDismissed(false);
      return;
    }

    if (scopeRaw instanceof Error) {
      if (effective === undefined) {
        setShow(false);
        const t = window.setTimeout(() => {
          setCode("SCOPE_TRANSIENT");
          setShow(true);
        }, TRANSIENT_SCOPE_DEBOUNCE_MS);
        return () => window.clearTimeout(t);
      }
      setCode("SCOPE_TRANSIENT");
      setShow(true);
      return;
    }

    if (scopeRaw.ok) {
      setShow(false);
      setCode(undefined);
      setDismissed(false);
      return;
    }

    if (scopeRaw.code === "AUTH_PENDING") {
      setShow(false);
      setCode(undefined);
      return;
    }

    const orgId = activeOrganizationId!;
    const badKey = String(orgId);
    if (clearedForRef.current !== badKey) {
      const stored = getStoredActiveOrganizationId();
      if (stored && stored === orgId) {
        const sessionOrg = parseOrganizationId(viewer?.organizationId ?? null);
        setStoredActiveOrganizationId(sessionOrg);
        clearedForRef.current = badKey;
        if (process.env.NODE_ENV === "development") {
          console.warn("[org-scope] Cleared invalid stored active organization", {
            code: scopeRaw.code,
          });
        }
      }
    }

    setCode(scopeRaw.code);
    setShow(true);
  }, [scopeCheckEnabled, scopeRaw, activeOrganizationId, effective, viewer?.organizationId, orgQueryReady]);

  if (!orgQueryReady || !show || dismissed || scopeRaw === undefined) return null;

  const transientNotice =
    code === "SCOPE_TRANSIENT" || code === "AUTH_PENDING";

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start justify-center gap-2 border-b px-4 py-2 text-center text-xs",
        transientNotice
          ? cn(
              "border-amber-300 bg-amber-50 text-amber-950",
              "dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-50",
            )
          : cn(
              "border-rose-200 bg-rose-50 text-rose-950",
              "dark:border-rose-900 dark:bg-rose-950/45 dark:text-rose-50",
            ),
      )}
    >
      <span className="max-w-2xl flex-1">
        {scopeMessage(code)}{" "}
        <Link
          href="/settings"
          className={cn(
            "font-medium underline underline-offset-2",
            transientNotice
              ? "hover:text-amber-900 dark:hover:text-amber-100"
              : "hover:text-rose-900 dark:hover:text-rose-100",
          )}
        >
          Open Settings
        </Link>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 shrink-0 px-2",
          transientNotice
            ? "text-amber-900 dark:text-amber-50"
            : "text-rose-900 dark:text-rose-50",
        )}
        onClick={() => setDismissed(true)}
        aria-label="Dismiss workspace notice"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
