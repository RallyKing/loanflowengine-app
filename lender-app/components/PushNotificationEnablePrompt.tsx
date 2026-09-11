"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useAuthStateOptional } from "@/lib/auth/authStateContext";
import {
  clearWebPushPromptDismiss,
  dismissWebPushPromptForSevenDays,
  isWebPushPromptDismissed,
} from "@/lib/webPush/promptDismiss";
import {
  getCurrentPushSubscriptionKeys,
  subscribeThisDeviceToWebPush,
  vapidPublicKeyFromEnv,
  webPushClientSupported,
} from "@/lib/webPush/clientSubscribe";

/**
 * Non-blocking on-open prompt: Enable phone notifications / Not now.
 * Mount only in the signed-in app shell (org + member available).
 * Never calls Notification.requestPermission on mount — only on Enable.
 */
export function PushNotificationEnablePrompt() {
  const auth = useAuthStateOptional();
  const sessionBroken =
    auth?.state === "expired" ||
    auth?.state === "revoked" ||
    auth?.state === "unauthenticated";
  const { activeOrganizationId } = useOrgPermissions();
  const memberUserKey = useActorUserKey().trim();
  const upsert = useMutation(api.pushSubscriptions.upsert);

  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionBroken || !activeOrganizationId || !memberUserKey) {
      setVisible(false);
      return;
    }
    if (!webPushClientSupported()) {
      setVisible(false);
      return;
    }
    if (typeof Notification === "undefined") {
      setVisible(false);
      return;
    }
    if (Notification.permission !== "default") {
      setVisible(false);
      return;
    }
    if (isWebPushPromptDismissed()) {
      setVisible(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const keys = await getCurrentPushSubscriptionKeys();
      if (cancelled) return;
      // Already subscribed on this device — no prompt.
      if (keys) {
        setVisible(false);
        return;
      }
      setVisible(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionBroken, activeOrganizationId, memberUserKey]);

  const onNotNow = useCallback(() => {
    dismissWebPushPromptForSevenDays();
    setVisible(false);
    setError(null);
  }, []);

  const onEnable = useCallback(async () => {
    if (!activeOrganizationId || !memberUserKey || busy) return;
    setBusy(true);
    setError(null);
    try {
      const keys = await subscribeThisDeviceToWebPush();
      if (!keys) {
        const vapidConfigured = Boolean(vapidPublicKeyFromEnv());
        setError(
          !vapidConfigured
            ? "Push is not configured on this build."
            : Notification.permission === "denied"
              ? "Notification permission was blocked."
              : "Could not enable push on this device.",
        );
        if (Notification.permission === "denied") {
          setVisible(false);
        }
        return;
      }
      await upsert({
        organizationId: activeOrganizationId,
        memberUserKey,
        endpoint: keys.endpoint,
        keysP256dh: keys.keysP256dh,
        keysAuth: keys.keysAuth,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        expirationTime: keys.expirationTime,
      });
      clearWebPushPromptDismiss();
      setVisible(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable push");
    } finally {
      setBusy(false);
    }
  }, [activeOrganizationId, memberUserKey, busy, upsert]);

  if (!visible) return null;

  return (
    <div
      role="status"
      data-testid="web-push-enable-prompt"
      className="mt-1.5 flex flex-col gap-2 rounded-dlc-sm border border-border/60 bg-background/90 px-3 py-2 text-left sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          Enable phone notifications
        </p>
        <p className="text-xs text-muted-foreground">
          Get alerts when a client uploads documents for review. You can change
          this anytime in Settings.
        </p>
        {error ? (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onNotNow}
          data-testid="web-push-enable-prompt-not-now"
        >
          Not now
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={busy || !activeOrganizationId}
          onClick={() => void onEnable()}
          data-testid="web-push-enable-prompt-enable"
        >
          {busy ? "Enabling…" : "Enable"}
        </Button>
      </div>
    </div>
  );
}
