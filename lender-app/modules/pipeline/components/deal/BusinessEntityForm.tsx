"use client";

import { useMemo } from "react";
import { Field } from "@/components/intake/ui/Field";
import { DebouncedInput, DebouncedSelect } from "@/components/ui/DebouncedInput";
import type { DealWorkspaceSheet, DealWorkspaceUpdater } from "@/lib/file/dealSectionTypes";
import { cn } from "@/lib/cn";

const ENTITY_TYPE_OPTIONS = [
  "Sole Proprietor",
  "General Partnership",
  "LP",
  "LLP",
  "LLC",
  "S-Corp",
  "C-Corp",
  "Non-Profit",
  "Trust",
] as const;

const compactInputClass =
  "h-8 py-1 text-xs rounded-dlc-sm border-gray-100 dark:border-gray-800";

export type BusinessEntityFormProps = {
  draft: DealWorkspaceSheet;
  update: DealWorkspaceUpdater;
  /** Canonical entity row — seeds display when draft.business lags after link. */
  canonicalEntity?: {
    displayName?: string;
    companyName?: string | null;
    ein?: string | null;
    entityTypeLabel?: string | null;
    stateOfIncorporation?: string | null;
    dateOfFormation?: number | null;
  } | null;
};

function readBusinessString(
  business: Record<string, unknown> | undefined,
  key: string,
  fallback = "",
): string {
  const val = business?.[key];
  return typeof val === "string" ? val : fallback;
}

function formatFormationDate(ms: number | null | undefined): string {
  if (!ms) return "";
  try {
    return new Date(ms).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export function BusinessEntityForm({
  draft,
  update,
  canonicalEntity,
}: BusinessEntityFormProps) {
  const values = useMemo(() => {
    const business = (draft.business ?? {}) as Record<string, unknown>;
    return {
      legalName:
        readBusinessString(business, "legalName") ||
        canonicalEntity?.displayName ||
        "",
      dba:
        readBusinessString(business, "dba") ||
        (canonicalEntity?.companyName &&
        canonicalEntity.companyName !== canonicalEntity.displayName
          ? canonicalEntity.companyName
          : "") ||
        "",
      ein: readBusinessString(business, "ein") || canonicalEntity?.ein || "",
      entityType:
        readBusinessString(business, "entityType") ||
        canonicalEntity?.entityTypeLabel ||
        "",
      stateOfFormation:
        readBusinessString(business, "stateOfFormation") ||
        canonicalEntity?.stateOfIncorporation ||
        "",
      formationDate:
        readBusinessString(business, "formationDate") ||
        formatFormationDate(canonicalEntity?.dateOfFormation),
    };
  }, [draft.business, canonicalEntity]);

  const patchBusiness = (patch: Record<string, string>) => {
    const current = (draft.business ?? {}) as Record<string, unknown>;
    update("business", { ...current, ...patch } as DealWorkspaceSheet["business"]);
  };

  return (
    <div
      className="rounded-dlc-md border border-gray-100 bg-dlc-surface p-2.5 dark:border-gray-800"
      data-testid="business-entity-form"
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Entity details
      </p>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 sm:grid-cols-3">
        <Field label="Company name" className={cn("gap-1", "sm:col-span-2")}>
          <DebouncedInput
            className={compactInputClass}
            value={values.legalName}
            onCommit={(next) => patchBusiness({ legalName: next })}
            placeholder="Legal entity name"
            data-testid="entity-legal-name"
          />
        </Field>
        <Field label="DBA" className="gap-1">
          <DebouncedInput
            className={compactInputClass}
            value={values.dba}
            onCommit={(next) => patchBusiness({ dba: next })}
            placeholder="Doing business as"
            data-testid="entity-dba"
          />
        </Field>
        <Field label="EIN / Tax ID" className="gap-1">
          <DebouncedInput
            className={compactInputClass}
            value={values.ein}
            onCommit={(next) => patchBusiness({ ein: next })}
            placeholder="XX-XXXXXXX"
            data-testid="entity-ein"
          />
        </Field>
        <Field label="Entity type" className="gap-1">
          <DebouncedSelect
            className={compactInputClass}
            value={values.entityType}
            onCommit={(next) => patchBusiness({ entityType: next })}
            data-testid="entity-type"
          >
            <option value="">—</option>
            {ENTITY_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </DebouncedSelect>
        </Field>
        <Field label="State of incorporation" className="gap-1">
          <DebouncedInput
            className={compactInputClass}
            value={values.stateOfFormation}
            onCommit={(next) => patchBusiness({ stateOfFormation: next })}
            placeholder="e.g. DE, TX"
            data-testid="entity-state"
          />
        </Field>
        <Field label="Date of incorporation" className="gap-1">
          <DebouncedInput
            type="date"
            className={compactInputClass}
            value={values.formationDate}
            onCommit={(next) => patchBusiness({ formationDate: next })}
            data-testid="entity-formation-date"
          />
        </Field>
      </div>
    </div>
  );
}
