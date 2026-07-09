"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { hubDetailStyles } from "@/components/contacts/hub/hubDetailStyles";

export type HubDetailTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export type HubDetailTabsProps = {
  tabs: HubDetailTab[];
  defaultTabId?: string;
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
  panelRef?: RefObject<HTMLDivElement>;
  /** When true, tab panel gets an independent scrollport (command center / registry profile). */
  scrollablePanel?: boolean;
  "data-testid"?: string;
};

export function HubDetailTabs({
  tabs,
  defaultTabId,
  activeTabId: controlledTabId,
  onTabChange,
  className,
  panelRef,
  scrollablePanel = false,
  "data-testid": testId = "hub-detail-tabs",
}: HubDetailTabsProps) {
  const [internalTabId, setInternalTabId] = useState(
    defaultTabId ?? tabs[0]?.id ?? "",
  );

  const activeId = controlledTabId ?? internalTabId;
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  useEffect(() => {
    if (controlledTabId) {
      setInternalTabId(controlledTabId);
    }
  }, [controlledTabId]);

  const setActive = (id: string) => {
    if (!controlledTabId) {
      setInternalTabId(id);
    }
    onTabChange?.(id);
  };

  if (tabs.length === 0) return null;

  return (
    <div className={cn(hubDetailStyles.opsCard, className)} data-testid={testId}>
      <div
        className={hubDetailStyles.tabList}
        role="tablist"
        aria-label="Contact hub sections"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active?.id === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            className={hubDetailStyles.tabButton(active?.id === tab.id)}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        ref={panelRef}
        key={active?.id}
        id={active ? `tabpanel-${active.id}` : undefined}
        role="tabpanel"
        aria-labelledby={active ? `tab-${active.id}` : undefined}
        className={
          scrollablePanel
            ? hubDetailStyles.tabPanelScrollable
            : hubDetailStyles.tabPanel
        }
        data-nested-scroll={scrollablePanel ? true : undefined}
      >
        {active?.content}
      </div>
    </div>
  );
}
