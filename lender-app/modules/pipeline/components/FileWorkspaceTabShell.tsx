"use client";

import { useState, type ReactNode } from "react";
import { PREMIUM_WORKSPACE_CONTAINER_CLASS } from "@/components/WorkspaceContentContainer";
import { hubDetailStyles } from "@/components/contacts/hub/hubDetailStyles";
import { cn } from "@/lib/cn";

/** Phase 4 + Stage 2 — five-tab Deal Command Center shell. */
export const FILE_WORKSPACE_COMMAND_CENTER_TAB_IDS = [
  "dealInfo",
  "financials",
  "portalsProgress",
  "documents",
  "formsApplications",
] as const;

export type FileWorkspaceCommandCenterTabId =
  (typeof FILE_WORKSPACE_COMMAND_CENTER_TAB_IDS)[number];

/** Legacy tab ids — routable but not shown in the tab bar. */
export const FILE_WORKSPACE_LEGACY_TAB_IDS = [
  "overview",
  "dealWorkspace",
  "clientPortal",
  "underwriting",
  "tasksConditions",
  "settings",
] as const;

export type FileWorkspaceLegacyTabId =
  (typeof FILE_WORKSPACE_LEGACY_TAB_IDS)[number];

export type FileWorkspaceTabId =
  | FileWorkspaceCommandCenterTabId
  | FileWorkspaceLegacyTabId;

/** @deprecated Use FILE_WORKSPACE_COMMAND_CENTER_TAB_IDS for nav. */
export const FILE_WORKSPACE_TAB_IDS = FILE_WORKSPACE_COMMAND_CENTER_TAB_IDS;

export const FILE_WORKSPACE_TAB_LABELS: Record<
  FileWorkspaceCommandCenterTabId,
  string
> = {
  dealInfo: "Deal Info",
  financials: "Financials",
  portalsProgress: "Portals & Progress",
  documents: "Documents",
  formsApplications: "Forms & Applications",
};
const TAB_LABELS = FILE_WORKSPACE_TAB_LABELS;

export function normalizeFileWorkspaceTab(
  tab: string,
): FileWorkspaceTabId | null {
  const all: readonly string[] = [
    ...FILE_WORKSPACE_COMMAND_CENTER_TAB_IDS,
    ...FILE_WORKSPACE_LEGACY_TAB_IDS,
  ];
  if (!all.includes(tab)) return null;

  const legacyMap: Partial<Record<FileWorkspaceLegacyTabId, FileWorkspaceTabId>> =
    {
      overview: "dealInfo",
      dealWorkspace: "financials",
      clientPortal: "portalsProgress",
      underwriting: "portalsProgress",
      tasksConditions: "portalsProgress",
    };

  if (tab in legacyMap) {
    return legacyMap[tab as FileWorkspaceLegacyTabId] ?? null;
  }
  return tab as FileWorkspaceTabId;
}

function TabPlaceholder({ tabId }: { tabId: FileWorkspaceTabId }) {
  const label =
    tabId in TAB_LABELS
      ? TAB_LABELS[tabId as FileWorkspaceCommandCenterTabId]
      : tabId;
  return (
    <div
      className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800"
      data-testid={`pipeline-tab-placeholder-${tabId}`}
    >
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-xs text-slate-500">Tab content loading…</p>
    </div>
  );
}

export type FileWorkspaceTabShellProps = {
  activeTab?: FileWorkspaceTabId;
  onActiveTabChange?: (tab: FileWorkspaceTabId) => void;
  dealInfoPanel?: ReactNode;
  financialsPanel?: ReactNode;
  portalsProgressPanel?: ReactNode;
  documentsPanel?: ReactNode;
  formsApplicationsPanel?: ReactNode;
  /** Overflow-only — not shown in tab bar. */
  settingsPanel?: ReactNode;
  /** @deprecated Phase 4 — use portalsProgressPanel */
  tasksConditionsPanel?: ReactNode;
  /** @deprecated Phase 4 — use dealInfoPanel */
  overviewPanel?: ReactNode;
  /** @deprecated Phase 4 — use financialsPanel */
  dealWorkspacePanel?: ReactNode;
  /** @deprecated Phase 4 — folded into portalsProgressPanel */
  clientPortalPanel?: ReactNode;
  /** @deprecated Phase 4 — folded into portalsProgressPanel */
  underwritingLedgerPanel?: ReactNode;
  /**
   * `pinned` — nav rendered by `PipelineFileWorkspaceShell` above scroll (default file route).
   * `inline` — nav + panel share one tall parent inside the scrollport (embedded).
   */
  navPlacement?: "pinned" | "inline";
  className?: string;
};

export function navHighlightTabFor(
  activeTab: FileWorkspaceTabId,
): FileWorkspaceCommandCenterTabId {
  if (activeTab === "dealInfo" || activeTab === "overview") return "dealInfo";
  if (activeTab === "financials" || activeTab === "dealWorkspace") {
    return "financials";
  }
  if (activeTab === "documents") return "documents";
  if (activeTab === "formsApplications") return "formsApplications";
  if (activeTab === "settings") return "dealInfo";
  return "portalsProgress";
}

const TAB_NAV_SURFACE_CLASS = cn(
  "w-full border-b border-slate-200 bg-white shadow-sm",
  "dark:border-slate-700 dark:bg-dlc-surface-high",
  "[will-change:transform]",
);

/**
 * Pinned above workspace blocks — below overlays (`INSPECTOR` / `MODAL` tokens).
 * Do not use arbitrary z-[1000]; it caused favorites slide-overs to render under tabs.
 */
const TAB_NAV_PINNED_CLASS = cn(
  "relative z-[var(--dlc-z-header,20)] shrink-0",
  TAB_NAV_SURFACE_CLASS,
);

/**
 * Sticky fallback for embedded routes — parent MUST wrap nav + panel (tall ancestor).
 * `overflow-x-auto` is scoped to the tablist row only (does not break vertical sticky).
 */
const TAB_NAV_INLINE_STICKY_CLASS = cn(
  "sticky top-0 z-[var(--dlc-z-header,20)]",
  TAB_NAV_SURFACE_CLASS,
);

export type FileWorkspaceTabNavProps = {
  activeTab: FileWorkspaceTabId;
  onActiveTabChange: (tab: FileWorkspaceTabId) => void;
  placement?: "pinned" | "inline";
  className?: string;
  /** Optional attention indicators per tab (e.g. pending client uploads). */
  tabIndicators?: Partial<
    Record<FileWorkspaceTabId, { showDot?: boolean; count?: number }>
  >;
};

export function FileWorkspaceTabNav({
  activeTab,
  onActiveTabChange,
  placement = "pinned",
  className,
  tabIndicators,
}: FileWorkspaceTabNavProps) {
  const navHighlightTab = navHighlightTabFor(activeTab);

  return (
    <nav
      aria-label="Deal workspace sections"
      className={cn(
        placement === "inline" ? TAB_NAV_INLINE_STICKY_CLASS : TAB_NAV_PINNED_CLASS,
        className,
      )}
      data-testid="pipeline-file-workspace-tab-nav"
      data-tab-nav-placement={placement}
    >
      <div className={PREMIUM_WORKSPACE_CONTAINER_CLASS}>
        <div
          className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
          data-testid="pipeline-file-workspace-tab-nav-scroll"
        >
          <div
            className={cn(
              hubDetailStyles.tabList,
              "w-max min-w-full flex-nowrap sm:w-full sm:flex-wrap",
            )}
            role="tablist"
          >
            {FILE_WORKSPACE_COMMAND_CENTER_TAB_IDS.map((tabId) => {
              const selected = navHighlightTab === tabId;
              const indicator = tabIndicators?.[tabId];
              return (
                <button
                  key={tabId}
                  type="button"
                  role="tab"
                  id={`pipeline-file-tab-${tabId}`}
                  aria-selected={selected}
                  aria-controls={`pipeline-file-tabpanel-${tabId}`}
                  data-testid={`pipeline-file-tab-${tabId}`}
                  onClick={() => onActiveTabChange(tabId)}
                  className={cn(
                    hubDetailStyles.tabButton(selected),
                    "relative min-h-9 shrink-0 whitespace-nowrap sm:flex-1 sm:shrink",
                  )}
                >
                  {TAB_LABELS[tabId]}
                  {indicator?.showDot ? (
                    <span
                      className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500"
                      aria-label={
                        indicator.count
                          ? `${indicator.count} items need review`
                          : "Needs review"
                      }
                      data-testid={`pipeline-file-tab-dot-${tabId}`}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}

export type FileWorkspaceTabPanelProps = Pick<
  FileWorkspaceTabShellProps,
  | "activeTab"
  | "dealInfoPanel"
  | "financialsPanel"
  | "portalsProgressPanel"
  | "documentsPanel"
  | "formsApplicationsPanel"
  | "settingsPanel"
  | "tasksConditionsPanel"
  | "overviewPanel"
  | "dealWorkspacePanel"
  | "clientPortalPanel"
  | "underwritingLedgerPanel"
  | "className"
>;

export function FileWorkspaceTabPanel({
  activeTab = "dealInfo",
  dealInfoPanel,
  financialsPanel,
  portalsProgressPanel,
  documentsPanel,
  formsApplicationsPanel,
  settingsPanel,
  tasksConditionsPanel,
  overviewPanel,
  dealWorkspacePanel,
  clientPortalPanel,
  underwritingLedgerPanel,
  className,
}: FileWorkspaceTabPanelProps) {
  const resolvedPortalsPanel =
    portalsProgressPanel ??
    tasksConditionsPanel ??
    clientPortalPanel ??
    overviewPanel;

  const resolvedFinancialsPanel =
    financialsPanel ?? dealWorkspacePanel;

  const panelContent = (() => {
    switch (activeTab) {
      case "dealInfo":
      case "overview":
        return dealInfoPanel ?? <TabPlaceholder tabId="dealInfo" />;
      case "financials":
      case "dealWorkspace":
        return resolvedFinancialsPanel ?? <TabPlaceholder tabId="financials" />;
      case "portalsProgress":
      case "tasksConditions":
      case "clientPortal":
      case "underwriting":
        return (
          resolvedPortalsPanel ??
          underwritingLedgerPanel ?? (
            <TabPlaceholder tabId="portalsProgress" />
          )
        );
      case "documents":
        return documentsPanel ?? <TabPlaceholder tabId="documents" />;
      case "formsApplications":
        return (
          formsApplicationsPanel ?? (
            <TabPlaceholder tabId="formsApplications" />
          )
        );
      case "settings":
        return settingsPanel ?? <TabPlaceholder tabId="settings" />;
      default:
        return <TabPlaceholder tabId={activeTab} />;
    }
  })();

  const navHighlightTab = navHighlightTabFor(activeTab);

  return (
    <div
      id={`pipeline-file-tabpanel-${navHighlightTab}`}
      role="tabpanel"
      aria-labelledby={`pipeline-file-tab-${navHighlightTab}`}
      className={cn("min-w-0", PREMIUM_WORKSPACE_CONTAINER_CLASS, className)}
      data-testid={`pipeline-file-tabpanel-${navHighlightTab}`}
      data-workspace-layout="constrained"
      data-active-tab={activeTab}
    >
      {panelContent}
    </div>
  );
}

export function FileWorkspaceTabShell({
  activeTab: controlledTab,
  onActiveTabChange,
  navPlacement = "pinned",
  className,
  ...panelProps
}: FileWorkspaceTabShellProps) {
  const [internalTab, setInternalTab] =
    useState<FileWorkspaceTabId>("dealInfo");
  const activeTab = controlledTab ?? internalTab;

  const setActiveTab = (tab: FileWorkspaceTabId) => {
    if (controlledTab === undefined) {
      setInternalTab(tab);
    }
    onActiveTabChange?.(tab);
  };

  const showInlineNav = navPlacement === "inline";

  return (
    <div
      data-testid="pipeline-file-workspace-tab-shell"
      className={cn("min-w-0 w-full", className)}
    >
      {showInlineNav ? (
        <FileWorkspaceTabNav
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          placement="inline"
        />
      ) : null}
      <FileWorkspaceTabPanel activeTab={activeTab} {...panelProps} />
    </div>
  );
}
