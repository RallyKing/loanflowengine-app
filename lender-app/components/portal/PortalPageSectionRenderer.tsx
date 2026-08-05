"use client";

/**
 * Runtime + builder preview renderer for portal page sections.
 * Does not invent a second messaging system — chat uses a polished placeholder
 * unless `chatSlot` is provided (session portal wires PortalMessagingSection).
 */

import { useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Bell,
  CheckCircle2,
  FileText,
  MessageSquare,
  Phone,
  PlusCircle,
  Search,
  Send,
  User,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  getPortalPageSectionDef,
  type PortalPageSectionInstance,
} from "@/lib/portalPageSections";
import type { PortalChromeConfig, PortalNavRouteKey } from "@/lib/portalChrome";
import {
  PortalChromeShell,
  portalColSpanClass,
} from "@/components/portal/PortalChromeShell";
import {
  isPortalPreviewDashboardRoute,
  portalPreviewCtaRoute,
  portalPreviewRouteLabel,
  sectionsForPortalPreviewRoute,
} from "@/lib/portalPreviewRoutes";
import {
  applyPortalWelcomeTokens,
  defaultStatusSteps,
  resolveContactFromSectionProps,
  type PortalStatusStep,
} from "@/lib/portalSectionConfig";

export type PortalPageRenderContext = {
  stageLabel?: string;
  stageDetail?: string;
  primaryContact?: {
    name: string;
    email?: string;
    phone?: string;
    title?: string;
  };
  fileLabel?: string;
  workspaceName?: string;
  welcomeMessage?: string;
  outstandingCount?: number;
  statusVisibility?: "basic" | "detailed";
  allowMessaging?: boolean;
  showDealSummary?: boolean;
};

export type PortalPageSectionSlots = {
  /** Replaces outstanding_documents body (e.g. existing task list). */
  outstandingDocuments?: ReactNode;
  /** Replaces document_package body (lender data room). */
  documentPackage?: ReactNode;
  /** Optional real chat UI (session portal / fileMessages). */
  chat?: ReactNode;
  /** Optional custom status checklist body (live progress). */
  statusChecklist?: ReactNode;
};

function CustomStatusChecklist({
  steps,
  interactive,
  completedIds,
  onToggle,
}: {
  steps: PortalStatusStep[];
  interactive?: boolean;
  completedIds?: ReadonlySet<string>;
  onToggle?: (stepId: string) => void;
}) {
  const [localDone, setLocalDone] = useState<Set<string>>(() => new Set());
  const done = completedIds ?? localDone;
  return (
    <ul className="space-y-2" data-testid="portal-status-checklist">
      {steps.map((step) => {
        const checked = done.has(step.id);
        return (
          <li key={step.id}>
            <button
              type="button"
              disabled={!interactive}
              onClick={() => {
                if (!interactive) return;
                if (onToggle) {
                  onToggle(step.id);
                  return;
                }
                setLocalDone((prev) => {
                  const next = new Set(prev);
                  if (next.has(step.id)) next.delete(step.id);
                  else next.add(step.id);
                  return next;
                });
              }}
              className={cn(
                "flex min-h-10 w-full items-start gap-2.5 rounded-dlc-md border border-border/60 px-3 py-2 text-left",
                checked && "border-primary/30 bg-primary/5",
                interactive && "hover:bg-muted/40",
                !interactive && "cursor-default",
              )}
              data-step-id={step.id}
            >
              <CheckCircle2
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  checked ? "text-primary" : "text-muted-foreground/40",
                )}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {step.label}
                </span>
                {step.description ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {step.description}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PreviewChatPanel({
  intro,
  interactive,
}: {
  intro?: string;
  interactive?: boolean;
}) {
  const [messages, setMessages] = useState<string[]>([
    "Hi — thanks for opening your portal. Reply here anytime.",
  ]);
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2" data-testid="portal-chat-preview">
      <p className="text-xs text-muted-foreground">
        {intro?.trim() ||
          "Message your broker — conversations use the loan file Messages thread."}
      </p>
      <ul className="max-h-40 space-y-1.5 overflow-y-auto overscroll-contain rounded-dlc-md border border-border/50 bg-muted/20 p-2">
        {messages.map((m, i) => (
          <li
            key={`${i}-${m.slice(0, 12)}`}
            className="rounded-dlc-sm bg-white px-2.5 py-1.5 text-sm text-foreground shadow-dlc-1"
          >
            {m}
          </li>
        ))}
      </ul>
      {interactive ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            placeholder="Type a message…"
            className="h-10 min-w-0 flex-1 rounded-dlc-md border border-border bg-background px-3 text-sm"
            aria-label="Preview message"
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                setMessages((prev) => [...prev, draft.trim()]);
                setDraft("");
              }
            }}
          />
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-dlc-md bg-primary text-primary-foreground"
            aria-label="Send preview message"
            onClick={() => {
              if (!draft.trim()) return;
              setMessages((prev) => [...prev, draft.trim()]);
              setDraft("");
            }}
          >
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Preview only — live portals post to file Messages (same as pipeline
        Communications).
      </p>
    </div>
  );
}

function SectionShell({
  title,
  children,
  className,
  preview,
  onActivate,
  interactive,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  preview?: boolean;
  onActivate?: () => void;
  interactive?: boolean;
}) {
  const clickable = Boolean(interactive && onActivate);
  return (
    <section
      className={cn(
        "rounded-dlc-lg border border-border/80 bg-white p-4 shadow-dlc-1",
        preview && "border-dashed bg-dlc-surface/60",
        clickable &&
          "cursor-pointer transition-colors duration-dlc-short ease-dlc-standard hover:border-primary/40 hover:bg-muted/20",
        className,
      )}
      data-portal-section=""
      {...(clickable
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick: onActivate,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate?.();
              }
            },
          }
        : {})}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function PortalPageSectionBlock({
  instance,
  context,
  slots,
  preview = false,
  interactive = false,
  onNavigate,
}: {
  instance: PortalPageSectionInstance;
  context?: PortalPageRenderContext | null;
  slots?: PortalPageSectionSlots;
  preview?: boolean;
  interactive?: boolean;
  onNavigate?: (routeKey: PortalNavRouteKey) => void;
}) {
  if (instance.enabled === false) return null;
  const def = getPortalPageSectionDef(instance.sectionId);
  const title =
    instance.props?.titleOverride?.trim() ||
    def?.label ||
    instance.sectionId;
  const ctx = context ?? {};
  const ctaRoute = interactive ? portalPreviewCtaRoute(instance.sectionId) : null;
  const activate =
    ctaRoute && onNavigate
      ? () => {
          onNavigate(ctaRoute);
        }
      : undefined;

  const props = instance.props;
  const shellProps = {
    preview,
    interactive,
    onActivate: activate,
  };

  switch (instance.sectionId) {
    case "welcome": {
      const bodyRaw =
        props?.welcomeBody?.trim() ||
        ctx.welcomeMessage?.trim() ||
        (preview
          ? "Welcome message from this portal default will appear here."
          : `You’re viewing ${ctx.fileLabel ?? "your loan file"}.`);
      const body = applyPortalWelcomeTokens(bodyRaw, {
        workspaceName: ctx.workspaceName,
        fileLabel: ctx.fileLabel,
      });
      return (
        <SectionShell title={title} preview={preview}>
          <p className="text-base font-semibold text-foreground">
            {ctx.workspaceName ?? "Welcome"}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {body}
          </p>
        </SectionShell>
      );
    }

    case "status_pipeline_stage": {
      const mode = props?.statusMode ?? "pipeline";
      if (mode === "custom_checklist") {
        const steps = props?.statusSteps?.length
          ? props.statusSteps
          : defaultStatusSteps();
        return (
          <SectionShell title={title} preview={preview}>
            {slots?.statusChecklist ? (
              slots.statusChecklist
            ) : (
              <CustomStatusChecklist
                steps={steps}
                interactive={interactive || preview}
              />
            )}
          </SectionShell>
        );
      }
      return (
        <SectionShell title={title} preview={preview}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-dlc-md bg-primary/10 text-primary">
              <Workflow className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {ctx.stageLabel ?? (preview ? "Application" : "In progress")}
              </p>
              {ctx.statusVisibility === "detailed" || ctx.stageDetail ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {ctx.stageDetail ??
                    (preview ? "Detailed stage visibility" : null)}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Current pipeline stage for {ctx.fileLabel ?? "this file"}
                </p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                Linked to org pipeline stages on the loan file.
              </p>
            </div>
          </div>
        </SectionShell>
      );
    }

    case "company_primary_contact": {
      const contact = resolveContactFromSectionProps(
        props,
        ctx.primaryContact ??
          (preview
            ? {
                name: "Your broker team",
                title: "Primary contact",
                email: "team@example.com",
              }
            : {
                name: ctx.workspaceName ?? "Team",
              }),
      );
      return (
        <SectionShell title={title} {...shellProps}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-dlc-md bg-muted text-foreground">
              <User className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {contact.name}
              </p>
              {contact.title ? (
                <p className="text-xs text-muted-foreground">{contact.title}</p>
              ) : null}
              {contact.email ? (
                <a
                  href={`mailto:${contact.email}`}
                  className="block text-xs text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {contact.email}
                </a>
              ) : null}
              {contact.phone ? (
                <a
                  href={`tel:${contact.phone}`}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone className="h-3 w-3" aria-hidden />
                  {contact.phone}
                </a>
              ) : null}
            </div>
          </div>
        </SectionShell>
      );
    }

    case "outstanding_documents":
      return (
        <SectionShell title={title} {...shellProps}>
          {slots?.outstandingDocuments ? (
            slots.outstandingDocuments
          ) : (
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-sm text-foreground">
                  {typeof ctx.outstandingCount === "number" &&
                  ctx.outstandingCount > 0
                    ? `${ctx.outstandingCount} outstanding request${ctx.outstandingCount === 1 ? "" : "s"}`
                    : props?.docsEmptyMessage?.trim() ||
                      (preview
                        ? "Document Vault requests from the client link appear here."
                        : "No outstanding document requests right now.")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Powered by Document Vault file tasks on this loan.
                  {interactive ? " Click to open Documents." : ""}
                </p>
              </div>
            </div>
          )}
        </SectionShell>
      );

    case "document_package":
      return (
        <SectionShell title={title} {...shellProps}>
          {slots?.documentPackage ? (
            slots.documentPackage
          ) : (
            <p className="text-sm text-muted-foreground">
              {preview
                ? "Lender package documents and folders render here."
                : typeof ctx.outstandingCount === "number"
                  ? `${ctx.outstandingCount} document${ctx.outstandingCount === 1 ? "" : "s"} in this package.`
                  : "Package documents appear below when available."}
              {interactive ? " Click to open Documents." : ""}
            </p>
          )}
        </SectionShell>
      );

    case "chat":
      if (ctx.allowMessaging === false || props?.chatEnabled === false) {
        return null;
      }
      return (
        <SectionShell title={title} preview={preview}>
          {slots?.chat ? (
            slots.chat
          ) : preview || interactive ? (
            <PreviewChatPanel
              intro={props?.chatIntro}
              interactive={interactive || preview}
            />
          ) : (
            <div className="flex items-start gap-3 rounded-dlc-md border border-border/60 bg-muted/30 px-3 py-3">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Message your broker
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {props?.chatIntro?.trim() ||
                    "Conversations sync with Messages on your loan file."}
                </p>
              </div>
            </div>
          )}
        </SectionShell>
      );

    case "start_new_loan": {
      const ctaLabel = props?.ctaLabel?.trim() || "Start a new loan";
      const ctaUrl = props?.ctaUrl?.trim();
      const help =
        props?.ctaHelpText?.trim() ||
        `Contact ${ctx.workspaceName ?? "your broker"} to start a new application.`;
      return (
        <SectionShell title={title} preview={preview}>
          <div className="flex items-start gap-3">
            <PlusCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{ctaLabel}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
              {ctaUrl ? (
                <a
                  href={ctaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-10 items-center justify-center rounded-dlc-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  {ctaLabel}
                </a>
              ) : interactive && onNavigate ? (
                <button
                  type="button"
                  className="mt-3 inline-flex min-h-10 items-center justify-center rounded-dlc-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                  onClick={() => onNavigate("submit")}
                >
                  {ctaLabel}
                </button>
              ) : null}
            </div>
          </div>
        </SectionShell>
      );
    }

    case "deal_summary":
      if (ctx.showDealSummary === false && !preview) return null;
      return (
        <SectionShell title={title} {...shellProps}>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">File</dt>
              <dd className="font-medium text-foreground">
                {ctx.fileLabel ?? (preview ? "Sample deal file" : "—")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Stage</dt>
              <dd className="font-medium text-foreground">
                {ctx.stageLabel ?? (preview ? "Underwriting" : "—")}
              </dd>
            </div>
          </dl>
        </SectionShell>
      );

    case "stat_cards": {
      const outstanding = ctx.outstandingCount ?? (preview ? 3 : 0);
      const labels = props?.statLabels?.length
        ? props.statLabels
        : ["Open items", "Stage", "File", "Status"];
      const values = [
        String(outstanding),
        ctx.stageLabel ?? (preview ? "Review" : "—"),
        ctx.fileLabel ?? (preview ? "Sample" : "—"),
        ctx.statusVisibility === "detailed" ? "Detailed" : "Active",
      ];
      const routes: PortalNavRouteKey[] = [
        "documents",
        "pipeline",
        "deals",
        "dashboard",
      ];
      const cards = labels.slice(0, 4).map((label, i) => ({
        label,
        value: values[i] ?? "—",
        route: routes[i] ?? ("dashboard" as PortalNavRouteKey),
      }));
      return (
        <SectionShell title={title} preview={preview} className="!p-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {cards.map((c) => (
              <button
                key={c.label}
                type="button"
                disabled={!interactive || !onNavigate}
                onClick={() => onNavigate?.(c.route)}
                className={cn(
                  "min-h-10 rounded-dlc-md border border-border/60 bg-muted/20 px-3 py-2.5 text-left",
                  interactive &&
                    onNavigate &&
                    "hover:border-primary/40 hover:bg-primary/5",
                  (!interactive || !onNavigate) && "cursor-default",
                )}
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-foreground">
                  {c.value}
                </p>
              </button>
            ))}
          </div>
        </SectionShell>
      );
    }

    case "notifications_banner": {
      const banner =
        props?.bannerBody?.trim() ||
        (preview
          ? "Onboarding tips and outstanding actions appear here."
          : typeof ctx.outstandingCount === "number" && ctx.outstandingCount > 0
            ? `You have ${ctx.outstandingCount} outstanding item${ctx.outstandingCount === 1 ? "" : "s"} to complete.`
            : "You're all caught up — no urgent items right now.");
      return (
        <section
          className={cn(
            "flex items-start gap-3 rounded-dlc-lg border border-amber-200/80 bg-amber-50 px-4 py-3 shadow-dlc-1",
            preview && "border-dashed",
            interactive &&
              activate &&
              "cursor-pointer transition-colors duration-dlc-short ease-dlc-standard hover:border-amber-300",
          )}
          data-portal-section=""
          {...(interactive && activate
            ? {
                role: "button" as const,
                tabIndex: 0,
                onClick: activate,
                onKeyDown: (e: KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    activate();
                  }
                },
              }
            : {})}
        >
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-950">{title}</p>
            <p className="mt-0.5 text-xs text-amber-900/80">
              {banner}
              {interactive ? " Click to review Documents." : ""}
            </p>
          </div>
        </section>
      );
    }

    case "search_bar":
      return (
        <SectionShell title={title} preview={preview} className="!py-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              readOnly={!interactive}
              placeholder={
                props?.searchPlaceholder?.trim() ||
                "Search deals, documents, or contacts…"
              }
              className="h-10 w-full rounded-dlc-md border border-border bg-background pl-9 pr-3 text-sm"
              aria-label="Portal search"
              onFocus={() => {
                if (interactive) onNavigate?.("ask_ai");
              }}
            />
          </div>
        </SectionShell>
      );

    case "activity_feed":
      return (
        <SectionShell title={title} {...shellProps}>
          <ul className="space-y-2">
            {(preview
              ? [
                  "Document uploaded — bank statements",
                  "Stage moved to Underwriting",
                  "Message from broker team",
                ]
              : [
                  ctx.fileLabel
                    ? `Viewing ${ctx.fileLabel}`
                    : "File activity will appear here",
                  ctx.stageLabel
                    ? `Current stage: ${ctx.stageLabel}`
                    : "Stage updates sync from your loan file",
                ]
            ).map((line) => (
              <li
                key={line}
                className="rounded-dlc-md border border-border/50 bg-muted/20 px-3 py-2 text-sm text-foreground"
              >
                {line}
              </li>
            ))}
          </ul>
        </SectionShell>
      );

    case "pipeline_cards":
      return (
        <SectionShell title={title} {...shellProps}>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              {
                label: "Active pipeline",
                detail: ctx.stageLabel ?? (preview ? "Underwriting" : "—"),
              },
              {
                label: "Open requests",
                detail:
                  typeof ctx.outstandingCount === "number"
                    ? String(ctx.outstandingCount)
                    : preview
                      ? "3"
                      : "—",
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-dlc-md border border-border/60 bg-gradient-to-br from-primary/5 to-transparent px-3 py-3"
              >
                <p className="text-xs font-medium text-muted-foreground">
                  {card.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {card.detail}
                </p>
              </div>
            ))}
          </div>
        </SectionShell>
      );

    default:
      return null;
  }
}

function PortalPreviewRouteStub({
  routeKey,
  onBack,
}: {
  routeKey: PortalNavRouteKey;
  onBack?: () => void;
}) {
  const label = portalPreviewRouteLabel(routeKey);
  return (
    <div
      className="col-span-12 rounded-dlc-lg border border-border bg-white px-4 py-8 text-center shadow-dlc-1"
      data-testid="portal-preview-route-stub"
      data-portal-route={routeKey}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Preview page
      </p>
      <h3 className="mt-2 text-lg font-semibold text-foreground">{label}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        This is how the {label} destination appears for this viewer. Add matching
        page sections on the dashboard, or keep this as a navigation destination
        in chrome.
      </p>
      {onBack ? (
        <button
          type="button"
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-dlc-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          onClick={onBack}
        >
          Back to Dashboard
        </button>
      ) : null}
    </div>
  );
}

export function PortalPageComposition({
  sections,
  chrome,
  context,
  slots,
  preview = false,
  interactive = false,
  activeRouteKey = "dashboard",
  onNavigate,
  className,
  before,
  after,
  wrapChrome = true,
}: {
  sections: readonly PortalPageSectionInstance[];
  chrome?: PortalChromeConfig | null;
  context?: PortalPageRenderContext | null;
  slots?: PortalPageSectionSlots;
  preview?: boolean;
  /** Builder / view-as: chrome + CTAs navigate without leaving the frame. */
  interactive?: boolean;
  activeRouteKey?: PortalNavRouteKey | string;
  onNavigate?: (routeKey: PortalNavRouteKey) => void;
  className?: string;
  before?: ReactNode;
  after?: ReactNode;
  /** When false, render grid only (chrome already wrapped by parent). */
  wrapChrome?: boolean;
}) {
  const list = Array.isArray(sections) ? sections : [];
  const enabled = list
    .filter((s) => s && s.enabled !== false)
    .slice()
    .sort(
      (a, b) =>
        (a.layout?.order ?? 0) - (b.layout?.order ?? 0) ||
        a.instanceId.localeCompare(b.instanceId),
    );

  const routeKey = (activeRouteKey || "dashboard") as PortalNavRouteKey;
  const showDashboard = isPortalPreviewDashboardRoute(routeKey);
  const routeSectionIds = showDashboard
    ? null
    : new Set(sectionsForPortalPreviewRoute(routeKey, enabled));
  const routeSections =
    routeSectionIds == null
      ? enabled
      : enabled.filter((s) => routeSectionIds.has(s.sectionId));

  const grid = (
    <div
      className={cn("grid grid-cols-12 gap-3 sm:gap-4", !wrapChrome && className)}
      data-testid="portal-page-composition"
      data-portal-active-route={routeKey}
    >
      {before ? <div className="col-span-12">{before}</div> : null}
      {!showDashboard ? (
        <div className="col-span-12 flex flex-wrap items-center justify-between gap-2 rounded-dlc-md border border-border/60 bg-muted/30 px-3 py-2">
          <p className="text-sm font-medium text-foreground">
            {portalPreviewRouteLabel(routeKey)}
          </p>
          {onNavigate ? (
            <button
              type="button"
              className="inline-flex min-h-10 items-center rounded-dlc-md px-3 text-sm font-medium text-primary hover:bg-primary/10"
              onClick={() => onNavigate("dashboard")}
              data-testid="portal-preview-back-dashboard"
            >
              Dashboard
            </button>
          ) : null}
        </div>
      ) : null}
      {enabled.length === 0 && showDashboard ? (
        <div
          className="col-span-12 rounded-dlc-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
          data-testid="portal-page-composition-empty"
        >
          No sections on this page yet.
        </div>
      ) : !showDashboard && routeSections.length === 0 ? (
        <PortalPreviewRouteStub
          routeKey={routeKey}
          onBack={onNavigate ? () => onNavigate("dashboard") : undefined}
        />
      ) : (
        (showDashboard ? enabled : routeSections).map((instance) => (
          <div
            key={instance.instanceId}
            className={portalColSpanClass(instance.layout?.colSpan)}
          >
            <PortalPageSectionBlock
              instance={instance}
              context={context}
              slots={slots}
              preview={preview}
              interactive={interactive}
              onNavigate={onNavigate}
            />
          </div>
        ))
      )}
      {after ? <div className="col-span-12">{after}</div> : null}
    </div>
  );

  if (!wrapChrome || !chrome) {
    return grid;
  }

  return (
    <PortalChromeShell
      chrome={chrome}
      workspaceName={context?.workspaceName}
      welcomeMessage={context?.welcomeMessage}
      preview={preview}
      interactive={interactive}
      activeRouteKey={routeKey}
      onNavigate={onNavigate}
      className={className}
    >
      {grid}
    </PortalChromeShell>
  );
}
