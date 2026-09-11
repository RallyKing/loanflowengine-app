"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  CalendarClock,
  Mail,
  MessageSquare,
  Workflow,
  Zap,
} from "lucide-react";
import { MessageTemplatesManager } from "@/components/settings/MessageTemplatesManager";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { OperationalEmptyState } from "@/components/ui/OperationalEmptyState";
import { cn } from "@/lib/cn";

export type AutomationsSection = "email" | "sms" | "automation";

const SECTION_TABS: ReadonlyArray<{
  value: AutomationsSection;
  label: string;
  icon: typeof Mail;
}> = [
  { value: "email", label: "Email templates", icon: Mail },
  { value: "sms", label: "SMS templates", icon: MessageSquare },
  { value: "automation", label: "Automation templates", icon: Workflow },
];

const AUTOMATION_PLACEHOLDERS = [
  {
    id: "scheduled-follow-ups",
    title: "Scheduled follow-ups",
    description:
      "Reusable cadence templates for timed email or SMS follow-ups after stage changes or sends.",
    icon: CalendarClock,
  },
  {
    id: "reminders",
    title: "Reminders",
    description:
      "Reminder templates for tasks, document requests, and deadline nudges.",
    icon: Bell,
  },
  {
    id: "notifications",
    title: "Notifications",
    description:
      "Notification copy templates for status updates and internal alerts.",
    icon: Workflow,
  },
] as const;

function parseSection(raw: string | null): AutomationsSection {
  if (raw === "sms" || raw === "automation") return raw;
  return "email";
}

/**
 * Automations hub — canonical home for `communicationTemplates` (email/SMS)
 * plus placeholders for unfinished automation-template types.
 * Scroll: AppChrome `<main>` (default signed-in contract).
 */
export function AutomationsWorkspaceClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = parseSection(searchParams.get("section"));

  const setSection = useCallback(
    (next: AutomationsSection) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "email") params.delete("section");
      else params.set("section", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const channel = useMemo(
    () => (section === "sms" ? ("sms" as const) : ("email" as const)),
    [section],
  );

  return (
    <PageErrorBoundary>
      <div
        className={cn(
          "mx-auto min-h-0 w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 md:py-8",
        )}
        data-testid="automations-workspace"
      >
        <header className="mb-6 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Zap className="h-8 w-8 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Automations
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Email and SMS templates plus automation templates for updates,
                notifications, scheduled follow-ups, and reminders. Uses the
                same org template library as compose and Settings links.
              </p>
            </div>
          </div>
        </header>

        <div
          className="mb-6 inline-flex max-w-full flex-wrap rounded-dlc-lg border border-border/60 bg-dlc-surface p-1"
          role="tablist"
          aria-label="Automations sections"
        >
          {SECTION_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = section === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-dlc-md px-3 py-2 text-xs font-medium transition-colors duration-dlc-short ease-dlc-standard",
                  active
                    ? "bg-primary text-primary-foreground shadow-dlc-1"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
                onClick={() => setSection(tab.value)}
                data-testid={`automations-section-${tab.value}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </div>

        {section === "automation" ? (
          <section
            aria-labelledby="automation-templates-heading"
            className="space-y-4"
          >
            <div>
              <h2
                id="automation-templates-heading"
                className="text-sm font-semibold tracking-tight text-foreground"
              >
                Automation templates
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Scheduled follow-ups, reminders, and notification automations
                will build on the same email/SMS templates. Email and SMS
                libraries are ready now; automation types below are coming
                soon.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {AUTOMATION_PLACEHOLDERS.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.id}
                    className="dlc-surface-card flex flex-col rounded-dlc-lg p-4"
                    data-testid={`automations-placeholder-${item.id}`}
                  >
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-dlc-md bg-muted/40 text-muted-foreground">
                      <Icon className="h-4 w-4" aria-hidden />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-1 flex-1 text-xs text-muted-foreground">
                      {item.description}
                    </p>
                    <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Coming soon
                    </p>
                  </li>
                );
              })}
            </ul>
            <div className="dlc-surface-card rounded-dlc-lg px-4 py-6 sm:px-6">
              <OperationalEmptyState
                data-testid="automations-automation-empty"
                icon={<Workflow className="h-5 w-5" aria-hidden />}
                title="Automation CRUD not shipped yet"
                description="Use Email and SMS templates for sends today. Check Coming soon for other unfinished modules."
                action={
                  <div className="flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => setSection("email")}
                    >
                      Open email templates
                    </button>
                    <Link
                      href="/coming-soon"
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Coming soon
                    </Link>
                  </div>
                }
              />
            </div>
          </section>
        ) : (
          <section
            aria-labelledby="message-templates-heading"
            className="space-y-3"
          >
            <h2
              id="message-templates-heading"
              className="sr-only"
            >
              {section === "sms" ? "SMS templates" : "Email templates"}
            </h2>
            <MessageTemplatesManager
              channel={channel}
              onChannelChange={(next) =>
                setSection(next === "sms" ? "sms" : "email")
              }
              hideChannelTabs
            />
          </section>
        )}
      </div>
    </PageErrorBoundary>
  );
}
