"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { SearchField } from "@/components/ui/SearchField";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { cn } from "@/lib/cn";
import { Plus, Calendar, Lightbulb, Mail, Trash2 } from "lucide-react";
import {
  OperationalRowShell,
  RowShellTitle,
} from "@/components/ui/OperationalRowShell";
import { ResponsiveToolbarGroup } from "@/components/ui/ResponsiveToolbarGroup";
import { OperationalOrientationStrip } from "@/components/ui/OperationalOrientationStrip";
import { OperationalEmptyState } from "@/components/ui/OperationalEmptyState";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";
import { OP_ACTIVE_REGION_RING } from "@/lib/ui/operationalElegance";
import {
  sortEventRows,
  type EventListSort,
} from "@/lib/events/eventListSort";

type MainTab = "events" | "inbox";
type InboxTab = "ideas" | "invitations";

function formatWhen(ms?: number) {
  if (!ms) return "No date";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function EventsWorkspaceInner() {
  const { confirm } = useOperationalConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const org = useOrgConvexQueryArgs();
  const mainTab: MainTab =
    searchParams.get("tab") === "inbox" ? "inbox" : "events";
  const inboxTab: InboxTab =
    searchParams.get("inbox") === "invitations" ? "invitations" : "ideas";

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<EventListSort>("upcoming");
  const [showArchived, setShowArchived] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const workspaceArgs = useMemo(() => {
    if (!org) return "skip" as const;
    return {
      organizationId: org.organizationId,
      memberUserKey: org.memberUserKey,
      includeArchived: showArchived,
      search: search.trim() || undefined,
    };
  }, [org, showArchived, search]);

  const workspace = useQuery(api.events.events.listWorkspace, workspaceArgs);
  const createEvent = useMutation(api.events.events.create);
  const createIdea = useMutation(api.events.events.createIdea);
  const createInvitation = useMutation(api.events.events.createInvitation);
  const convertIdea = useMutation(api.events.events.convertIdea);
  const convertInvitation = useMutation(api.events.events.convertInvitation);
  const deleteIdea = useMutation(api.events.events.deleteIdea);
  const deleteInvitation = useMutation(api.events.events.deleteInvitation);

  const sortedEvents = useMemo(() => {
    if (!workspace?.events) return [];
    return sortEventRows(workspace.events, sort);
  }, [workspace?.events, sort]);

  const setTab = useCallback(
    (tab: MainTab, inbox?: InboxTab) => {
      const p = new URLSearchParams();
      if (tab === "inbox") {
        p.set("tab", "inbox");
        p.set("inbox", inbox ?? "ideas");
      }
      router.replace(`/events${p.toString() ? `?${p}` : ""}`);
    },
    [router],
  );

  const run = async (fn: () => Promise<{ eventId?: Id<"events"> }>) => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fn();
      if (res.eventId) router.push(`/events/${res.eventId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!org) {
    return (
      <p className="text-sm text-muted-foreground">Sign in to use Events.</p>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-4 px-3 py-4 sm:px-4">
      <OperationalOrientationStrip
        suppressScopeWhenMode
        modeLabel={mainTab === "inbox" ? "Ideas + Invitations" : "Events"}
        searchHint={search.trim() || undefined}
        data-testid="events-orientation"
      />
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sr-only">
          <h1>Events</h1>
        </div>
        {mainTab === "events" ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const title = window.prompt("Event title");
                if (!title?.trim()) return {};
                return createEvent({
                  organizationId: org.organizationId,
                  memberUserKey: org.memberUserKey,
                  title: title.trim(),
                });
              })
            }
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            New event
          </Button>
        ) : null}
      </header>

      <div
        className="flex flex-wrap gap-px rounded-lg border border-border/35 bg-muted/15 p-0.5"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "events"}
          className={cn(
            "min-h-10 flex-1 rounded-md px-3 text-sm font-medium transition-colors sm:flex-none",
            mainTab === "events"
              ? cn("bg-background font-semibold text-foreground", OP_ACTIVE_REGION_RING)
              : "text-muted-foreground/80 hover:text-foreground",
          )}
          onClick={() => setTab("events")}
        >
          Events
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "inbox"}
          className={cn(
            "min-h-10 flex-1 rounded-md px-3 text-sm font-medium transition-colors sm:flex-none",
            mainTab === "inbox"
              ? cn("bg-background font-semibold text-foreground", OP_ACTIVE_REGION_RING)
              : "text-muted-foreground/80 hover:text-foreground",
          )}
          onClick={() => setTab("inbox", "ideas")}
        >
          Ideas + Invitations
        </button>
      </div>

      {mainTab === "events" ? (
        <>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <SearchField
              containerClassName="min-w-0 flex-1"
              placeholder="Search events…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ResponsiveToolbarGroup
              priority="secondary"
              className="w-full sm:w-auto"
              aria-label="Event list filters"
            >
              <Select
                value={sort}
                onChange={(e) => setSort(e.target.value as EventListSort)}
                className="min-h-10 w-full min-w-0 sm:w-40"
              >
                <option value="upcoming">Upcoming</option>
                <option value="recent">Recent</option>
                <option value="alphabetical">A–Z</option>
                <option value="custom">Custom</option>
              </Select>
              <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                Archived
              </label>
            </ResponsiveToolbarGroup>
          </div>

          {workspace === undefined ? (
            <p className="text-sm text-muted-foreground">Loading events…</p>
          ) : sortedEvents.length === 0 ? (
            <OperationalEmptyState
              title="No events yet"
              description="Create an event to plan meetings, milestones, or working sessions with your team."
              action={
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const title = window.prompt("Event title");
                      if (!title?.trim()) return {};
                      return createEvent({
                        organizationId: org.organizationId,
                        memberUserKey: org.memberUserKey,
                        title: title.trim(),
                      });
                    })
                  }
                >
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                  New event
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border/50 rounded-lg border border-border/50 bg-background">
              {sortedEvents.map((ev) => (
                <li key={String(ev._id)} className="list-none">
                  <OperationalRowShell
                    onRowClick={() => router.push(`/events/${ev._id}`)}
                    primary={
                      <RowShellTitle>
                        {ev.pinnedAt != null ? "📌 " : ""}
                        {ev.title}
                      </RowShellTitle>
                    }
                    primaryTooltip={ev.title}
                    secondary={
                      <>
                        {ev.location || "No location"}
                        <span className="text-muted-foreground/50"> · </span>
                        {ev.status}
                      </>
                    }
                    tertiary={
                      ev.viewer.isOwner
                        ? "Owner"
                        : ev.viewer.access.collaboratorRole
                          ? ev.viewer.access.collaboratorRole
                          : null
                    }
                    trailing={
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" aria-hidden />
                        {formatWhen(ev.startsAt ?? ev.calendarSortAt)}
                      </span>
                    }
                    rowClassName="px-2"
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="flex gap-1">
            <Button
              type="button"
              variant={inboxTab === "ideas" ? "primary" : "outline"}
              size="sm"
              onClick={() => setTab("inbox", "ideas")}
            >
              <Lightbulb className="mr-1 h-3.5 w-3.5" aria-hidden />
              Ideas
            </Button>
            <Button
              type="button"
              variant={inboxTab === "invitations" ? "primary" : "outline"}
              size="sm"
              onClick={() => setTab("inbox", "invitations")}
            >
              <Mail className="mr-1 h-3.5 w-3.5" aria-hidden />
              Invitations
            </Button>
          </div>

          {inboxTab === "ideas" ? (
            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  const title = window.prompt("Idea title");
                  if (!title?.trim() || !org) return;
                  setBusy(true);
                  createIdea({
                    organizationId: org.organizationId,
                    memberUserKey: org.memberUserKey,
                    title: title.trim(),
                  }).finally(() => setBusy(false));
                }}
              >
                Add idea
              </Button>
              <ul className="divide-y divide-border rounded-lg border border-border/60">
                {(workspace?.ideas ?? []).map((idea) => (
                  <li
                    key={String(idea._id)}
                    className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{idea.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {idea.status}
                        {idea.convertedToEventId
                          ? " · converted"
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                    {idea.status === "open" && idea.isOwner ? (
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-10"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            convertIdea({
                              ideaId: idea._id,
                              memberUserKey: org.memberUserKey,
                              keepOriginal: true,
                            }),
                          )
                        }
                      >
                        Convert to event
                      </Button>
                    ) : idea.convertedToEventId ? (
                      <Link
                        href={`/events/${idea.convertedToEventId}`}
                        className="text-sm text-brand-accent underline"
                      >
                        Open event
                      </Link>
                    ) : null}
                    {idea.isOwner ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-10 min-w-10 text-destructive"
                        disabled={busy}
                        title="Delete idea"
                        onClick={() => {
                          void (async () => {
                            const entityName =
                              idea.title?.trim() || "this idea";
                            const ok = await confirm({
                              ...simpleDeleteConfirm(entityName, {
                                title: "Delete idea",
                                impact: "This idea is permanently removed.",
                              }),
                            });
                            if (!ok) return;
                            setBusy(true);
                            deleteIdea({
                              ideaId: idea._id,
                              memberUserKey: org.memberUserKey,
                            })
                              .catch((e) =>
                                setErr(
                                  e instanceof Error ? e.message : String(e),
                                ),
                              )
                              .finally(() => setBusy(false));
                          })();
                        }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  const title = window.prompt("Invitation title");
                  if (!title?.trim() || !org) return;
                  setBusy(true);
                  createInvitation({
                    organizationId: org.organizationId,
                    memberUserKey: org.memberUserKey,
                    title: title.trim(),
                  }).finally(() => setBusy(false));
                }}
              >
                Add invitation
              </Button>
              <ul className="divide-y divide-border rounded-lg border border-border/60">
                {(workspace?.invitations ?? []).map((inv) => (
                  <li
                    key={String(inv._id)}
                    className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{inv.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {[inv.host, inv.venue].filter(Boolean).join(" · ") ||
                          "No details"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                    {inv.status === "open" && inv.isOwner ? (
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-10"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            convertInvitation({
                              invitationId: inv._id,
                              memberUserKey: org.memberUserKey,
                              keepOriginal: true,
                            }),
                          )
                        }
                      >
                        Convert to event
                      </Button>
                    ) : inv.convertedToEventId ? (
                      <Link
                        href={`/events/${inv.convertedToEventId}`}
                        className="text-sm text-brand-accent underline"
                      >
                        Open event
                      </Link>
                    ) : null}
                    {inv.isOwner ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-10 min-w-10 text-destructive"
                        disabled={busy}
                        title="Delete invitation"
                        onClick={() => {
                          void (async () => {
                            const entityName = inv.title?.trim() || "this invitation";
                            const ok = await confirm({
                              ...simpleDeleteConfirm(entityName, {
                                title: "Delete invitation",
                                impact:
                                  "This invitation is permanently removed.",
                              }),
                            });
                            if (!ok) return;
                            setBusy(true);
                            deleteInvitation({
                            invitationId: inv._id,
                            memberUserKey: org.memberUserKey,
                          })
                            .catch((e) =>
                              setErr(e instanceof Error ? e.message : String(e)),
                            )
                            .finally(() => setBusy(false));
                          })();
                        }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

export function EventsWorkspaceClient() {
  return (
    <ConvexQueryBoundary
      fallback={
        <p className="px-4 py-8 text-sm text-muted-foreground">Loading events…</p>
      }
    >
      <EventsWorkspaceInner />
    </ConvexQueryBoundary>
  );
}
