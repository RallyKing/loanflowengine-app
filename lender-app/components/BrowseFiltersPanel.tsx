"use client";

import { useState } from "react";
import { Bookmark, ChevronDown, ChevronUp } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "./ui/Button";
import { Input, Label, Select, Textarea } from "./ui/Input";
import { parseMoneyInput } from "@/lib/parseMoneyInput";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { SectionErrorBoundary } from "./SectionErrorBoundary";
import {
  PresetsQueryErrorFallback,
  SavedFilterPresetsList,
} from "./SavedFilterPresetsList";
import { useOrgConvexQueryArgs } from "@/lib/useOrgConvexQueryArgs";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";

/** Advanced fields only; search, entity, and section live in the parent bar. */
export interface BrowseFilterForm {
  programKeywords: string;
  stateCode: string;
  matchDealAmount: string;
  lenderMaxAtLeast: string;
  lenderMinAtMost: string;
  ficoCleared: string;
  minRating: string;
  propertyTypeContains: string;
  ownerOrInvestor: string;
}

export const emptyBrowseFilterForm: BrowseFilterForm = {
  programKeywords: "",
  stateCode: "",
  matchDealAmount: "",
  lenderMaxAtLeast: "",
  lenderMinAtMost: "",
  ficoCleared: "",
  minRating: "",
  propertyTypeContains: "",
  ownerOrInvestor: "",
};

/** Never pass NaN/Infinity to Convex (would serialize badly and can fail validation). */
function fin(n: number | undefined): number | undefined {
  if (n === undefined) return undefined;
  return Number.isFinite(n) ? n : undefined;
}

export function formToListArgs(f: BrowseFilterForm) {
  return {
    programKeywords: f.programKeywords.trim() || undefined,
    stateCode: f.stateCode.trim() || undefined,
    matchDealAmount: fin(parseMoneyInput(f.matchDealAmount)),
    lenderMaxAtLeast: fin(parseMoneyInput(f.lenderMaxAtLeast)),
    lenderMinAtMost: fin(parseMoneyInput(f.lenderMinAtMost)),
    ficoCleared: (() => {
      const n = parseInt(f.ficoCleared.trim(), 10);
      return fin(Number.isFinite(n) && n > 0 ? n : undefined);
    })(),
    minRating: (() => {
      const n = parseInt(f.minRating, 10);
      return fin(Number.isFinite(n) && n >= 1 && n <= 5 ? n : undefined);
    })(),
    propertyTypeContains: f.propertyTypeContains.trim() || undefined,
    ownerOrInvestor: f.ownerOrInvestor.trim() || undefined,
  };
}

export function presetDocToAdvancedForm(
  p: Pick<
    Doc<"savedFilterPresets">,
    | "programKeywords"
    | "stateCode"
    | "matchDealAmount"
    | "lenderMaxAtLeast"
    | "lenderMinAtMost"
    | "ficoCleared"
    | "minRating"
    | "propertyTypeContains"
    | "ownerOrInvestor"
  >
): BrowseFilterForm {
  return {
    programKeywords: p.programKeywords ?? "",
    stateCode: p.stateCode ?? "",
    matchDealAmount: p.matchDealAmount != null ? String(p.matchDealAmount) : "",
    lenderMaxAtLeast:
      p.lenderMaxAtLeast != null ? String(p.lenderMaxAtLeast) : "",
    lenderMinAtMost:
      p.lenderMinAtMost != null ? String(p.lenderMinAtMost) : "",
    ficoCleared: p.ficoCleared != null ? String(p.ficoCleared) : "",
    minRating: p.minRating != null ? String(p.minRating) : "",
    propertyTypeContains: p.propertyTypeContains ?? "",
    ownerOrInvestor: p.ownerOrInvestor ?? "",
  };
}

export function buildListQueryArgs(
  search: string,
  entityType: string,
  section: string,
  adv: BrowseFilterForm
) {
  return {
    search: search.trim() || undefined,
    entityType: entityType || undefined,
    section: section || undefined,
    ...formToListArgs(adv),
  };
}

type Props = {
  form: BrowseFilterForm;
  onChange: (f: BrowseFilterForm) => void;
  onApplyPreset: (p: Doc<"savedFilterPresets">) => void;
  onSaveAsPreset: (name: string) => Promise<void>;
};

export function BrowseFiltersPanel({
  form,
  onChange,
  onApplyPreset,
  onSaveAsPreset,
}: Props) {
  const { confirm } = useOperationalConfirm();
  const orgScope = useOrgConvexQueryArgs();
  const [open, setOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [presetsBoundaryKey, setPresetsBoundaryKey] = useState(0);
  const deletePreset = useMutation(api.savedFilterLists.deletePreset);
  const { canUseHub, actionTitle } = useLiveConnection();

  function patch<K extends keyof BrowseFilterForm>(k: K, v: BrowseFilterForm[K]) {
    onChange({ ...form, [k]: v });
  }

  function clearAll() {
    onChange({ ...emptyBrowseFilterForm });
  }

  function hasActiveFilters() {
    return Object.values(formToListArgs(form)).some(
      (v) => v !== undefined && v !== null && v !== ""
    );
  }

  async function runSave() {
    const n = saveName.trim();
    if (!n) {
      window.alert("Enter a name for this smart list.");
      return;
    }
    setSaving(true);
    try {
      await onSaveAsPreset(n);
      setSaveName("");
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Could not save smart list."
      );
    } finally {
      setSaving(false);
    }
  }

  function requestDeletePreset(
    id: Id<"savedFilterPresets">,
    presetName?: string,
  ) {
    void (async () => {
      if (!orgScope) {
        window.alert("Select an organization to manage saved lists.");
        return;
      }
      const ok = await confirm({
        ...simpleDeleteConfirm(presetName?.trim() || "this smart list", {
          title: "Delete smart list",
          impact: "This saved filter preset is permanently removed.",
        }),
      });
      if (!ok) return;
      try {
        await deletePreset({ id, ...orgScope });
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Could not delete");
      }
    })();
  }

  return (
    <div className="rounded-lg border border-border/80 bg-card/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
      >
        <span className="flex items-center gap-2">
          <Bookmark className="h-4 w-4" />
          Smart filters &amp; saved lists
          {hasActiveFilters() && (
            <span className="rounded bg-primary/15 px-1.5 text-xs text-primary">
              active
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0" />
        )}
      </button>
      {open && (
        <div className="space-y-4 border-t p-3 pt-3">
          <p className="text-xs text-muted-foreground">
            Use with the search and entity/section bar above. Dollar fields
            accept <code className="rounded bg-muted px-0.5">500k</code>,{" "}
            <code className="rounded bg-muted px-0.5">1.5M</code>, or plain
            numbers. Program line = all terms must match programs / structured
            programs.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Programs (all must match)</Label>
              <Textarea
                className="min-h-[2.5rem] text-sm"
                placeholder="e.g. DSCR, construction, 504"
                rows={2}
                value={form.programKeywords}
                onChange={(e) => patch("programKeywords", e.target.value)}
              />
            </div>
            <div>
              <Label>My deal size — must fit range ($)</Label>
              <Input
                value={form.matchDealAmount}
                onChange={(e) => patch("matchDealAmount", e.target.value)}
                placeholder="e.g. 750000 or 750k"
              />
            </div>
            <div>
              <Label>Lender max loan at least ($)</Label>
              <Input
                value={form.lenderMaxAtLeast}
                onChange={(e) => patch("lenderMaxAtLeast", e.target.value)}
                placeholder="Lender publishes max ≥ this (e.g. 5M)"
              />
            </div>
            <div>
              <Label>Lender min loan at most ($)</Label>
              <Input
                value={form.lenderMinAtMost}
                onChange={(e) => patch("lenderMinAtMost", e.target.value)}
                placeholder="Published min ≤ this (e.g. 100k small deal)"
              />
            </div>
            <div>
              <Label>State</Label>
              <Input
                value={form.stateCode}
                onChange={(e) => patch("stateCode", e.target.value)}
                placeholder="FL, Florida, Texas…"
              />
            </div>
            <div>
              <Label>My FICO (lenders I qualify for)</Label>
              <Input
                value={form.ficoCleared}
                onChange={(e) => patch("ficoCleared", e.target.value)}
                placeholder="e.g. 700"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>Min star rating</Label>
              <Select
                value={form.minRating}
                onChange={(e) => patch("minRating", e.target.value)}
              >
                <option value="">Any</option>
                <option value="1">1+</option>
                <option value="2">2+</option>
                <option value="3">3+</option>
                <option value="4">4+</option>
                <option value="5">5</option>
              </Select>
            </div>
            <div>
              <Label>Property / collateral (keyword)</Label>
              <Input
                value={form.propertyTypeContains}
                onChange={(e) => patch("propertyTypeContains", e.target.value)}
                placeholder="e.g. multifamily, NNN, industrial"
              />
            </div>
            <div>
              <Label>Owner-occ vs investor (keyword)</Label>
              <Input
                value={form.ownerOrInvestor}
                onChange={(e) => patch("ownerOrInvestor", e.target.value)}
                placeholder="e.g. investor, owner-occup"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
              Clear smart filters
            </Button>
            <div className="flex w-full max-w-sm flex-1 items-end justify-end gap-2 sm:max-w-md">
              <div className="min-w-0 flex-1">
                <Label>Save current view as</Label>
                <Input
                  className="mt-0.5"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Smart list name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !saving) void runSave();
                  }}
                />
              </div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="shrink-0"
                disabled={!saveName.trim() || saving || !canUseHub}
                onClick={() => void runSave()}
                title={actionTitle(
                  "Save the current search and smart filters as a named list"
                )}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              Saved smart lists
            </div>
            <SectionErrorBoundary
              key={presetsBoundaryKey}
              fallback={
                <PresetsQueryErrorFallback
                  onRetry={() =>
                    setPresetsBoundaryKey((k) => k + 1)
                  }
                />
              }
            >
              <SavedFilterPresetsList
                onApplyPreset={onApplyPreset}
                onRequestDelete={requestDeletePreset}
                canUseHub={canUseHub}
                actionTitle={actionTitle}
              />
            </SectionErrorBoundary>
          </div>
        </div>
      )}
    </div>
  );
}
