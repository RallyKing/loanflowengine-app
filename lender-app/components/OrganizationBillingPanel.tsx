"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { settingsHref } from "@/lib/settingsRegistry";
import {
  normalizeOrganizationPlan,
  ORGANIZATION_PLANS,
  type OrganizationPlan,
} from "@/lib/orgPlanFeatures";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { dataTableClassNames } from "@/lib/dataTableClasses";
import { useUserSettings } from "@/lib/userSettingsContext";
import {
  CreditCard,
  ExternalLink,
  FileText,
  RefreshCw,
} from "lucide-react";

const PLAN_LABEL: Record<OrganizationPlan, string> = {
  basic: "Basic",
  pro: "Pro",
  enterprise: "Enterprise",
};

const PLAN_TAGLINE: Record<OrganizationPlan, string> = {
  basic: "Core workspace, pipeline, and lenders.",
  pro: "Advanced drawer sections, automation, and more.",
  enterprise: "Everything in Pro plus integrations.",
};

function formatMoney(amount: number, currency: string): string {
  const c = currency.trim().toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${c}`;
  }
}

function invoiceStatusClass(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s === "paid") return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
  if (s === "open" || s === "draft")
    return "bg-amber-500/15 text-amber-900 dark:text-amber-100";
  if (s === "void" || s === "uncollectible")
    return "bg-muted text-muted-foreground";
  return "bg-muted/80 text-foreground";
}

export function OrganizationBillingPanel() {
  const orgScope = useOrgConvexQueryArgs();
  const { can } = useOrgPermissions();
  const { settings } = useUserSettings();
  const canManageBilling = can("org.roles.manage");

  const stripeEnvOk = useQuery(api.stripeBilling.billingConfigured, {});
  const billingSummary = useQuery(
    api.stripeBilling.billingSummary,
    orgScope ? orgScope : "skip",
  );

  const createSubscriptionCheckout = useAction(
    api.stripeBilling.createSubscriptionCheckout,
  );
  const changeSubscriptionPlan = useAction(
    api.stripeBilling.changeSubscriptionPlan,
  );
  const createBillingPortalSession = useAction(
    api.stripeBilling.createBillingPortalSession,
  );
  const listBillingInvoices = useAction(api.stripeBilling.listBillingInvoices);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newTeamHint, setNewTeamHint] = useState(false);
  const [invoices, setInvoices] = useState<
    Array<{
      id: string;
      number: string | null;
      status: string | null;
      total: number;
      currency: string;
      created: number;
      hostedInvoiceUrl: string | null;
      invoicePdf: string | null;
    }>
  >([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);

  useEffect(() => {
    if (!canManageBilling) return;
    try {
      if (sessionStorage.getItem("lenderBillingOnboarding") === "1") {
        setNewTeamHint(true);
      }
    } catch {
      /* ignore */
    }
  }, [canManageBilling]);

  const dismissNewTeamHint = useCallback(() => {
    try {
      sessionStorage.removeItem("lenderBillingOnboarding");
    } catch {
      /* ignore */
    }
    setNewTeamHint(false);
  }, []);

  const canSwitchPlanInApp =
    Boolean(billingSummary?.stripeSubscriptionId?.trim()) &&
    ["active", "trialing", "past_due", "paused"].includes(
      (billingSummary?.subscriptionStatus ?? "").trim(),
    );

  const loadInvoices = useCallback(async () => {
    if (!orgScope || !canManageBilling) return;
    setInvoicesLoading(true);
    setInvoicesError(null);
    try {
      const r = await listBillingInvoices({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
        limit: 15,
      });
      if (r.ok) {
        setInvoices(r.invoices);
      } else {
        setInvoices([]);
        if (!r.error.includes("No Stripe customer")) {
          setInvoicesError(r.error);
        }
      }
    } catch (e) {
      setInvoicesError(
        e instanceof Error ? e.message : "Could not load invoices.",
      );
      setInvoices([]);
    } finally {
      setInvoicesLoading(false);
    }
  }, [orgScope, canManageBilling, listBillingInvoices]);

  useEffect(() => {
    if (!orgScope || !canManageBilling || !billingSummary?.stripeCustomerId) {
      setInvoices([]);
      return;
    }
    void loadInvoices();
  }, [
    orgScope,
    canManageBilling,
    billingSummary?.stripeCustomerId,
    billingSummary?.subscriptionStatus,
    billingSummary?.stripePriceId,
    loadInvoices,
  ]);

  const startPlanChange = useCallback(
    async (targetPlan: OrganizationPlan) => {
      if (!orgScope) return;
      setBusy(true);
      setMessage(null);
      try {
        if (canSwitchPlanInApp) {
          const r = await changeSubscriptionPlan({
            organizationId: orgScope.organizationId,
            memberUserKey: orgScope.memberUserKey,
            targetPlan,
          });
          if (r.ok) {
            setMessage(
              "Plan updated. Stripe may finalize proration shortly — totals refresh automatically.",
            );
            void loadInvoices();
          } else {
            setMessage(r.error);
          }
          return;
        }
        const r = await createSubscriptionCheckout({
          organizationId: orgScope.organizationId,
          memberUserKey: orgScope.memberUserKey,
          targetPlan,
        });
        if (r.ok) {
          window.location.href = r.url;
        } else {
          setMessage(r.error);
        }
      } catch (e) {
        setMessage(
          e instanceof Error
            ? e.message
            : "Could not start checkout or plan change.",
        );
      } finally {
        setBusy(false);
      }
    },
    [
      orgScope,
      canSwitchPlanInApp,
      changeSubscriptionPlan,
      createSubscriptionCheckout,
      loadInvoices,
    ],
  );

  const openPortal = useCallback(async () => {
    if (!orgScope) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await createBillingPortalSession({
        organizationId: orgScope.organizationId,
        memberUserKey: orgScope.memberUserKey,
      });
      if (r.ok) {
        window.location.href = r.url;
      } else {
        setMessage(r.error);
      }
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not open billing portal.",
      );
    } finally {
      setBusy(false);
    }
  }, [orgScope, createBillingPortalSession]);

  if (!orgScope) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a team in the header to manage billing.
      </p>
    );
  }

  const effectivePlan = billingSummary
    ? normalizeOrganizationPlan(billingSummary.plan)
    : "basic";
  const configured = stripeEnvOk?.configured ?? false;

  return (
    <div className="space-y-6">
      {newTeamHint && configured ? (
        <div
          role="status"
          className="rounded-lg border border-primary/35 bg-primary/5 px-4 py-3 text-sm"
        >
          <p className="font-medium text-foreground">Welcome — set up billing</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose a plan below to start Stripe Checkout, or open the customer
            portal after your first subscription to manage payment methods and
            cancellation.
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-2 h-8 px-2 text-xs"
            onClick={dismissNewTeamHint}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {!configured ? (
        <p className="rounded-lg border border-amber-500/35 bg-amber-500/5 px-4 py-3 text-xs text-amber-950 dark:text-amber-100">
          Stripe is not fully configured for this deployment. In Convex, set{" "}
          <span className="font-mono">STRIPE_SECRET_KEY</span>,{" "}
          <span className="font-mono">STRIPE_WEBHOOK_SECRET</span>,{" "}
          <span className="font-mono">STRIPE_PRICE_*</span>, and{" "}
          <span className="font-mono">SITE_URL</span>. Add webhook{" "}
          <span className="font-mono break-all">…/webhooks/stripe</span>.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div
          className={cn(
            "rounded-xl border border-border/80 bg-gradient-to-b from-muted/40 to-background p-4 shadow-sm sm:p-5",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Current plan
              </p>
              <p className="mt-1 text-2xl font-semibold capitalize tracking-tight text-foreground">
                {PLAN_LABEL[effectivePlan]}
              </p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {PLAN_TAGLINE[effectivePlan]}
              </p>
            </div>
            {billingSummary?.subscriptionStatus ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
                  "border-border/80 bg-background text-foreground",
                )}
              >
                {billingSummary.subscriptionStatus.replace(/_/g, " ")}
              </span>
            ) : null}
          </div>

          <dl className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <div className="flex flex-col gap-0.5 rounded-lg bg-muted/25 px-3 py-2">
              <dt className="font-medium text-foreground">Billing source</dt>
              <dd className="capitalize">
                {billingSummary?.planSource ?? "—"}
              </dd>
            </div>
            {billingSummary?.subscriptionCurrentPeriodEnd ? (
              <div className="flex flex-col gap-0.5 rounded-lg bg-muted/25 px-3 py-2">
                <dt className="font-medium text-foreground">Period ends</dt>
                <dd>
                  {new Date(
                    billingSummary.subscriptionCurrentPeriodEnd,
                  ).toLocaleString()}
                </dd>
              </div>
            ) : null}
            {billingSummary?.subscriptionCancelAtPeriodEnd ? (
              <div className="sm:col-span-2 flex flex-col gap-0.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-950 dark:text-amber-50">
                <dt className="font-medium">Scheduled cancel</dt>
                <dd>
                  Access continues until the period end above, then the workspace
                  moves to the free tier unless you renew in the portal.
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-xl border border-border/80 bg-muted/15 p-4 sm:p-5">
          <div className="flex gap-2">
            <CreditCard
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                Stripe customer portal
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Update cards, download receipts, and cancel or resume
                subscription in Stripe&apos;s secure UI.
              </p>
            </div>
          </div>
          {canManageBilling ? (
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={busy || !billingSummary?.stripeCustomerId || !configured}
              onClick={() => void openPortal()}
            >
              Open billing portal
              <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" />
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Only teammates with billing permission can open the portal.
            </p>
          )}
          {!billingSummary?.stripeCustomerId && canManageBilling ? (
            <p className="text-[11px] text-muted-foreground">
              Complete checkout once to create your Stripe customer, then this
              unlocks.
            </p>
          ) : null}
        </div>
      </div>

      {message ? (
        <p
          className={cn(
            "text-sm",
            message.toLowerCase().includes("updated") ||
              message.toLowerCase().includes("finalize")
              ? "text-muted-foreground"
              : "text-destructive",
          )}
          role="status"
        >
          {message}
        </p>
      ) : null}

      {canManageBilling && configured ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">
                Change plan
              </p>
              <p className="text-xs text-muted-foreground">
                {canSwitchPlanInApp
                  ? "Switch tiers with proration. Use the portal to cancel."
                  : "Start a subscription with Checkout — you won’t be charged until you confirm in Stripe."}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {ORGANIZATION_PLANS.map((p) => {
              const active = p === effectivePlan;
              return (
                <div
                  key={p}
                  className={cn(
                    "flex flex-col rounded-xl border p-4 transition-colors",
                    active
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                      : "border-border/80 bg-background hover:border-border",
                  )}
                >
                  <p className="text-sm font-semibold capitalize text-foreground">
                    {PLAN_LABEL[p]}
                  </p>
                  <p className="mt-1 flex-1 text-xs text-muted-foreground">
                    {PLAN_TAGLINE[p]}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant={active ? "outline" : "primary"}
                    className="mt-3 w-full"
                    disabled={busy || active}
                    onClick={() => void startPlanChange(p)}
                  >
                    {active
                      ? "Current plan"
                      : canSwitchPlanInApp
                        ? "Switch to this plan"
                        : "Subscribe with Checkout"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : !canManageBilling ? (
        <p className="text-sm text-muted-foreground">
          Your role can view this team&apos;s plan. Ask an admin to change
          billing or visit{" "}
          <Link
            href={settingsHref("organization")}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Organization
          </Link>{" "}
          for role access.
        </p>
      ) : null}

      {canManageBilling && configured && billingSummary?.stripeCustomerId ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium text-foreground">Invoices</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              disabled={invoicesLoading}
              onClick={() => void loadInvoices()}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", invoicesLoading && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Recent charges from Stripe. Use{" "}
            <span className="font-medium text-foreground">Open billing portal</span>{" "}
            for the full history and payment methods.
          </p>
          {invoicesError ? (
            <p className="text-xs text-destructive">{invoicesError}</p>
          ) : null}
          {invoicesLoading && invoices.length === 0 ? (
            <p className="text-xs text-muted-foreground">Loading invoices…</p>
          ) : null}
          {!invoicesLoading && invoices.length === 0 && !invoicesError ? (
            <p className="text-xs text-muted-foreground">
              No invoices yet. They appear after your first successful payment.
            </p>
          ) : null}
          {invoices.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border/80">
              <table
                className={dataTableClassNames(
                  settings.tableDensity,
                  "w-full min-w-[520px]",
                )}
              >
                <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Invoice</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="w-24 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-border/60 odd:bg-muted/15"
                    >
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {new Date(inv.created * 1000).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">
                        {inv.number ?? inv.id.slice(-8)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                            invoiceStatusClass(inv.status),
                          )}
                        >
                          {(inv.status ?? "—").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(inv.total, inv.currency)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-x-2 gap-y-1">
                          {inv.hostedInvoiceUrl ? (
                            <a
                              href={inv.hostedInvoiceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-2 hover:underline"
                            >
                              View
                              <ExternalLink className="h-3 w-3 opacity-70" />
                            </a>
                          ) : null}
                          {inv.invoicePdf ? (
                            <a
                              href={inv.invoicePdf}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                            >
                              PDF
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        Feature access for this team follows the effective plan in{" "}
        <Link
          href={settingsHref("organization")}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Organization → Feature tier
        </Link>{" "}
        when not fully managed by Stripe.
      </p>
    </div>
  );
}
