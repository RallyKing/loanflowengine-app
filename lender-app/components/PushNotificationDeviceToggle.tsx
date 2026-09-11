"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  getCurrentPushSubscriptionKeys,
  subscribeThisDeviceToWebPush,
  unsubscribeThisDeviceFromWebPush,
  vapidPublicKeyFromEnv,
  webPushClientSupported,
} from "@/lib/webPush/clientSubscribe";

type Props = {
  organizationId: Id<"organizations"> | null | undefined;
  memberUserKey: string;
  enabled: boolean;
};

/**
 * Device-scoped Web Push toggle for Settings → Notifications.
 * Stores one PushSubscription in Convex (not on an interval).
 */
export function PushNotificationDeviceToggle({
  organizationId,
  memberUserKey,
  enabled,
}: Props) {
  const upsert = useMutation(api.pushSubscriptions.upsert);
  const removeByEndpoint = useMutation(api.pushSubscriptions.removeByEndpoint);
  const hasAny = useQuery(
    api.pushSubscriptions.hasAnyForUser,
    enabled && memberUserKey
      ? { memberUserKey, callerMemberUserKey: memberUserKey }
      : "skip",
  );

  const [deviceOn, setDeviceOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const vapidConfigured = Boolean(vapidPublicKeyFromEnv());

  useEffect(() => {
    setSupported(webPushClientSupported());
    if (!enabled || !webPushClientSupported()) return;
    let cancelled = false;
    void (async () => {
      const keys = await getCurrentPushSubscriptionKeys();
      if (!cancelled) setDeviceOn(Boolean(keys));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const onToggle = useCallback(
    async (next: boolean) => {
      if (!organizationId || !memberUserKey || busy) return;
      setBusy(true);
      setError(null);
      try {
        if (next) {
          const keys = await subscribeThisDeviceToWebPush();
          if (!keys) {
            setError(
              !vapidConfigured
                ? "Push is not configured (missing NEXT_PUBLIC_VAPID_PUBLIC_KEY)."
                : Notification.permission === "denied"
                  ? "Notification permission is blocked for this browser."
                  : "Could not enable push on this device (install the PWA or use HTTPS).",
            );
            setDeviceOn(false);
            return;
          }
          await upsert({
            organizationId,
            memberUserKey,
            endpoint: keys.endpoint,
            keysP256dh: keys.keysP256dh,
            keysAuth: keys.keysAuth,
            userAgent:
              typeof navigator !== "undefined" ? navigator.userAgent : undefined,
            expirationTime: keys.expirationTime,
          });
          setDeviceOn(true);
        } else {
          const endpoint = await unsubscribeThisDeviceFromWebPush();
          if (endpoint) {
            await removeByEndpoint({
              organizationId,
              memberUserKey,
              endpoint,
            });
          }
          setDeviceOn(false);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Push toggle failed");
      } finally {
        setBusy(false);
      }
    },
    [
      organizationId,
      memberUserKey,
      busy,
      upsert,
      removeByEndpoint,
      vapidConfigured,
    ],
  );

  if (!enabled) return null;

  return (
    <div className="space-y-2 border-t border-border/60 pt-4">
      <p className="text-sm font-medium">Phone push (this device)</p>
      <p className="text-xs text-muted-foreground">
        Uses browser Web Push (not Convex polling). On iPhone: Add to Home Screen
        (iOS 16.4+), then enable here. Requires VAPID keys on Convex +{" "}
        <code className="rounded bg-muted px-1">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>{" "}
        on Vercel. First events: task assigned / assignment change.
        {hasAny === true && !deviceOn ? (
          <span className="mt-1 block">
            Another device on your account already has push enabled.
          </span>
        ) : null}
      </p>
      {!supported ? (
        <p className="text-xs text-muted-foreground">
          This browser does not support Web Push.
        </p>
      ) : (
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            disabled={busy || !organizationId}
            checked={deviceOn}
            onChange={(e) => void onToggle(e.target.checked)}
            data-testid="settings-web-push-toggle"
          />
          <span className="text-sm">
            Enable push on this device
            {busy ? (
              <span className="ml-2 text-xs text-muted-foreground">…</span>
            ) : null}
          </span>
        </label>
      )}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
