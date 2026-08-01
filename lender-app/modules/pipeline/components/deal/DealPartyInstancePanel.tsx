"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { DebouncedPartyFieldCell } from "@/modules/pipeline/components/deal/DebouncedPartyFieldCell";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  BORROWER_EMPLOYMENT_FIELDS,
  fieldsForPartyKind,
  type DealPartyBlockKind,
} from "@/modules/pipeline/lib/core/dealPartyFieldRegistry";
import { personNameFromBorrowerRow } from "@/lib/contacts/borrowerIdentityFromDeal";
import { personNameFromGuarantorRow } from "@/lib/contacts/guarantorIdentityFromDeal";
import type { DealWorkspaceUpdater } from "@/lib/file/dealSectionTypes";
import type { DealWorkspaceSheet } from "@/lib/file/dealSectionTypes";
import { DealPartyIdentityChip } from "@/modules/pipeline/components/deal/DealPartyIdentityChip";

function readRowString(row: unknown, key: string): string {
  if (!row || typeof row !== "object") return "";
  const val = (row as Record<string, unknown>)[key];
  return typeof val === "string" ? val : "";
}

export type DealPartyInstancePanelProps = {
  partyKind: DealPartyBlockKind;
  index: number;
  row: unknown;
  contactId?: Id<"contacts"> | null;
  entityId?: Id<"clients"> | null;
  draft: DealWorkspaceSheet;
  update: DealWorkspaceUpdater;
  onRemove: () => void;
  onChangeLink?: () => void;
  roleLabel?: string;
};

export function DealPartyInstancePanel({
  partyKind,
  index,
  row,
  contactId,
  entityId,
  draft,
  update,
  onRemove,
  onChangeLink,
  roleLabel,
}: DealPartyInstancePanelProps) {
  const [employmentOpen, setEmploymentOpen] = useState(false);
  const sheetKey = partyKind === "borrower" ? "borrowers" : "guarantors";
  const fields = fieldsForPartyKind(partyKind);

  const displayName = useMemo(() => {
    if (partyKind === "borrower") return personNameFromBorrowerRow(row);
    return personNameFromGuarantorRow(row);
  }, [partyKind, row]);

  const title =
    partyKind === "borrower"
      ? index === 0
        ? "Primary borrower"
        : `Co-borrower ${index + 1}`
      : `Guarantor ${index + 1}`;

  const patchRow = (patch: Record<string, string>) => {
    const rows = [...((draft[sheetKey] as unknown[] | undefined) ?? [])];
    const current =
      rows[index] != null && typeof rows[index] === "object"
        ? { ...(rows[index] as Record<string, unknown>) }
        : {};
    rows[index] = { ...current, ...patch };
    update(sheetKey, rows as DealWorkspaceSheet[typeof sheetKey]);
  };

  return (
    <article
      className="grid gap-2 rounded-dlc-md border border-gray-100 bg-dlc-surface p-2 lg:grid-cols-[minmax(148px,188px)_1fr] dark:border-gray-800"
      data-testid={`deal-party-instance-${partyKind}-${index}`}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-1 px-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {title}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label={`Remove ${title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <DealPartyIdentityChip
          displayName={displayName}
          roleLabel={roleLabel ?? title}
          contactId={contactId}
          entityId={entityId}
          onChangeLink={onChangeLink}
        />
      </div>

      <div className="min-w-0 space-y-2">
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 sm:grid-cols-3">
          {fields.map((def) => (
            <div
              key={def.registryKey}
              className={cn(
                def.colSpan === 2 && "sm:col-span-2",
                def.colSpan === 3 && "sm:col-span-3",
              )}
            >
              <DebouncedPartyFieldCell
                def={def}
                value={readRowString(row, def.rowKey)}
                onChange={(next) => patchRow({ [def.rowKey]: next })}
              />
            </div>
          ))}
        </div>

        {partyKind === "borrower" ? (
          <div>
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
              onClick={() => setEmploymentOpen((v) => !v)}
              aria-expanded={employmentOpen}
            >
              {employmentOpen ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              Employment
            </button>
            {employmentOpen ? (
              <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1.5 sm:grid-cols-3">
                {BORROWER_EMPLOYMENT_FIELDS.map((def) => (
                  <div
                    key={def.registryKey}
                    className={cn(def.colSpan === 2 && "sm:col-span-2")}
                  >
                    <DebouncedPartyFieldCell
                      def={def}
                      value={readRowString(row, def.rowKey)}
                      onChange={(next) => patchRow({ [def.rowKey]: next })}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
