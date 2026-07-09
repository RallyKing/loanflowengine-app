"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Upload, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { AddLenderForm } from "@/components/AddLenderForm";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { CsvUploader } from "@/components/CsvUploader";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { SearchField } from "@/components/ui/SearchField";
import { parseLenderWorkspaceTab } from "@/lib/lendersWorkspace";
import { BrowsePageClient } from "@/components/browse/BrowsePageClient";
import { useAuth } from "@/lib/sessionUiClient";
import { settingsHref } from "@/lib/settingsRegistry";
import { GlobalTenantSwitcher } from "@/components/system-admin/GlobalTenantSwitcher";

const ScenarioSearch = dynamic(
  () =>
    import("@/components/ScenarioSearch").then((m) => ({
      default: m.ScenarioSearch,
    })),
  {
    loading: () => (
      <div
        className="flex flex-col items-start gap-2 py-4"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span
          className="inline-block h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground/20 border-t-primary motion-safe:animate-spin"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">Loading scenario search…</p>
      </div>
    ),
  }
);

const DiscoverLenders = dynamic(
  () =>
    import("@/components/DiscoverLenders").then((m) => ({
      default: m.DiscoverLenders,
    })),
  {
    loading: () => (
      <div
        className="flex flex-col items-start gap-2 py-4"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span
          className="inline-block h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground/20 border-t-primary motion-safe:animate-spin"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">Loading discovery…</p>
      </div>
    ),
  }
);

type SearchMode = "quick" | "scenario";

function sectionTitle(text: string) {
  return (
    <span className="text-sm font-semibold normal-case text-foreground">{text}</span>
  );
}

function scrollToEl(el: HTMLElement | null) {
  if (!el) return;
  window.setTimeout(() => {
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 80);
}

export function LendersWorkspaceClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isGlobalAdmin } = useAuth();
  const tabParam = searchParams.get("tab");
  const tab = useMemo(
    () => parseLenderWorkspaceTab(tabParam),
    [tabParam]
  );

  const lenderDeepLinkId = useMemo((): Id<"lenders"> | null => {
    const raw = searchParams.get("lender")?.trim();
    if (!raw) return null;
    return raw as Id<"lenders">;
  }, [searchParams]);

  const scenarioRef = useRef<HTMLDivElement>(null);
  const addSectionRef = useRef<HTMLDivElement>(null);
  const uploadSectionRef = useRef<HTMLDivElement>(null);

  const [searchMode, setSearchMode] = useState<SearchMode>("quick");
  const [quickSearch, setQuickSearch] = useState("");

  useEffect(() => {
    if (!tabParam) return;
    if (parseLenderWorkspaceTab(tabParam) !== tabParam) {
      router.replace("/lenders");
    }
  }, [router, tabParam]);

  useEffect(() => {
    if (searchMode !== "scenario") return;
    scrollToEl(scenarioRef.current);
  }, [searchMode]);

  useEffect(() => {
    if (tab === "scenario") scrollToEl(scenarioRef.current);
  }, [tab]);

  useEffect(() => {
    if (tab === "add") scrollToEl(addSectionRef.current);
  }, [tab]);

  useEffect(() => {
    if (tab === "upload") scrollToEl(uploadSectionRef.current);
  }, [tab]);

  const discoverDefaultOpen = tab === "discover";
  const addDefaultOpen = tab === "add";
  const uploadDefaultOpen = tab === "upload";

  const [discoverOpen, setDiscoverOpen] = useState(discoverDefaultOpen);
  const [discoverMounted, setDiscoverMounted] = useState(discoverDefaultOpen);
  const onDiscoverOpenChange = useCallback((open: boolean) => {
    setDiscoverOpen(open);
    if (open) setDiscoverMounted(true);
  }, []);

  useEffect(() => {
    setDiscoverOpen(discoverDefaultOpen);
    if (discoverDefaultOpen) setDiscoverMounted(true);
  }, [discoverDefaultOpen]);

  const openAdd = useCallback(() => {
    router.replace("/lenders?tab=add", { scroll: false });
  }, [router]);

  const openUpload = useCallback(() => {
    router.replace("/lenders?tab=upload", { scroll: false });
  }, [router]);

  const jumpToScenario = useCallback(() => {
    scrollToEl(scenarioRef.current);
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Lenders</h1>
        <p className="text-sm text-muted-foreground">
          Search the table or run a deal scenario, then browse results. AI discovery
          and CSV tools stay below.
        </p>
        {isGlobalAdmin ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm">
            <p className="font-medium text-foreground">System admin</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Switch the active tenant for GodMode access. Full details in{" "}
              <Link href={settingsHref("systemAdmin")} className="underline">
                Settings → System admin
              </Link>
              .
            </p>
            <div className="mt-3 max-w-md">
              <GlobalTenantSwitcher />
            </div>
          </div>
        ) : null}
      </div>

      <div
        className="sticky top-0 z-10 rounded-xl border border-border/80 bg-background/90 px-3 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4"
        role="region"
        aria-label="Lenders workspace toolbar"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
              <Label htmlFor="lenders-search-mode" className="sr-only">
                Search type
              </Label>
              <Select
                id="lenders-search-mode"
                className="w-full min-w-0 sm:w-[13.5rem]"
                value={searchMode}
                onChange={(e) =>
                  setSearchMode(e.target.value as SearchMode)
                }
              >
                <option value="quick">Quick search (table)</option>
                <option value="scenario">Scenario search</option>
              </Select>
            </div>
            {searchMode === "quick" ? (
              <SearchField
                id="lenders-quick-search"
                containerClassName="w-full flex-1 sm:max-w-xl"
                placeholder="Name, company, or keyword…"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                aria-label="Search lenders by name or keyword"
              />
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground sm:max-w-md">
                Match lenders to a full deal profile in the section below.{" "}
                <button
                  type="button"
                  className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                  onClick={jumpToScenario}
                >
                  Jump to scenario
                </button>
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={openAdd}>
              <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
              Add lender
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={openUpload}>
              <Upload className="h-4 w-4 shrink-0" aria-hidden />
              Upload CSV
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div ref={scenarioRef}>
          <CollapsibleSection
            variant="card"
            defaultOpen
            animated
            title={sectionTitle("Scenario search")}
            description="Deal amount, funding type, state, FICO — ranked matches with explanations and flags."
            contentClassName="pt-1"
          >
            <ScenarioSearch />
          </CollapsibleSection>
        </div>

        <CollapsibleSection
          variant="card"
          open={discoverOpen}
          onOpenChange={onDiscoverOpenChange}
          animated
          title={sectionTitle("Discover (AI)")}
          description="Web search + AI for niches you describe; add candidates and skip duplicates."
          contentClassName="pt-1"
        >
          {discoverMounted ? (
            <DiscoverLenders />
          ) : (
            <p className="text-sm text-muted-foreground">
              Expand this section to load AI discovery (saves work while collapsed).
            </p>
          )}
        </CollapsibleSection>

        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-card">
          <div className="border-b border-border/70 bg-muted/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Lender results</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Filters and actions below — search text is synced from the bar when
              Quick search is selected.
            </p>
          </div>
          <div className="p-4 pt-3">
            <BrowsePageClient
              embedded
              quickSearch={quickSearch}
              onQuickSearchChange={setQuickSearch}
              hideQuickSearchField
              initialOpenLenderId={lenderDeepLinkId}
            />
          </div>
        </div>

        <div ref={addSectionRef}>
          <CollapsibleSection
            key={addDefaultOpen ? "add-open" : "add-closed"}
            variant="card"
            defaultOpen={addDefaultOpen}
            animated
            title={sectionTitle("Add lender")}
            description="Company is required; other fields optional. Blank entity type auto-classifies from name and niche."
            contentClassName="pt-1"
          >
            <AddLenderForm />
          </CollapsibleSection>
        </div>

        <div ref={uploadSectionRef}>
          <CollapsibleSection
            key={uploadDefaultOpen ? "upload-open" : "upload-closed"}
            variant="card"
            defaultOpen={uploadDefaultOpen}
            animated
            title={sectionTitle("Upload CSV")}
            description="Same headers as Comprehensive_Lender_List.csv — upsert by company + email or company + contact name."
            contentClassName="pt-1"
          >
            <CsvUploader />
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}
