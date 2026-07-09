"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import {
  HeaderDisclosurePanel,
  HeaderDisclosureToggle,
} from "@/components/ui/HeaderDisclosure";
import { Input } from "@/components/ui/Input";
import { disclosureChevronClass } from "@/lib/ui/disclosureTokens";
import { ConvexQueryBoundary } from "@/components/ConvexQueryBoundary";
import { ResourceAccessProvider } from "@/components/ResourceAccessProvider";
import { ResourceAccessBanner } from "@/components/ResourceAccessBanner";
import { EventSharingPanel } from "@/components/events/EventSharingPanel";
import { EventCollaboratorRoleBadge } from "@/components/events/EventCollaboratorRoleBadge";
import { EventToast } from "@/components/events/EventToast";
import { ResourceOwnershipBadge } from "@/components/ownership/ResourceOwnershipBadge";
import { resourceAccessFromViewerAccess } from "@/lib/resourceAccessUx";
import { VIEW_ONLY_ACCESS_TOOLTIP } from "@/lib/resourceAccessUx";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { cn } from "@/lib/cn";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";
import { touchTargetIconClass } from "@/lib/ui/touchTarget";
import { layerZIndexStyle, overlayScrimClass } from "@/lib/ui/layering";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  MoreHorizontal,
  Plus,
  Share2,
  Trash2,
  Copy,
  Archive,
  X,
} from "lucide-react";

type Props = { eventId: Id<"events"> };
type Bundle = NonNullable<
  ReturnType<typeof useQuery<typeof api.events.events.getDetailBundle>>
>;
type Section = Bundle["sections"][number];
type Item = Bundle["items"][number];

function buildItemTree(items: Item[]) {
  const byParent = new Map<string, Item[]>();
  const roots: Item[] = [];
  for (const item of items) {
    const pid = item.parentItemId ? String(item.parentItemId) : "";
    if (!pid) {
      roots.push(item);
      continue;
    }
    const list = byParent.get(pid) ?? [];
    list.push(item);
    byParent.set(pid, list);
  }
  const sortList = (list: Item[]) =>
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  sortList(roots);
  for (const [, list] of byParent) sortList(list);
  return { roots, byParent };
}

function EventDetailInner({ eventId }: Props) {
  const { confirm } = useOperationalConfirm();
  const org = useOrgConvexQueryArgs();
  const [shareOpen, setShareOpen] = useState(false);
  const [headerDetailsExpanded, setHeaderDetailsExpanded] = useState(false);
  const [headerDetailsMounted, setHeaderDetailsMounted] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const bundleArgs = useMemo(() => {
    if (!org) return "skip" as const;
    return { eventId, memberUserKey: org.memberUserKey };
  }, [org, eventId]);

  const bundle = useQuery(api.events.events.getDetailBundle, bundleArgs);
  const patchEvent = useMutation(api.events.events.patch);
  const archiveEvent = useMutation(api.events.events.archive);
  const removeEvent = useMutation(api.events.events.remove);
  const duplicateEvent = useMutation(api.events.events.duplicate);
  const upsertSection = useMutation(api.events.events.upsertSection);
  const upsertItem = useMutation(api.events.events.upsertItem);
  const deleteSection = useMutation(api.events.events.deleteSection);
  const deleteItem = useMutation(api.events.events.deleteItem);
  const deleteItemLink = useMutation(api.events.events.deleteItemLink);
  const deleteItemAttachment = useMutation(api.events.events.deleteItemAttachment);
  const reorderSections = useMutation(api.events.events.reorderSections);

  const readOnly = bundle?.viewer.readOnly ?? true;
  const accessUx = useMemo(
    () =>
      bundle
        ? resourceAccessFromViewerAccess({
            bannerMode: bundle.viewer.bannerMode,
            ownerDisplayUsername: bundle.event.ownerDisplayUsername ?? "",
          })
        : resourceAccessFromViewerAccess(null),
    [bundle],
  );

  const itemsBySection = useMemo(() => {
    const map = new Map<string, Item[]>();
    if (!bundle) return map;
    for (const item of bundle.items) {
      const sid = String(item.sectionId);
      const list = map.get(sid) ?? [];
      list.push(item);
      map.set(sid, list);
    }
    return map;
  }, [bundle]);

  useEffect(() => {
    if (headerDetailsExpanded) setHeaderDetailsMounted(true);
  }, [headerDetailsExpanded]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const notifyRemoved = useCallback((label: string) => {
    setToast(`${label} removed`);
  }, []);

  const renderItems = useCallback(
    (
      section: Section,
      items: Item[],
      depth = 0,
    ): React.ReactNode => {
      if (!bundle || !org) return null;
      const { roots, byParent } = buildItemTree(items);
      const renderOne = (item: Item, level: number): React.ReactNode => {
        const itemKey = String(item._id);
        const links =
          (bundle.linksByItemId[itemKey] as Doc<"eventItemLinks">[]) ?? [];
        const attachments =
          (bundle.attachmentsByItemId[itemKey] as Doc<"eventItemAttachments">[]) ??
          [];
        const children = byParent.get(itemKey) ?? [];
        return (
          <div key={itemKey} className="space-y-1">
            <div
              className={cn(
                "group flex items-start gap-2 rounded-md py-1.5 pr-1",
                "hover:bg-muted/40",
                level > 0 && "border-l-2 border-border/60",
              )}
              style={{ paddingLeft: level > 0 ? `${level * 12 + 4}px` : undefined }}
            >
              <input
                type="checkbox"
                checked={Boolean(item.isChecked)}
                disabled={readOnly}
                title={readOnly ? VIEW_ONLY_ACCESS_TOOLTIP : undefined}
                className={cn(
                  "mt-2.5 h-4 w-4 shrink-0",
                  readOnly && "cursor-not-allowed opacity-70",
                )}
                onChange={(e) => {
                  if (readOnly) return;
                  run(() =>
                    upsertItem({
                      eventId,
                      sectionId: section._id,
                      itemId: item._id,
                      memberUserKey: org.memberUserKey,
                      title: item.title,
                      isChecked: e.target.checked,
                    }),
                  );
                }}
              />
              <input
                className={cn(
                  "min-h-10 flex-1 break-words rounded border-0 bg-transparent px-1 text-sm leading-relaxed",
                  "focus-visible:ring-1 focus-visible:ring-brand-accent",
                  readOnly && "cursor-not-allowed",
                )}
                defaultValue={item.title}
                readOnly={readOnly}
                title={readOnly ? VIEW_ONLY_ACCESS_TOOLTIP : undefined}
                onBlur={(e) => {
                  if (readOnly) return;
                  const v = e.target.value.trim();
                  if (v !== item.title) {
                    run(() =>
                      upsertItem({
                        eventId,
                        sectionId: section._id,
                        itemId: item._id,
                        memberUserKey: org.memberUserKey,
                        title: v,
                      }),
                    );
                  }
                }}
              />
              {!readOnly ? (
                <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 min-w-9 p-0 text-muted-foreground"
                    disabled={busy}
                    title="Add sub-item"
                    onClick={() => {
                      const title = window.prompt("Sub-item title");
                      if (!title?.trim()) return;
                      run(() =>
                        upsertItem({
                          eventId,
                          sectionId: section._id,
                          memberUserKey: org.memberUserKey,
                          title: title.trim(),
                          parentItemId: item._id,
                          itemType: "checkbox",
                        }),
                      );
                    }}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 min-w-9 p-0 text-destructive"
                    disabled={busy}
                    title="Delete item"
                    onClick={() => {
                      run(() =>
                        deleteItem({
                          eventId,
                          itemId: item._id,
                          memberUserKey: org.memberUserKey,
                        }),
                      ).then(() => notifyRemoved("Item"));
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ) : null}
            </div>
            {links.length > 0 || attachments.length > 0 ? (
              <ul
                className="space-y-1 text-xs text-muted-foreground"
                style={{ paddingLeft: `${(level + 1) * 12 + 28}px` }}
              >
                {links.map((link) => (
                  <li
                    key={String(link._id)}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center gap-1 text-brand-accent underline"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden />
                      {link.label || link.url}
                    </a>
                    {!readOnly ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 min-h-8 px-2 text-destructive"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            deleteItemLink({
                              eventId,
                              linkId: link._id,
                              memberUserKey: org.memberUserKey,
                            }),
                          ).then(() => notifyRemoved("Link"))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    ) : null}
                  </li>
                ))}
                {attachments.map((att) => (
                  <li
                    key={String(att._id)}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="truncate">{att.fileName ?? "Attachment"}</span>
                    {!readOnly ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 min-h-8 px-2 text-destructive"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            deleteItemAttachment({
                              eventId,
                              attachmentId: att._id,
                              memberUserKey: org.memberUserKey,
                            }),
                          ).then(() => notifyRemoved("Attachment"))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {children.map((child) => renderOne(child, level + 1))}
          </div>
        );
      };
      return roots.map((item) => renderOne(item, depth));
    },
    [
      bundle,
      org,
      readOnly,
      busy,
      eventId,
      run,
      upsertItem,
      deleteItem,
      deleteItemLink,
      deleteItemAttachment,
      notifyRemoved,
    ],
  );

  const moveSection = useCallback(
    (sectionId: Id<"eventSections">, direction: -1 | 1) => {
      if (!bundle || !org) return;
      const ids = bundle.sections.map((s) => s._id);
      const idx = ids.findIndex((id) => id === sectionId);
      const next = idx + direction;
      if (idx < 0 || next < 0 || next >= ids.length) return;
      const swapped = [...ids];
      [swapped[idx], swapped[next]] = [swapped[next], swapped[idx]];
      run(() =>
        reorderSections({
          eventId,
          memberUserKey: org.memberUserKey,
          orderedSectionIds: swapped,
        }),
      );
    },
    [bundle, org, eventId, run, reorderSections],
  );

  if (!org) {
    return (
      <p className="text-sm text-muted-foreground">Sign in to view this event.</p>
    );
  }

  if (bundle === undefined) {
    return <p className="text-sm text-muted-foreground">Loading event…</p>;
  }

  if (bundle === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Event not found or you do not have access.
      </p>
    );
  }

  const { event, viewer, sections } = bundle;

  return (
    <ResourceAccessProvider value={accessUx}>
      <div className="flex min-h-0 min-w-0 flex-col">
        <ResourceAccessBanner
          mode={viewer.bannerMode}
          ownerDisplayUsername={event.ownerDisplayUsername}
          resourceKind="event"
        />

        <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-1 flex-col gap-0 px-3 sm:px-4 lg:flex-row lg:gap-6">
          <div className="min-w-0 flex-1 pb-8">
            <header
              className="sticky top-0 z-10 -mx-3 border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur-sm sm:-mx-4 sm:px-4"
              style={layerZIndexStyle("HEADER")}
            >
              <div className="flex h-9 min-h-9 min-w-0 max-w-full flex-nowrap items-center gap-1.5 max-md:min-h-11 sm:gap-2">
                <Link
                  href="/events"
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-dlc-sm border border-border/80 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="h-3.5 w-3.5 rotate-180" aria-hidden />
                  <span className="hidden sm:inline">Events</span>
                </Link>
                <div className="min-w-0 flex-1">
                  <Input
                    className="h-8 min-h-8 border-transparent bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-1"
                    defaultValue={event.title}
                    readOnly={readOnly}
                    title={readOnly ? VIEW_ONLY_ACCESS_TOOLTIP : undefined}
                    onBlur={(e) => {
                      if (readOnly) return;
                      const v = e.target.value.trim();
                      if (v && v !== event.title) {
                        run(() =>
                          patchEvent({
                            eventId,
                            memberUserKey: org.memberUserKey,
                            title: v,
                          }),
                        );
                      }
                    }}
                  />
                </div>
                {viewer.isOwner ? (
                  <ResourceOwnershipBadge badge="owner" />
                ) : viewer.bannerMode === "co_owner" ? (
                  <EventCollaboratorRoleBadge role="co_owner" />
                ) : viewer.readOnly ? (
                  <EventCollaboratorRoleBadge role="viewer" />
                ) : (
                  <EventCollaboratorRoleBadge role="editor" />
                )}
                <HeaderDisclosureToggle
                  expanded={headerDetailsExpanded}
                  onToggle={() => setHeaderDetailsExpanded((o) => !o)}
                  labelCollapsed="Show event details"
                  labelExpanded="Hide event details"
                />
                <DropdownMenu
                  aria-label="Event actions"
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn("h-8 w-8 shrink-0 p-0", touchTargetIconClass)}
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </Button>
                  }
                >
                  <DropdownMenuItem onClick={() => setShareOpen(true)}>
                    <Share2 className="h-4 w-4 shrink-0" aria-hidden />
                    Share event
                  </DropdownMenuItem>
                  {!readOnly ? (
                    <>
                      <DropdownMenuItem
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            duplicateEvent({
                              eventId,
                              memberUserKey: org.memberUserKey,
                            }),
                          )
                        }
                      >
                        <Copy className="h-4 w-4 shrink-0" aria-hidden />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            archiveEvent({
                              eventId,
                              memberUserKey: org.memberUserKey,
                            }),
                          )
                        }
                      >
                        <Archive className="h-4 w-4 shrink-0" aria-hidden />
                        Archive
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {viewer.isOwner ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        destructive
                        disabled={busy}
                        onClick={() => {
                          void (async () => {
                            const entityName =
                              bundle?.event.title?.trim() || "this event";
                            const ok = await confirm({
                              ...simpleDeleteConfirm(entityName, {
                                title: "Delete event",
                                impact:
                                  "This event and its sections are permanently removed.",
                              }),
                            });
                            if (!ok) return;
                            run(() =>
                              removeEvent({
                                eventId,
                                memberUserKey: org.memberUserKey,
                              }),
                            ).then(() => {
                              window.location.href = "/events";
                            });
                          })();
                        }}
                      >
                        <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                        Delete event
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenu>
              </div>
              {headerDetailsMounted ? (
                <HeaderDisclosurePanel
                  open={headerDetailsExpanded}
                  className="mt-1"
                >
                  <p className="text-xs text-muted-foreground">
                    {event.status}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                  {bundle.collaborators.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {bundle.collaborators.slice(0, 8).map((c) => (
                        <li
                          key={c.userId}
                          className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-dlc-surface-card px-2 py-1 text-xs"
                        >
                          <span className="truncate font-medium">
                            {c.displayUsername || c.userId}
                          </span>
                          <EventCollaboratorRoleBadge
                            role={c.collaboratorRole}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </HeaderDisclosurePanel>
              ) : null}
            </header>

            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="Location"
                  defaultValue={event.location ?? ""}
                  readOnly={readOnly}
                  title={readOnly ? VIEW_ONLY_ACCESS_TOOLTIP : undefined}
                  className="min-h-10"
                  onBlur={(e) => {
                    if (readOnly) return;
                    run(() =>
                      patchEvent({
                        eventId,
                        memberUserKey: org.memberUserKey,
                        location: e.target.value,
                      }),
                    );
                  }}
                />
                <Input
                  type="datetime-local"
                  readOnly={readOnly}
                  title={readOnly ? VIEW_ONLY_ACCESS_TOOLTIP : undefined}
                  className="min-h-10"
                  defaultValue={
                    event.startsAt
                      ? new Date(event.startsAt).toISOString().slice(0, 16)
                      : ""
                  }
                  onBlur={(e) => {
                    if (readOnly) return;
                    const v = e.target.value;
                    run(() =>
                      patchEvent({
                        eventId,
                        memberUserKey: org.memberUserKey,
                        startsAt: v ? new Date(v).getTime() : null,
                      }),
                    );
                  }}
                />
              </div>

              <textarea
                className="min-h-24 w-full max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed"
                placeholder="Description"
                defaultValue={event.description ?? ""}
                readOnly={readOnly}
                title={readOnly ? VIEW_ONLY_ACCESS_TOOLTIP : undefined}
                onBlur={(e) => {
                  if (readOnly) return;
                  run(() =>
                    patchEvent({
                      eventId,
                      memberUserKey: org.memberUserKey,
                      description: e.target.value,
                    }),
                  );
                }}
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Sections
                </h2>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-10"
                    disabled={busy}
                    onClick={() => {
                      const title = window.prompt("Section name");
                      if (!title?.trim()) return;
                      run(() =>
                        upsertSection({
                          eventId,
                          memberUserKey: org.memberUserKey,
                          title: title.trim(),
                        }),
                      );
                    }}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Add section
                  </Button>
                ) : null}
              </div>

              <div className="space-y-3">
                {sections.map((section, sectionIndex) => {
                  const sid = String(section._id);
                  const isOpen = expanded[sid] ?? !section.collapsedByDefault;
                  const sectionItems = itemsBySection.get(sid) ?? [];
                  return (
                    <div
                      key={sid}
                      className="dlc-workspace-island overflow-hidden rounded-lg"
                    >
                      <div className="flex items-stretch gap-0 border-b border-border/40">
                        <button
                          type="button"
                          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
                          onClick={() =>
                            setExpanded((prev) => ({ ...prev, [sid]: !isOpen }))
                          }
                        >
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 shrink-0",
                              disclosureChevronClass,
                              isOpen && "rotate-180",
                            )}
                            aria-hidden
                          />
                          <span className="font-medium text-foreground">
                            {section.title}
                          </span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {sectionItems.filter((i) => !i.parentItemId).length}{" "}
                            items
                          </span>
                        </button>
                        {!readOnly ? (
                          <div className="flex shrink-0 items-center border-l border-border/40">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-12 min-w-10 rounded-none px-2"
                              disabled={busy || sectionIndex === 0}
                              title="Move section up"
                              onClick={() => moveSection(section._id, -1)}
                            >
                              <ChevronUp className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-12 min-w-10 rounded-none px-2"
                              disabled={
                                busy || sectionIndex === sections.length - 1
                              }
                              title="Move section down"
                              onClick={() => moveSection(section._id, 1)}
                            >
                              <ChevronDown className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-12 min-w-10 rounded-none px-2 text-destructive"
                              disabled={busy}
                              title="Delete section"
                              onClick={() => {
                                void (async () => {
                                  const ok = await confirm({
                                    ...simpleDeleteConfirm(section.title, {
                                      title: "Delete section",
                                      impact:
                                        "This section and all of its items are permanently removed.",
                                    }),
                                  });
                                  if (!ok) return;
                                  run(() =>
                                    deleteSection({
                                      eventId,
                                      sectionId: section._id,
                                      memberUserKey: org.memberUserKey,
                                    }),
                                  );
                                })();
                              }}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      {isOpen ? (
                        <div className="space-y-1 px-3 py-3">
                          {renderItems(section, sectionItems)}
                          {!readOnly ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-1 min-h-10 w-full justify-start"
                              disabled={busy}
                              onClick={() => {
                                const title = window.prompt("Item title");
                                if (!title?.trim()) return;
                                run(() =>
                                  upsertItem({
                                    eventId,
                                    sectionId: section._id,
                                    memberUserKey: org.memberUserKey,
                                    title: title.trim(),
                                    itemType: "checkbox",
                                  }),
                                );
                              }}
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                              Add item
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {err ? (
                <p className="text-sm text-destructive" role="alert">
                  {err}
                </p>
              ) : null}
            </div>
          </div>

          {shareOpen ? (
            <>
              <button
                type="button"
                className={cn(
                  "fixed inset-0 backdrop-blur-[2px] lg:hidden",
                  overlayScrimClass(),
                )}
                style={layerZIndexStyle("POPOVER")}
                aria-label="Close sharing panel"
                onClick={() => setShareOpen(false)}
              />
              <aside
                className={cn(
                  "fixed inset-y-0 right-0 isolate flex w-full max-w-md flex-col overflow-hidden border-l border-border/50 bg-background shadow-xl",
                  "lg:static lg:max-h-none lg:w-80 lg:shrink-0 lg:shadow-none",
                )}
                style={layerZIndexStyle("MODAL")}
              >
                <div className="flex min-h-12 items-center justify-between border-b border-border px-4 py-3">
                  <h2 className="font-semibold">Collaboration</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-10 min-w-10"
                    onClick={() => setShareOpen(false)}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
                <div
                  data-nested-scroll
                  className="min-h-0 flex-1 touch-scroll-y overflow-y-auto overscroll-contain px-4 py-4"
                >
                  <EventSharingPanel
                    eventId={eventId}
                    organizationId={org.organizationId}
                    memberUserKey={org.memberUserKey}
                    ownerUserId={event.ownerUserId}
                    canManage={bundle.viewer.canManageCollaborators}
                    canTransferOwnership={bundle.viewer.canTransferOwnership}
                  />
                  <div className="mt-6 border-t border-border/60 pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Recent activity
                    </h3>
                    <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                      {bundle.activity.map((a) => (
                        <li key={String(a._id)}>
                          <span className="text-foreground">{a.summary}</span>
                          <br />
                          {new Date(a.at).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </aside>
            </>
          ) : null}
        </div>

        <EventToast message={toast} onDismiss={() => setToast(null)} />
      </div>
    </ResourceAccessProvider>
  );
}

export function EventDetailClient({ eventId }: Props) {
  return (
    <ConvexQueryBoundary
      fallback={
        <p className="px-4 py-8 text-sm text-muted-foreground">Loading event…</p>
      }
    >
      <EventDetailInner eventId={eventId} />
    </ConvexQueryBoundary>
  );
}
