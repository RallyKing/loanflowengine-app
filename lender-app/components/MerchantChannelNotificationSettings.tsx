"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQueries,
  type RequestForQueries,
} from "convex/react";
import { Copy, Loader2, MessageSquare, Radio, Send } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { showOperationalToast } from "@/lib/ui/operationalToast";

type MerchantConfig = {
  notificationWebhookUrl: string | null;
  channels: {
    enableSms: boolean;
    enableEmail: boolean;
    enableInternal: boolean;
  };
};

type DeliveryLogRow = {
  _id: string;
  event: string;
  context: string;
  deliveryMethod: "SMS" | "EMAIL" | "INTERNAL";
  result: string;
  isTest: boolean;
  httpStatus?: number;
  errorMessage?: string;
  createdAt: number;
};

/**
 * SenseBS-style merchant channel notifications: one URL, SMS/EMAIL/INTERNAL fan-out.
 * Complements multi-endpoint SaaS webhooks above.
 *
 * Uses `useQueries` (not `useQuery`) so a server/missing-function error returns
 * `Error` instead of throwing during render and white-screening Settings.
 */
export function MerchantChannelNotificationSettings() {
  const orgScope = useOrgConvexQueryArgs();

  const merchantQueries = useMemo((): RequestForQueries => {
    if (!orgScope) return {};
    const args = {
      organizationId: orgScope.organizationId,
      memberUserKey: orgScope.memberUserKey,
    };
    return {
      config: {
        query: api.merchantNotifications.getConfig,
        args,
      },
      logs: {
        query: api.merchantNotifications.listDeliveryLogs,
        args: { ...args, limit: 15 },
      },
      sample: {
        query: api.merchantNotifications.getSamplePayload,
        args: { ...args, deliveryMethod: "SMS" as const },
      },
    };
  }, [orgScope]);

  const merchantResults = useQueries(merchantQueries);
  const configRaw = orgScope ? merchantResults.config : undefined;
  const logsRaw = orgScope ? merchantResults.logs : undefined;
  const sampleRaw = orgScope ? merchantResults.sample : undefined;

  const configError = configRaw instanceof Error ? configRaw : null;
  const config: MerchantConfig | undefined =
    configRaw instanceof Error || configRaw === undefined
      ? undefined
      : (configRaw as MerchantConfig);

  const logs: DeliveryLogRow[] | undefined =
    logsRaw instanceof Error || logsRaw === undefined
      ? undefined
      : (logsRaw as DeliveryLogRow[]);
  const logsError = logsRaw instanceof Error ? logsRaw : null;

  const samplePayload =
    sampleRaw instanceof Error || sampleRaw === undefined
      ? undefined
      : (sampleRaw as string);

  const updateConfig = useMutation(api.merchantNotifications.updateConfig);
  const sendTest = useMutation(api.merchantNotifications.sendTest);

  const [url, setUrl] = useState("");
  const [enableSms, setEnableSms] = useState(true);
  const [enableEmail, setEnableEmail] = useState(true);
  const [enableInternal, setEnableInternal] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!config || synced) return;
    setUrl(config.notificationWebhookUrl ?? "");
    setEnableSms(config.channels.enableSms);
    setEnableEmail(config.channels.enableEmail);
    setEnableInternal(config.channels.enableInternal);
    setSynced(true);
  }, [config, synced]);

  useEffect(() => {
    setSynced(false);
  }, [orgScope?.organizationId]);

  if (!orgScope) return null;

  const queryUnavailable = Boolean(configError);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateConfig({
        organizationId: orgScope!.organizationId,
        memberUserKey: orgScope!.memberUserKey,
        notificationWebhookUrl: url.trim() || null,
        channels: { enableSms, enableEmail, enableInternal },
      });
      showOperationalToast({
        title: "Merchant webhook saved",
        variant: "success",
      });
    } catch (err) {
      showOperationalToast({
        title: "Could not save",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleTest(method: "SMS" | "EMAIL") {
    setBusy(true);
    try {
      await sendTest({
        organizationId: orgScope!.organizationId,
        memberUserKey: orgScope!.memberUserKey,
        deliveryMethod: method,
        phone: testPhone.trim() || undefined,
        email: testEmail.trim() || undefined,
      });
      showOperationalToast({
        title: `Test ${method} queued`,
        description:
          "Async POST sent with isTest:true. Gate production workflows on isTest === false.",
        variant: "success",
      });
    } catch (err) {
      showOperationalToast({
        title: "Test failed",
        description: err instanceof Error ? err.message : "Error",
      });
    } finally {
      setBusy(false);
    }
  }

  function copySample() {
    if (!samplePayload) return;
    void navigator.clipboard.writeText(samplePayload).then(
      () =>
        showOperationalToast({
          title: "Sample payload copied",
          variant: "success",
        }),
      () =>
        showOperationalToast({
          title: "Could not copy",
          description: "Select text from the payload box instead.",
        }),
    );
  }

  return (
    <div
      className="space-y-5 border-t border-border/70 pt-8"
      data-testid="merchant-channel-notification-settings"
    >
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquare className="h-4 w-4 text-primary" aria-hidden />
          Merchant channel notifications
        </h4>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
          One HTTPS webhook for SMS and email fan-out. We pre-render message
          copy and POST separately with{" "}
          <code className="text-[10px]">data.notification.deliveryMethod</code>{" "}
          set to <code className="text-[10px]">SMS</code>,{" "}
          <code className="text-[10px]">EMAIL</code>, or{" "}
          <code className="text-[10px]">INTERNAL</code>. Your GHL / Zapier /
          custom stack sends the message.{" "}
          <strong className="font-medium text-foreground">
            Production workflows must skip
          </strong>{" "}
          payloads where <code className="text-[10px]">isTest === true</code>.
        </p>
      </div>

      {queryUnavailable ? (
        <div
          className="max-w-xl rounded-dlc-lg border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-xs text-amber-950"
          role="status"
          data-testid="merchant-webhook-unavailable"
        >
          <p className="font-medium">Merchant notifications unavailable</p>
          <p className="mt-1 text-amber-900/90">
            Could not load merchant webhook config
            {configError?.message ? `: ${configError.message}` : "."} Other
            Settings tabs remain usable. If this persists after a Convex deploy,
            refresh the page.
          </p>
        </div>
      ) : (
        <>
          <form
            onSubmit={(e) => void handleSave(e)}
            className="max-w-xl space-y-3 rounded-dlc-lg border border-border/70 bg-dlc-surface p-4"
          >
            <label className="block text-xs font-medium text-foreground">
              Notification / CRM webhook URL
              <Input
                className="mt-1 font-mono text-[11px]"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://services.leadconnectorhq.com/hooks/…"
                data-testid="merchant-webhook-url"
              />
            </label>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-foreground">
                Channels
              </legend>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={enableSms}
                  onChange={(e) => setEnableSms(e.target.checked)}
                />
                SMS companion POSTs
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={enableEmail}
                  onChange={(e) => setEnableEmail(e.target.checked)}
                />
                EMAIL companion POSTs
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={enableInternal}
                  onChange={(e) => setEnableInternal(e.target.checked)}
                />
                INTERNAL (CRM / audit companion)
              </label>
            </fieldset>
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={busy || config === undefined}
              data-testid="merchant-webhook-save"
            >
              {busy ? "Saving…" : "Save merchant webhook"}
            </Button>
          </form>

          <div className="max-w-xl space-y-3 rounded-dlc-lg border border-border/70 bg-background/60 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Send className="h-3.5 w-3.5" aria-hidden />
              Send test
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs">
                Test phone (SMS)
                <Input
                  className="mt-1 font-mono text-[11px]"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+18185551212"
                  data-testid="merchant-test-phone"
                />
              </label>
              <label className="block text-xs">
                Test email
                <Input
                  className="mt-1 font-mono text-[11px]"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@company.com"
                  data-testid="merchant-test-email"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || config === undefined}
                data-testid="merchant-test-sms"
                onClick={() => void handleTest("SMS")}
              >
                Send test SMS
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || config === undefined}
                data-testid="merchant-test-email-btn"
                onClick={() => void handleTest("EMAIL")}
              >
                Send test email
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-1"
                disabled={!samplePayload}
                onClick={copySample}
              >
                <Copy className="h-3 w-3" aria-hidden />
                Copy sample payload
              </Button>
            </div>
          </div>

          {samplePayload ? (
            <details className="max-w-2xl text-xs">
              <summary className="cursor-pointer font-medium text-foreground">
                Sample JSON envelope
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-border/60 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed">
                {samplePayload}
              </pre>
            </details>
          ) : null}

          <section>
            <h5 className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Radio className="h-3.5 w-3.5" aria-hidden />
              Merchant channel delivery log
            </h5>
            {logsError ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Delivery log unavailable
                {logsError.message ? `: ${logsError.message}` : "."}
              </p>
            ) : logs === undefined ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Loading…
              </div>
            ) : logs.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No merchant channel deliveries yet.
              </p>
            ) : (
              <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-xs">
                {logs.map((log) => (
                  <li
                    key={log._id}
                    className="rounded-md border border-border/50 px-2 py-1.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span>
                        <span className="font-medium">
                          {log.deliveryMethod}
                        </span>{" "}
                        · {log.context}
                        {log.isTest ? (
                          <span className="ml-1 text-[10px] uppercase text-amber-700">
                            test
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                          log.result === "sent"
                            ? "bg-emerald-50 text-emerald-800"
                            : log.result.startsWith("skipped")
                              ? "bg-muted text-muted-foreground"
                              : "bg-red-50 text-red-700",
                        )}
                      >
                        {log.result}
                        {log.httpStatus != null ? ` · ${log.httpStatus}` : ""}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                      {log.errorMessage ? ` — ${log.errorMessage}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
