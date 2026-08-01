"use client";

import { Field } from "@/components/intake/ui/Field";
import { DebouncedInput, DebouncedSelect } from "@/components/ui/DebouncedInput";
import type { DealPartyFieldDef } from "@/modules/pipeline/lib/core/dealPartyFieldRegistry";

const compactInputClass =
  "h-8 py-1 text-xs rounded-dlc-sm border-gray-100 dark:border-gray-800";

export type DebouncedPartyFieldCellProps = {
  def: DealPartyFieldDef;
  value: string;
  onChange: (next: string) => void;
};

/** Standalone field cell — each DebouncedInput owns its hook tree. */
export function DebouncedPartyFieldCell({
  def,
  value,
  onChange,
}: DebouncedPartyFieldCellProps) {
  const inputType =
    def.kind === "email"
      ? "email"
      : def.kind === "tel"
        ? "tel"
        : def.kind === "date"
          ? "date"
          : "text";

  if (def.kind === "select" && def.selectOptions) {
    return (
      <Field label={def.label} className="gap-1">
        <DebouncedSelect
          className={compactInputClass}
          value={value}
          onCommit={onChange}
        >
          <option value="">—</option>
          {def.selectOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </DebouncedSelect>
      </Field>
    );
  }

  return (
    <Field label={def.label} className="gap-1">
      <DebouncedInput
        type={inputType}
        className={compactInputClass}
        value={value}
        onCommit={onChange}
      />
    </Field>
  );
}
