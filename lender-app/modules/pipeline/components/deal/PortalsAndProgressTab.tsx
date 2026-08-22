"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { Settings2 } from "lucide-react";
import { UnderwritingLedgerTab } from "@/components/pipeline/tabs/UnderwritingLedgerTab";
import {
  ClientPortalTab,
  type RegisterClientPortalSections,
} from "@/components/pipeline/tabs/ClientPortalTab";
import type { RegisterUnderwritingSections } from "@/components/pipeline/tabs/UnderwritingLedgerTab";
import { DealWorkspaceScenariosSection } from "@/components/pipeline/deal/DealWorkspaceScenariosSection";
import { FileContactPortalDefaultsSection } from "@/components/pipeline/deal/FileContactPortalDefaultsSection";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import {
  SortableSectionItem,
  SortableSectionList,
} from "@/components/pipeline/workspace/SortableSectionList";
import { cn } from "@/lib/cn";
import {
  parseClientPortalTabLayoutFromUnknown,
} from "@/lib/file/clientPortalTabLayout";
import {
  isPortalsProgressSectionVisible,
  normalizePortalsProgressSectionOrder,
  parsePortalsProgressTabLayoutFromUnknown,
  PORTALS_PROGRESS_CORE_SECTION_IDS,
  PORTALS_PROGRESS_SECTION_IDS,
  PORTALS_PROGRESS_SECTION_LABELS,
  resetPortalsProgressTabLayout,
  syncClientPortalLayoutFromPortalsProgress,
  togglePortalsProgressSectionHidden,
  type PortalsProgressSectionId,
} from "@/lib/file/portalsProgressTabLayout";
import {
  DealWorkspaceSaveStatus,
  useDealWorkspaceEditor,
} from "@/lib/file/useDealWorkspaceEditor";
import {
  premiumSectionStackClass,
  premiumWorkspaceCanvasClass,
} from "@/lib/pipeline/premiumWorkspaceUi";
import type { Id } from "@/convex/_generated/dataModel";

export type PortalsAndProgressTabProps = {
  className?: string;
  underwriting: {
    fileId: Id<"pipeline">;
    memberUserKey?: string;
  };
  clientPortal?: React.ComponentProps<typeof ClientPortalTab>;
};

type SectionRenderer = (dragHandle: ReactNode) => ReactNode;
type SectionRegistrySlice = Partial<
  Record<PortalsProgressSectionId, SectionRenderer>
>;

function LayoutToggle({
  testId,
  label,
  visible,
  onToggle,
}: {
  testId: string;
  label: string;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={visible}
      data-testid={testId}
      className={cn(
        "flex w-full min-h-10 items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground",
        "transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
      )}
      onClick={onToggle}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-dlc-sm border border-border",
          visible && "border-primary bg-primary text-primary-foreground",
        )}
        aria-hidden
      >
        {visible ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6l3 3 5-5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      <span className="min-w-0">{label}</span>
    </button>
  );
}

function commitRegistrySlice(
  ref: React.MutableRefObject<SectionRegistrySlice>,
  sigRef: React.MutableRefObject<string>,
  sections: SectionRegistrySlice,
  contentSig: string,
): boolean {
  ref.current = sections;
  const sig = `${Object.keys(sections).sort().join(",")}|${contentSig}`;
  if (sigRef.current === sig) return false;
  sigRef.current = sig;
  return true;
}

/** Portals & Progress — unified DnD canvas for all tab blocks. */
export function PortalsAndProgressTab({
  className,
  underwriting,
  clientPortal,
}: PortalsAndProgressTabProps) {
  const {
    draft,
    saving,
    savedAt,
    isDirty,
    patchPortalsProgressTabLayout,
    patchClientPortalTabLayout,
  } = useDealWorkspaceEditor();

  const clientPortalLayout = useMemo(
    () => parseClientPortalTabLayoutFromUnknown(draft?.clientPortalTabLayout),
    [draft?.clientPortalTabLayout],
  );

  const portalsLayout = useMemo(
    () =>
      parsePortalsProgressTabLayoutFromUnknown(draft?.portalsProgressTabLayout, {
        clientPortalOrder: clientPortalLayout.order,
        clientPortalHidden: clientPortalLayout.hidden,
      }),
    [
      clientPortalLayout.hidden,
      clientPortalLayout.order,
      draft?.portalsProgressTabLayout,
    ],
  );

  const underwritingRef = useRef<SectionRegistrySlice>({});
  const clientPortalRef = useRef<SectionRegistrySlice>({});
  const underwritingSigRef = useRef("");
  const clientPortalSigRef = useRef("");
  const [registryGeneration, setRegistryGeneration] = useState(0);
  const [dataRevision, setDataRevision] = useState(0);

  const bumpRegistry = useCallback(() => {
    setRegistryGeneration((g) => g + 1);
  }, []);

  const bumpData = useCallback(() => {
    setDataRevision((n) => n + 1);
  }, []);

  const registerUnderwritingSections = useCallback<RegisterUnderwritingSections>(
    (sections, contentSig = "") => {
      const mapped: SectionRegistrySlice = {};
      for (const [id, renderer] of Object.entries(sections)) {
        if (renderer) mapped[id as PortalsProgressSectionId] = renderer;
      }
      if (
        commitRegistrySlice(
          underwritingRef,
          underwritingSigRef,
          mapped,
          contentSig,
        )
      ) {
        bumpRegistry();
      } else {
        underwritingRef.current = mapped;
        bumpData();
      }
    },
    [bumpData, bumpRegistry],
  );

  const registerClientPortalSections = useCallback<RegisterClientPortalSections>(
    (sections, contentSig = "") => {
      const mapped: SectionRegistrySlice = {};
      for (const [id, renderer] of Object.entries(sections)) {
        if (renderer) mapped[id as PortalsProgressSectionId] = renderer;
      }
      if (
        commitRegistrySlice(
          clientPortalRef,
          clientPortalSigRef,
          mapped,
          contentSig,
        )
      ) {
        bumpRegistry();
      } else {
        clientPortalRef.current = mapped;
        bumpData();
      }
    },
    [bumpData, bumpRegistry],
  );

  const availableSectionIds = useMemo(() => {
    if (clientPortal) return PORTALS_PROGRESS_SECTION_IDS;
    return PORTALS_PROGRESS_CORE_SECTION_IDS;
  }, [clientPortal]);

  const registeredSectionIds = useMemo(() => {
    void registryGeneration;
    const ids = new Set<PortalsProgressSectionId>([
      "scenariosLenderMatch",
      "contactPortalDefaults",
    ]);
    for (const id of Object.keys(
      underwritingRef.current,
    ) as PortalsProgressSectionId[]) {
      ids.add(id);
    }
    for (const id of Object.keys(
      clientPortalRef.current,
    ) as PortalsProgressSectionId[]) {
      ids.add(id);
    }
    return ids;
  }, [registryGeneration]);

  const visibleSectionIds = useMemo(
    () =>
      portalsLayout.order.filter(
        (id) =>
          availableSectionIds.includes(id) &&
          isPortalsProgressSectionVisible(portalsLayout, id) &&
          registeredSectionIds.has(id),
      ),
    [availableSectionIds, portalsLayout, registeredSectionIds],
  );

  const persistLayout = useCallback(
    (next: typeof portalsLayout) => {
      patchPortalsProgressTabLayout(() => next);
      patchClientPortalTabLayout((prev) =>
        syncClientPortalLayoutFromPortalsProgress(prev, next),
      );
    },
    [patchClientPortalTabLayout, patchPortalsProgressTabLayout],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id) as PortalsProgressSectionId;
      const overId = String(over.id) as PortalsProgressSectionId;
      if (
        !availableSectionIds.includes(activeId) ||
        !availableSectionIds.includes(overId)
      ) {
        return;
      }

      const oldIndex = portalsLayout.order.indexOf(activeId);
      const newIndex = portalsLayout.order.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) return;

      persistLayout({
        ...portalsLayout,
        order: normalizePortalsProgressSectionOrder(
          arrayMove(portalsLayout.order, oldIndex, newIndex),
        ),
      });
    },
    [availableSectionIds, persistLayout, portalsLayout],
  );

  const onToggleSectionVisibility = useCallback(
    (sectionId: PortalsProgressSectionId) => {
      persistLayout(togglePortalsProgressSectionHidden(portalsLayout, sectionId));
    },
    [persistLayout, portalsLayout],
  );

  const onResetLayout = useCallback(() => {
    persistLayout(resetPortalsProgressTabLayout());
  }, [persistLayout]);

  const renderSection = useCallback(
    (sectionId: PortalsProgressSectionId, dragHandle: ReactNode) => {
      void registryGeneration;
      void dataRevision;

      if (sectionId === "scenariosLenderMatch") {
        return <DealWorkspaceScenariosSection headerRight={dragHandle} />;
      }
      if (sectionId === "contactPortalDefaults") {
        return (
          <FileContactPortalDefaultsSection
            fileId={underwriting.fileId}
            memberUserKey={underwriting.memberUserKey}
            headerRight={dragHandle}
          />
        );
      }

      const underwritingRenderer = underwritingRef.current[sectionId];
      if (underwritingRenderer) return underwritingRenderer(dragHandle);

      const portalRenderer = clientPortalRef.current[sectionId];
      if (portalRenderer) return portalRenderer(dragHandle);

      return null;
    },
    [
      dataRevision,
      registryGeneration,
      underwriting.fileId,
      underwriting.memberUserKey,
    ],
  );

  return (
    <div
      className={cn(
        premiumWorkspaceCanvasClass,
        "flex min-w-0 flex-col",
        premiumSectionStackClass,
        className,
      )}
      data-testid="pipeline-portals-progress-tab"
    >
      <div
        className="flex min-w-0 flex-wrap items-center justify-end gap-2 px-0.5"
        data-testid="pipeline-portals-progress-toolbar"
      >
        <DropdownMenu
          aria-label="Portals & Progress block visibility and layout"
          align="start"
          className="min-w-[14rem]"
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 p-0 text-muted-foreground"
              data-testid="pipeline-portals-progress-layout-control"
              aria-label="Portals & Progress block visibility and layout"
            >
              <Settings2 className="h-4 w-4" aria-hidden />
            </Button>
          }
        >
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Block visibility
          </div>
          <DropdownMenuSeparator />
          {availableSectionIds.map((sectionId) => (
            <LayoutToggle
              key={sectionId}
              testId={`pipeline-portals-progress-layout-toggle-${sectionId}`}
              label={PORTALS_PROGRESS_SECTION_LABELS[sectionId]}
              visible={isPortalsProgressSectionVisible(portalsLayout, sectionId)}
              onToggle={() => onToggleSectionVisibility(sectionId)}
            />
          ))}
          <DropdownMenuSeparator />
          <button
            type="button"
            role="menuitem"
            data-testid="pipeline-portals-progress-layout-reset"
            className={cn(
              "flex w-full min-h-10 items-center px-3 py-2 text-left text-sm text-foreground",
              "transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
            )}
            onClick={onResetLayout}
          >
            Reset to defaults
          </button>
        </DropdownMenu>
        <DealWorkspaceSaveStatus
          saving={saving}
          savedAt={savedAt}
          isDirty={isDirty}
        />
      </div>

      {/* Section providers — register renderers; no competing DnD contexts. */}
      <div className="sr-only" aria-hidden>
        <UnderwritingLedgerTab
          fileId={underwriting.fileId}
          memberUserKey={underwriting.memberUserKey}
          suppressInternalDnd
          onRegisterSections={registerUnderwritingSections}
        />
        {clientPortal ? (
          <ClientPortalTab
            {...clientPortal}
            embedded
            suppressInternalDnd
            onRegisterSections={registerClientPortalSections}
          />
        ) : null}
      </div>

      <SortableSectionList itemIds={visibleSectionIds} onDragEnd={onDragEnd}>
        <div
          className={premiumSectionStackClass}
          data-testid="pipeline-portals-unified-sections"
          aria-label="Portals and progress blocks"
        >
          {visibleSectionIds.map((sectionId) => (
            <SortableSectionItem key={sectionId} id={sectionId}>
              {(dragHandle) => renderSection(sectionId, dragHandle)}
            </SortableSectionItem>
          ))}
        </div>
      </SortableSectionList>

      {visibleSectionIds.length === 0 ? (
        <p
          className="rounded-dlc-md border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground"
          data-testid="pipeline-portals-progress-empty"
        >
          All blocks are hidden. Use the layout menu to show sections, or reset
          to defaults.
        </p>
      ) : null}
    </div>
  );
}
