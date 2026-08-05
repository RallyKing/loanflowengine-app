"use client";

/**
 * Portal defaults page builder — LeadConnector-style canvas:
 * top chrome, left palette, center live preview, drag-and-drop reorder/add.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  GripVertical,
  LayoutTemplate,
  Monitor,
  Plus,
  Save,
  Smartphone,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import {
  PortalPageComposition,
  PortalPageSectionBlock,
} from "@/components/portal/PortalPageSectionRenderer";
import { PortalSectionConfigPanel } from "@/components/portal/PortalSectionConfigPanel";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { cn } from "@/lib/cn";
import {
  PORTAL_DEFAULT_TYPES,
  PORTAL_DEFAULT_TYPE_LABELS,
  type PortalDefaultType,
} from "@/lib/portalDefaults";
import {
  defaultSectionsForPortalType,
  getPortalPageSectionDef,
  makeSectionInstance,
  sanitizePortalPageSections,
  sectionsForPortalType,
  PORTAL_SECTION_COL_SPANS,
  type PortalPageSectionId,
  type PortalPageSectionInstance,
  type PortalSectionColSpan,
} from "@/lib/portalPageSections";
import {
  defaultPortalChrome,
  makePortalNavItem,
  sanitizePortalChrome,
  PORTAL_NAV_ICON_KEYS,
  PORTAL_NAV_ROUTE_KEYS,
  PORTAL_NAV_ROUTE_LABELS,
  type PortalChromeConfig,
  type PortalNavIconKey,
  type PortalNavRouteKey,
} from "@/lib/portalChrome";
import { portalPreviewRouteLabel } from "@/lib/portalPreviewRoutes";
import type { PortalSectionProps } from "@/lib/portalSectionConfig";

const CANVAS_DROP_ID = "portal-builder-canvas";
const PALETTE_PREFIX = "palette:";

type PreviewWidth = "desktop" | "mobile";
type BuilderMode = "edit" | "preview";

type DragPayload =
  | { kind: "canvas"; instanceId: string }
  | { kind: "palette"; sectionId: PortalPageSectionId };

function parseDragId(id: string | number): DragPayload | null {
  const raw = String(id);
  if (raw.startsWith(PALETTE_PREFIX)) {
    const sectionId = raw.slice(PALETTE_PREFIX.length) as PortalPageSectionId;
    if (!getPortalPageSectionDef(sectionId)) return null;
    return { kind: "palette", sectionId };
  }
  if (raw === CANVAS_DROP_ID) return null;
  return { kind: "canvas", instanceId: raw };
}

function PaletteCard({
  sectionId,
  label,
  description,
  disabled,
  already,
}: {
  sectionId: PortalPageSectionId;
  label: string;
  description: string;
  disabled?: boolean;
  already?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${PALETTE_PREFIX}${sectionId}`,
    disabled: disabled || already,
    data: { kind: "palette", sectionId } satisfies DragPayload,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={disabled || already}
      className={cn(
        "flex w-full min-h-10 cursor-grab flex-col items-start rounded-dlc-md border border-border bg-dlc-surface-high px-3 py-2.5 text-left shadow-dlc-1 transition-colors duration-dlc-short ease-dlc-standard active:cursor-grabbing",
        (disabled || already) && "cursor-not-allowed opacity-50",
        !already && !disabled && "hover:border-primary/40 hover:bg-muted/30",
        isDragging && "opacity-40 ring-2 ring-primary/30",
      )}
      data-testid={`portal-builder-add-${sectionId}`}
      {...attributes}
      {...listeners}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-[11px] text-muted-foreground line-clamp-2">
        {already ? "Already on this page" : description}
      </span>
    </button>
  );
}

function SortableCanvasSection({
  instance,
  previewMode,
  disabled,
  selected,
  onSelect,
  onRemove,
  onColSpanChange,
  renderContext,
}: {
  instance: PortalPageSectionInstance;
  previewMode: boolean;
  disabled?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onRemove: () => void;
  onColSpanChange: (colSpan: PortalSectionColSpan) => void;
  renderContext: {
    workspaceName: string;
    fileLabel: string;
    stageLabel: string;
    stageDetail: string;
    welcomeMessage: string;
    outstandingCount: number;
    primaryContact: { name: string; title: string; email: string };
    statusVisibility: "basic" | "detailed";
    allowMessaging: boolean;
    showDealSummary: boolean;
  };
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: instance.instanceId,
    disabled: disabled || previewMode,
    data: { kind: "canvas", instanceId: instance.instanceId } satisfies DragPayload,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative",
        isDragging && "z-10 opacity-70",
      )}
      data-testid={`portal-builder-section-${instance.sectionId}`}
    >
      {!previewMode ? (
        <div className="mb-1 flex items-center justify-between gap-2 px-0.5">
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted"
            aria-label="Drag to reorder"
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </button>
          <label className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="shrink-0">Width</span>
            <Select
              className="min-h-9 flex-1 text-xs"
              value={String(instance.layout?.colSpan ?? 12)}
              disabled={disabled}
              aria-label="Section column span"
              onChange={(e) => {
                const next = Number(e.target.value) as PortalSectionColSpan;
                onColSpanChange(next);
              }}
            >
              {PORTAL_SECTION_COL_SPANS.map((n) => (
                <option key={n} value={n}>
                  {n}/12
                </option>
              ))}
            </Select>
          </label>
          <Button
            type="button"
            variant="ghost"
            className="min-h-9 shrink-0 text-destructive"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Remove section"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ) : null}
      <div
        role="button"
        tabIndex={previewMode ? -1 : 0}
        className={cn(
          "w-full text-left",
          !previewMode && "rounded-dlc-md ring-1 ring-border/60",
          selected && !previewMode && "ring-2 ring-primary/50",
          isDragging && "ring-2 ring-primary/40",
          !previewMode && "cursor-pointer",
        )}
        onClick={() => {
          if (!previewMode) onSelect?.();
        }}
        onKeyDown={(e) => {
          if (previewMode) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect?.();
          }
        }}
        data-testid={`portal-builder-select-${instance.sectionId}`}
      >
        <PortalPageSectionBlock
          instance={instance}
          preview
          interactive={false}
          context={renderContext}
        />
      </div>
    </div>
  );
}

function CanvasDropZone({
  children,
  isEmpty,
}: {
  children: ReactNode;
  isEmpty: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[280px] rounded-dlc-lg border border-dashed border-border/80 bg-white p-3 shadow-dlc-1 transition-colors duration-dlc-short ease-dlc-standard sm:p-5",
        isOver && "border-primary/50 bg-primary/5",
        isEmpty && "flex flex-col items-center justify-center",
      )}
      data-testid="portal-builder-canvas"
    >
      {children}
    </div>
  );
}

export function PortalDefaultsPageBuilder({
  portalDefaultId,
}: {
  portalDefaultId: Id<"portalDefaults">;
}) {
  const orgScope = useOrgConvexQueryArgs();
  const memberUserKey = orgScope?.memberUserKey;

  const parent = useQuery(
    api.portalDefaults.get,
    memberUserKey ? { id: portalDefaultId, memberUserKey } : "skip",
  );
  const versions = useQuery(
    api.portalDefaults.listVersions,
    memberUserKey ? { portalDefaultId, memberUserKey } : "skip",
  );

  const createVersionM = useMutation(api.portalDefaults.createVersion);
  const updateVersionM = useMutation(api.portalDefaults.updateVersion);
  const promoteVersionM = useMutation(api.portalDefaults.promoteVersion);
  const updateParentM = useMutation(api.portalDefaults.update);

  const [selectedVersionId, setSelectedVersionId] = useState<
    Id<"portalDefaultVersions"> | null
  >(null);
  const [sections, setSections] = useState<PortalPageSectionInstance[]>([]);
  const [chrome, setChrome] = useState<PortalChromeConfig>(() =>
    defaultPortalChrome("client"),
  );
  const [paletteTab, setPaletteTab] = useState<"sections" | "chrome">(
    "sections",
  );
  const [versionName, setVersionName] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("desktop");
  const [mode, setMode] = useState<BuilderMode>("edit");
  const [viewAs, setViewAs] = useState<PortalDefaultType | null>(null);
  const [previewRouteKey, setPreviewRouteKey] =
    useState<PortalNavRouteKey>("dashboard");
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "dirty" | "saving" | "saved"
  >("idle");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creatingVersion = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const selectedVersion = useMemo(
    () => versions?.find((v) => v._id === selectedVersionId) ?? null,
    [versions, selectedVersionId],
  );

  const portalType = (parent?.portalType ?? "client") as PortalDefaultType;
  const effectiveViewAs = viewAs ?? portalType;
  const palette = useMemo(
    () => sectionsForPortalType(portalType),
    [portalType],
  );

  const usedSectionIds = useMemo(
    () => new Set(sections.map((s) => s.sectionId)),
    [sections],
  );

  const allowMessaging =
    (parent?.config as { allowMessaging?: boolean } | undefined)
      ?.allowMessaging !== false;

  const selectedInstance = useMemo(
    () => sections.find((s) => s.instanceId === selectedInstanceId) ?? null,
    [sections, selectedInstanceId],
  );

  const previewContact = useMemo(() => {
    const contactSec = sections.find(
      (s) => s.sectionId === "company_primary_contact" && s.enabled !== false,
    );
    const src = contactSec?.props?.contactSource ?? "organization";
    if (src === "custom" && contactSec?.props?.customContact) {
      const c = contactSec.props.customContact;
      return {
        name: c.name?.trim() || "Primary contact",
        title: c.title?.trim() || "Custom contact",
        email: c.email?.trim() || "contact@example.com",
        phone: c.phone?.trim(),
      };
    }
    if (src === "file_owner") {
      return {
        name: "Alex Broker",
        title: "File owner",
        email: "alex@example.com",
      };
    }
    return {
      name: "Your organization",
      title: "Brokerage",
      email: "team@example.com",
    };
  }, [sections]);

  const previewContext = useMemo(
    () => ({
      workspaceName: "Your organization",
      fileLabel: "Sample loan file",
      stageLabel: "Underwriting",
      stageDetail: "Credit review",
      welcomeMessage,
      outstandingCount: 3,
      primaryContact: previewContact,
      statusVisibility: "detailed" as const,
      allowMessaging,
      showDealSummary: true,
    }),
    [welcomeMessage, previewContact, allowMessaging],
  );

  /** Live canvas vs simulating another audience's soft-start defaults. */
  const interactivePreview = useMemo(() => {
    const simulatingOther = effectiveViewAs !== portalType;
    if (simulatingOther) {
      return {
        sections: defaultSectionsForPortalType(effectiveViewAs),
        chrome: defaultPortalChrome(effectiveViewAs),
        simulatingOther: true as const,
      };
    }
    return {
      sections,
      chrome,
      simulatingOther: false as const,
    };
  }, [effectiveViewAs, portalType, sections, chrome]);

  useEffect(() => {
    setViewAs(null);
    setPreviewRouteKey("dashboard");
  }, [portalDefaultId, portalType]);

  useEffect(() => {
    if (mode === "edit") setPreviewRouteKey("dashboard");
  }, [mode]);

  useEffect(() => {
    if (!versions || versions.length === 0) return;
    if (selectedVersionId) {
      const still = versions.some((v) => v._id === selectedVersionId);
      if (still) return;
    }
    const active = versions.find((v) => v.isActive) ?? versions[0] ?? null;
    if (active) setSelectedVersionId(active._id);
  }, [versions, selectedVersionId]);

  useEffect(() => {
    if (!orgScope || !parent || versions === undefined) return;
    if (versions.length > 0) return;
    if (creatingVersion.current) return;
    creatingVersion.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const id = await createVersionM({
          portalDefaultId,
          name: "Version 1",
          memberUserKey: orgScope.memberUserKey,
        });
        if (cancelled) return;
        await promoteVersionM({
          versionId: id,
          memberUserKey: orgScope.memberUserKey,
        });
        setSelectedVersionId(id);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not create the first version",
          );
        }
      } finally {
        creatingVersion.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    orgScope,
    parent,
    versions,
    portalDefaultId,
    createVersionM,
    promoteVersionM,
  ]);

  useEffect(() => {
    if (!selectedVersion) return;
    const safe = sanitizePortalPageSections(
      portalType,
      Array.isArray(selectedVersion.sections)
        ? (selectedVersion.sections as PortalPageSectionInstance[])
        : [],
    );
    setSections(safe);
    setChrome(
      sanitizePortalChrome(
        portalType,
        selectedVersion.chrome ??
          (parent?.config as { chrome?: PortalChromeConfig } | undefined)
            ?.chrome,
      ),
    );
    setVersionName(
      typeof selectedVersion.name === "string" ? selectedVersion.name : "",
    );
    setDirty(false);
    setSaveStatus("idle");
  }, [selectedVersion?._id, portalType]); // eslint-disable-line react-hooks/exhaustive-deps -- sync on version switch

  useEffect(() => {
    const welcome = parent?.config?.welcomeMessage;
    if (welcome !== undefined) {
      setWelcomeMessage(typeof welcome === "string" ? welcome : "");
    }
  }, [parent?._id, parent?.config?.welcomeMessage]);

  const markDirty = useCallback(() => {
    setDirty(true);
    setSaveStatus("dirty");
    setNotice(null);
  }, []);

  const patchSectionProps = useCallback(
    (instanceId: string, nextProps: PortalSectionProps) => {
      setSections((prev) =>
        prev.map((s) =>
          s.instanceId === instanceId ? { ...s, props: nextProps } : s,
        ),
      );
      markDirty();
    },
    [markDirty],
  );

  const setAllowMessaging = useCallback(
    async (next: boolean) => {
      if (!orgScope) return;
      try {
        await updateParentM({
          id: portalDefaultId,
          config: {
            ...(parent?.config ?? {}),
            allowMessaging: next,
          },
          memberUserKey: orgScope.memberUserKey,
        });
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not update messaging setting",
        );
      }
    },
    [orgScope, portalDefaultId, parent?.config, updateParentM],
  );

  const saveVersion = useCallback(async () => {
    if (!orgScope || !selectedVersionId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setSaveStatus("saving");
    try {
      const safeSections = sanitizePortalPageSections(portalType, sections);
      const safeChrome = sanitizePortalChrome(portalType, chrome);
      await updateVersionM({
        versionId: selectedVersionId,
        name: versionName.trim() || undefined,
        sections: safeSections,
        chrome: safeChrome,
        memberUserKey: orgScope.memberUserKey,
      });
      const prevWelcome = parent?.config?.welcomeMessage ?? "";
      if (welcomeMessage !== prevWelcome) {
        await updateParentM({
          id: portalDefaultId,
          config: {
            ...(parent?.config ?? {}),
            welcomeMessage,
          },
          memberUserKey: orgScope.memberUserKey,
        });
      }
      setSections(safeSections);
      setChrome(safeChrome);
      setDirty(false);
      setSaveStatus("saved");
      setNotice("Version saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaveStatus("dirty");
    } finally {
      setBusy(false);
    }
  }, [
    orgScope,
    selectedVersionId,
    versionName,
    sections,
    chrome,
    welcomeMessage,
    parent?.config,
    portalDefaultId,
    portalType,
    updateVersionM,
    updateParentM,
  ]);

  useEffect(() => {
    if (!dirty || mode === "preview" || !selectedVersionId || !orgScope) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void saveVersion();
    }, 1600);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [
    dirty,
    sections,
    chrome,
    versionName,
    welcomeMessage,
    mode,
    selectedVersionId,
    orgScope,
    saveVersion,
  ]);

  const promote = useCallback(async () => {
    if (!orgScope || !selectedVersionId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (dirty) {
        await updateVersionM({
          versionId: selectedVersionId,
          name: versionName.trim() || undefined,
          sections: sanitizePortalPageSections(portalType, sections),
          chrome: sanitizePortalChrome(portalType, chrome),
          memberUserKey: orgScope.memberUserKey,
        });
      }
      await promoteVersionM({
        versionId: selectedVersionId,
        memberUserKey: orgScope.memberUserKey,
      });
      setDirty(false);
      setSaveStatus("saved");
      setNotice("Published as default — assigned contacts will see this page");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Promote failed");
    } finally {
      setBusy(false);
    }
  }, [
    orgScope,
    selectedVersionId,
    dirty,
    versionName,
    sections,
    chrome,
    portalType,
    updateVersionM,
    promoteVersionM,
  ]);

  const duplicateVersion = useCallback(async () => {
    if (!orgScope) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const id = await createVersionM({
        portalDefaultId,
        fromVersionId: selectedVersionId ?? undefined,
        memberUserKey: orgScope.memberUserKey,
      });
      setSelectedVersionId(id);
      setNotice("New draft version created");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create version");
    } finally {
      setBusy(false);
    }
  }, [orgScope, portalDefaultId, selectedVersionId, createVersionM]);

  const addSection = useCallback(
    (sectionId: PortalPageSectionId, atIndex?: number) => {
      const next = makeSectionInstance(sectionId);
      setSections((prev) => {
        if (atIndex == null || atIndex < 0 || atIndex >= prev.length) {
          return [...prev, next];
        }
        const copy = [...prev];
        copy.splice(atIndex, 0, next);
        return copy;
      });
      setSelectedInstanceId(next.instanceId);
      markDirty();
    },
    [markDirty],
  );

  const removeSection = useCallback(
    (instanceId: string) => {
      setSections((prev) => prev.filter((s) => s.instanceId !== instanceId));
      setSelectedInstanceId((cur) => (cur === instanceId ? null : cur));
      markDirty();
    },
    [markDirty],
  );

  const setSectionColSpan = useCallback(
    (instanceId: string, colSpan: PortalSectionColSpan) => {
      setSections((prev) =>
        prev.map((s) =>
          s.instanceId === instanceId
            ? { ...s, layout: { ...s.layout, colSpan } }
            : s,
        ),
      );
      markDirty();
    },
    [markDirty],
  );

  const patchChrome = useCallback(
    (patch: Partial<PortalChromeConfig>) => {
      setChrome((prev) => sanitizePortalChrome(portalType, { ...prev, ...patch }));
      markDirty();
    },
    [markDirty, portalType],
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveDrag(parseDragId(event.active.id));
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null);
      if (mode === "preview") return;
      const { active, over } = event;
      if (!over) return;
      const from = parseDragId(active.id);
      if (!from) return;

      if (from.kind === "palette") {
        const overId = String(over.id);
        if (overId === CANVAS_DROP_ID) {
          addSection(from.sectionId);
          return;
        }
        const overIdx = sections.findIndex((s) => s.instanceId === overId);
        addSection(from.sectionId, overIdx >= 0 ? overIdx : undefined);
        return;
      }

      if (from.kind === "canvas") {
        const overId = String(over.id);
        if (overId === CANVAS_DROP_ID || overId === from.instanceId) return;
        setSections((prev) => {
          const oldIndex = prev.findIndex((s) => s.instanceId === from.instanceId);
          const newIndex = prev.findIndex((s) => s.instanceId === overId);
          if (oldIndex < 0 || newIndex < 0) return prev;
          markDirty();
          return arrayMove(prev, oldIndex, newIndex);
        });
      }
    },
    [mode, sections, addSection, markDirty],
  );

  const saveStatusLabel = (() => {
    if (saveStatus === "saving" || busy) return "Saving…";
    if (saveStatus === "saved" && !dirty) return "Saved";
    if (dirty || saveStatus === "dirty") return "Unsaved changes";
    return "Autosave on";
  })();

  if (!orgScope) {
    return (
      <p className="text-sm text-muted-foreground">
        Organization context is required.
      </p>
    );
  }

  if (parent === undefined || versions === undefined) {
    return <p className="text-sm text-muted-foreground">Loading builder…</p>;
  }

  if (parent === null) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Portal default not found.
      </p>
    );
  }

  const versionSelectValue =
    selectedVersionId &&
    versions.some((v) => v._id === selectedVersionId)
      ? selectedVersionId
      : versions[0]?._id ?? "";

  const overlayLabel =
    activeDrag?.kind === "palette"
      ? getPortalPageSectionDef(activeDrag.sectionId)?.label ?? "Section"
      : activeDrag?.kind === "canvas"
        ? getPortalPageSectionDef(
            sections.find((s) => s.instanceId === activeDrag.instanceId)
              ?.sectionId ?? "welcome",
          )?.label ?? "Section"
        : null;

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="portal-defaults-page-builder"
    >
      {/* Top chrome */}
      <header className="sticky top-0 z-20 -mx-4 border-b border-border bg-dlc-surface px-4 py-2 shadow-dlc-1 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/settings/portal-defaults"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-dlc-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {parent.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {PORTAL_DEFAULT_TYPE_LABELS[portalType]} · {saveStatusLabel}
            </p>
          </div>

          <div
            className="inline-flex rounded-dlc-md border border-border bg-background p-0.5"
            role="group"
            aria-label="Preview width"
          >
            <button
              type="button"
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-dlc-sm",
                previewWidth === "desktop"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
              aria-pressed={previewWidth === "desktop"}
              aria-label="Desktop preview"
              onClick={() => setPreviewWidth("desktop")}
            >
              <Monitor className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-dlc-sm",
                previewWidth === "mobile"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
              aria-pressed={previewWidth === "mobile"}
              aria-label="Mobile preview"
              onClick={() => setPreviewWidth("mobile")}
            >
              <Smartphone className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="flex min-h-10 items-center gap-1.5">
            <Label
              htmlFor="pd-view-as"
              className="sr-only sm:not-sr-only sm:text-[11px] sm:text-muted-foreground"
            >
              View as
            </Label>
            <Select
              id="pd-view-as"
              className="min-h-10 min-w-[8.5rem]"
              value={effectiveViewAs}
              onChange={(e) => {
                const next = e.currentTarget.value as PortalDefaultType;
                setViewAs(next);
                setPreviewRouteKey("dashboard");
                if (mode !== "preview") setMode("preview");
              }}
              data-testid="portal-builder-view-as"
              aria-label="View as portal audience"
            >
              {PORTAL_DEFAULT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PORTAL_DEFAULT_TYPE_LABELS[t]}
                  {t === portalType ? " (this template)" : ""}
                </option>
              ))}
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            className="min-h-10"
            onClick={() =>
              setMode((m) => (m === "edit" ? "preview" : "edit"))
            }
            data-testid="portal-builder-preview-toggle"
          >
            <Eye className="mr-1.5 h-4 w-4" aria-hidden />
            {mode === "preview" ? "Edit" : "Preview"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="min-h-10"
            onClick={() => setVersionsOpen((o) => !o)}
            data-testid="portal-builder-versions"
          >
            <LayoutTemplate className="mr-1.5 h-4 w-4" aria-hidden />
            Versions
          </Button>

          <Button
            type="button"
            variant="outline"
            className="min-h-10"
            disabled={busy || !selectedVersionId || !dirty}
            onClick={() => void saveVersion()}
            data-testid="portal-builder-save"
          >
            <Save className="mr-1.5 h-4 w-4" aria-hidden />
            Save
          </Button>

          <Button
            type="button"
            className="min-h-10"
            disabled={busy || !selectedVersionId}
            onClick={() => void promote()}
            data-testid="portal-builder-promote"
          >
            <Upload className="mr-1.5 h-4 w-4" aria-hidden />
            Set as default
          </Button>
        </div>

        {versionsOpen ? (
          <div className="mt-3 grid gap-3 rounded-dlc-md border border-border bg-dlc-surface-high p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div>
              <Label htmlFor="pd-version-select">Version</Label>
              <Select
                id="pd-version-select"
                className="mt-1.5 min-h-10"
                value={versionSelectValue}
                onChange={(e) => {
                  const next = e.currentTarget.value;
                  if (!next) return;
                  setSelectedVersionId(next as Id<"portalDefaultVersions">);
                }}
                disabled={busy || versions.length === 0}
              >
                {versions.length === 0 ? (
                  <option value="">No versions yet</option>
                ) : (
                  versions.map((v) => (
                    <option key={v._id} value={v._id}>
                      {v.name}
                      {v.isActive ? " (live default)" : ""}
                      {v.status === "draft" ? " · draft" : ""}
                    </option>
                  ))
                )}
              </Select>
            </div>
            <div>
              <Label htmlFor="pd-version-name">Version name</Label>
              <Input
                id="pd-version-name"
                className="mt-1.5 min-h-10"
                value={versionName}
                onChange={(e) => {
                  setVersionName(e.currentTarget.value);
                  markDirty();
                }}
                disabled={busy || mode === "preview"}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                className="min-h-10 w-full"
                disabled={busy}
                onClick={() => void duplicateVersion()}
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                New version
              </Button>
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="pd-welcome">Welcome message</Label>
              <textarea
                id="pd-welcome"
                className="mt-1.5 w-full rounded-dlc-md border border-border bg-background px-3 py-2 text-sm"
                rows={2}
                value={welcomeMessage}
                onChange={(e) => {
                  setWelcomeMessage(e.currentTarget.value);
                  markDirty();
                }}
                disabled={busy || mode === "preview"}
                placeholder="Shown in the Welcome section"
              />
            </div>
          </div>
        ) : null}
      </header>

      {error ? (
        <p
          className="rounded-dlc-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-dlc-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <CheckCircle2 className="mr-1.5 inline h-4 w-4" aria-hidden />
          {notice}
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div
          className={cn(
            "grid gap-4",
            mode === "edit"
              ? "lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]"
              : "grid-cols-1",
          )}
        >
          {mode === "edit" ? (
            <aside className="space-y-3 rounded-dlc-lg border border-border bg-dlc-surface p-3 sm:p-4">
              <div className="inline-flex w-full rounded-dlc-md border border-border bg-background p-0.5">
                <button
                  type="button"
                  className={cn(
                    "min-h-9 flex-1 rounded-dlc-sm text-xs font-medium",
                    paletteTab === "sections"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground",
                  )}
                  onClick={() => setPaletteTab("sections")}
                >
                  Sections
                </button>
                <button
                  type="button"
                  className={cn(
                    "min-h-9 flex-1 rounded-dlc-sm text-xs font-medium",
                    paletteTab === "chrome"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground",
                  )}
                  onClick={() => setPaletteTab("chrome")}
                >
                  Layout chrome
                </button>
              </div>

              {paletteTab === "sections" ? (
                <>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Sections
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Drag onto the canvas or click to add. Set width on each
                      card for multi-column grids.
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {palette.map((def) => {
                      const already = usedSectionIds.has(def.id);
                      return (
                        <li key={def.id}>
                          <PaletteCard
                            sectionId={def.id}
                            label={def.label}
                            description={def.description}
                            disabled={busy}
                            already={already}
                          />
                          {!already ? (
                            <button
                              type="button"
                              className="mt-1 w-full text-left text-[11px] text-primary underline"
                              disabled={busy}
                              onClick={() => addSection(def.id)}
                            >
                              Or click to add
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  {selectedInstance ? (
                    <PortalSectionConfigPanel
                      instance={selectedInstance}
                      disabled={busy}
                      allowMessaging={allowMessaging}
                      onAllowMessagingChange={(next) => {
                        void setAllowMessaging(next);
                      }}
                      onChange={(nextProps) =>
                        patchSectionProps(
                          selectedInstance.instanceId,
                          nextProps,
                        )
                      }
                    />
                  ) : (
                    <p className="rounded-dlc-md border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                      Click a section on the canvas to configure it (welcome
                      copy, status source, contact, chat, CTAs…).
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Sidebar &amp; header
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Customize partner-style chrome for this portal type.
                    </p>
                  </div>
                  <Label htmlFor="pd-brand">
                    Sidebar brand
                    <Input
                      id="pd-brand"
                      className="mt-1.5 min-h-10"
                      value={chrome.sidebar?.brandLabel ?? ""}
                      disabled={busy}
                      onChange={(e) => {
                        const brandLabel = e.currentTarget.value;
                        patchChrome({
                          sidebar: {
                            ...chrome.sidebar!,
                            items: chrome.sidebar?.items ?? [],
                            brandLabel,
                          },
                        });
                      }}
                    />
                  </Label>
                  <div className="grid gap-2">
                    {(
                      [
                        ["showWelcome", "Top welcome"],
                        ["showSearch", "Top search"],
                        ["showNotifications", "Notifications"],
                        ["showBreadcrumbs", "Breadcrumbs"],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className="inline-flex min-h-10 items-center gap-2 text-sm text-foreground"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border"
                          checked={Boolean(chrome.top?.[key])}
                          disabled={busy}
                          onChange={(e) =>
                            patchChrome({
                              top: {
                                ...chrome.top!,
                                [key]: e.target.checked,
                              },
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                    <label className="inline-flex min-h-10 items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={Boolean(chrome.layout?.showFab)}
                        disabled={busy}
                        onChange={(e) =>
                          patchChrome({
                            layout: {
                              ...chrome.layout!,
                              showFab: e.target.checked,
                            },
                          })
                        }
                      />
                      Floating action button
                    </label>
                  </div>
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Sidebar items
                    </p>
                    {(chrome.sidebar?.items ?? []).map((item, idx) => (
                      <div
                        key={item.id}
                        className="grid gap-1 rounded-dlc-md border border-border/70 p-2"
                      >
                        <Input
                          className="min-h-9 text-sm"
                          value={item.label}
                          disabled={busy}
                          onChange={(e) => {
                            const label = e.currentTarget.value;
                            const items = [...(chrome.sidebar?.items ?? [])];
                            items[idx] = { ...item, label };
                            patchChrome({
                              sidebar: { ...chrome.sidebar!, items },
                            });
                          }}
                        />
                        <div className="grid grid-cols-2 gap-1">
                          <Select
                            className="min-h-9 text-xs"
                            value={item.iconKey}
                            disabled={busy}
                            onChange={(e) => {
                              const iconKey = e.target
                                .value as PortalNavIconKey;
                              const items = [...(chrome.sidebar?.items ?? [])];
                              items[idx] = { ...item, iconKey };
                              patchChrome({
                                sidebar: { ...chrome.sidebar!, items },
                              });
                            }}
                          >
                            {PORTAL_NAV_ICON_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                          </Select>
                          <Select
                            className="min-h-9 text-xs"
                            value={item.routeKey}
                            disabled={busy}
                            onChange={(e) => {
                              const routeKey = e.target
                                .value as PortalNavRouteKey;
                              const items = [...(chrome.sidebar?.items ?? [])];
                              items[idx] = { ...item, routeKey };
                              patchChrome({
                                sidebar: { ...chrome.sidebar!, items },
                              });
                            }}
                          >
                            {PORTAL_NAV_ROUTE_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {PORTAL_NAV_ROUTE_LABELS[k]}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-8 text-destructive"
                          disabled={busy}
                          onClick={() => {
                            const items = (chrome.sidebar?.items ?? []).filter(
                              (x) => x.id !== item.id,
                            );
                            patchChrome({
                              sidebar: { ...chrome.sidebar!, items },
                            });
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-10 w-full"
                      disabled={busy}
                      onClick={() => {
                        const items = [
                          ...(chrome.sidebar?.items ?? []),
                          makePortalNavItem({
                            label: "New page",
                            iconKey: "layoutDashboard",
                            routeKey: "dashboard",
                            order: (chrome.sidebar?.items ?? []).length,
                          }),
                        ];
                        patchChrome({
                          sidebar: { ...chrome.sidebar!, items },
                        });
                      }}
                    >
                      <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                      Add sidebar item
                    </Button>
                  </div>
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Top tabs
                    </p>
                    {(chrome.top?.tabs ?? []).map((item, idx) => (
                      <div
                        key={item.id}
                        className="grid gap-1 rounded-dlc-md border border-border/70 p-2"
                      >
                        <Input
                          className="min-h-9 text-sm"
                          value={item.label}
                          disabled={busy}
                          onChange={(e) => {
                            const label = e.currentTarget.value;
                            const tabs = [...(chrome.top?.tabs ?? [])];
                            tabs[idx] = { ...item, label };
                            patchChrome({
                              top: { ...chrome.top!, tabs },
                            });
                          }}
                        />
                        <Select
                          className="min-h-9 text-xs"
                          value={item.routeKey}
                          disabled={busy}
                          onChange={(e) => {
                            const routeKey = e.target
                              .value as PortalNavRouteKey;
                            const tabs = [...(chrome.top?.tabs ?? [])];
                            tabs[idx] = { ...item, routeKey };
                            patchChrome({
                              top: { ...chrome.top!, tabs },
                            });
                          }}
                        >
                          {PORTAL_NAV_ROUTE_KEYS.map((k) => (
                            <option key={k} value={k}>
                              {PORTAL_NAV_ROUTE_LABELS[k]}
                            </option>
                          ))}
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-8 text-destructive"
                          disabled={busy}
                          onClick={() => {
                            const tabs = (chrome.top?.tabs ?? []).filter(
                              (x) => x.id !== item.id,
                            );
                            patchChrome({
                              top: { ...chrome.top!, tabs },
                            });
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-10 w-full"
                      disabled={busy}
                      onClick={() => {
                        const tabs = [
                          ...(chrome.top?.tabs ?? []),
                          makePortalNavItem({
                            label: "Overview",
                            iconKey: "layoutDashboard",
                            routeKey: "dashboard",
                            order: (chrome.top?.tabs ?? []).length,
                          }),
                        ];
                        patchChrome({
                          top: { ...chrome.top!, tabs },
                        });
                      }}
                    >
                      <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                      Add top tab
                    </Button>
                  </div>
                </div>
              )}
            </aside>
          ) : null}

          <div className="flex min-w-0 flex-col items-center">
            <div
              className={cn(
                "w-full transition-[max-width] duration-dlc-medium ease-dlc-standard",
                previewWidth === "mobile" ? "max-w-[390px]" : "max-w-5xl",
              )}
            >
              <p className="mb-2 text-center text-[11px] uppercase tracking-wide text-muted-foreground">
                {mode === "preview" ? "Preview" : "Canvas"} ·{" "}
                {previewWidth === "mobile" ? "Mobile" : "Desktop"}
                {mode === "preview"
                  ? ` · View as ${PORTAL_DEFAULT_TYPE_LABELS[effectiveViewAs]} · ${portalPreviewRouteLabel(previewRouteKey)}`
                  : null}
              </p>
              {mode === "preview" && interactivePreview.simulatingOther ? (
                <p
                  className="mb-2 rounded-dlc-md border border-amber-200/80 bg-amber-50 px-3 py-2 text-center text-xs text-amber-950"
                  role="status"
                >
                  Simulating {PORTAL_DEFAULT_TYPE_LABELS[effectiveViewAs]} soft
                  defaults — not this template&apos;s saved sections. Switch View
                  as back to {PORTAL_DEFAULT_TYPE_LABELS[portalType]} to test
                  your canvas.
                </p>
              ) : null}
              {mode === "preview" ? (
                <PortalPageComposition
                  sections={interactivePreview.sections}
                  chrome={interactivePreview.chrome}
                  context={previewContext}
                  preview
                  interactive
                  activeRouteKey={previewRouteKey}
                  onNavigate={(routeKey) => setPreviewRouteKey(routeKey)}
                />
              ) : (
                <CanvasDropZone isEmpty={sections.length === 0}>
                  {sections.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <h3 className="text-base font-semibold text-foreground">
                        Start building this portal page
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Drag premade sections from the left palette onto the
                        canvas, or add them with a click. Configure sidebar and
                        top header under Layout chrome.
                      </p>
                      {palette[0] ? (
                        <Button
                          type="button"
                          className="mt-4 min-h-10"
                          disabled={busy}
                          onClick={() => addSection(palette[0]!.id)}
                        >
                          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                          Add {palette[0]!.label}
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <SortableContext
                      items={sections.map((s) => s.instanceId)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="grid grid-cols-12 gap-3">
                        {sections.map((instance) => (
                          <li
                            key={instance.instanceId}
                            className={cn(
                              instance.layout?.colSpan === 3
                                ? "col-span-12 sm:col-span-6 lg:col-span-3"
                                : instance.layout?.colSpan === 4
                                  ? "col-span-12 sm:col-span-6 lg:col-span-4"
                                  : instance.layout?.colSpan === 6
                                    ? "col-span-12 lg:col-span-6"
                                    : instance.layout?.colSpan === 8
                                      ? "col-span-12 lg:col-span-8"
                                      : "col-span-12",
                            )}
                          >
                            <SortableCanvasSection
                              instance={instance}
                              previewMode={false}
                              disabled={busy}
                              selected={
                                selectedInstanceId === instance.instanceId
                              }
                              onSelect={() =>
                                setSelectedInstanceId(instance.instanceId)
                              }
                              onRemove={() =>
                                removeSection(instance.instanceId)
                              }
                              onColSpanChange={(colSpan) =>
                                setSectionColSpan(instance.instanceId, colSpan)
                              }
                              renderContext={previewContext}
                            />
                          </li>
                        ))}
                      </ul>
                    </SortableContext>
                  )}
                </CanvasDropZone>
              )}
            </div>
          </div>
        </div>

        <DragOverlay>
          {overlayLabel ? (
            <div className="rounded-dlc-md border border-primary/40 bg-dlc-surface-high px-3 py-2 text-sm font-medium shadow-dlc-3">
              {overlayLabel}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
