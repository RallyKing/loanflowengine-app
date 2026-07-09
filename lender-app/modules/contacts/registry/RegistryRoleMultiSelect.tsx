"use client";

import { cn } from "@/lib/cn";
import {
  REGISTRY_ROLE_CATALOG,
  type RegistryRoleId,
} from "@/lib/registry/universalRoles";

type RegistryRoleMultiSelectProps = {
  id?: string;
  value: RegistryRoleId[];
  onChange: (roleIds: RegistryRoleId[]) => void;
  disabled?: boolean;
  /** When false, role chips are read-only (entity / lender rows). */
  editable?: boolean;
  "aria-label": string;
  className?: string;
};

/** Phase Registry — universal role multi-select (master-profile scope). */
export function RegistryRoleMultiSelect({
  id,
  value,
  onChange,
  disabled,
  editable = true,
  "aria-label": ariaLabel,
  className,
}: RegistryRoleMultiSelectProps) {
  const selected = new Set(value);
  const options = REGISTRY_ROLE_CATALOG.filter(
    (role) => role.scope === "master" || role.scope === "both",
  );

  const toggle = (roleId: RegistryRoleId) => {
    if (disabled || !editable) return;
    const next = new Set(selected);
    if (next.has(roleId)) {
      if (next.size <= 1) return;
      next.delete(roleId);
    } else {
      next.add(roleId);
    }
    onChange([...next]);
  };

  if (!editable) {
    return (
      <div className={cn("space-y-1", className)}>
        <p className="text-dlc-label-md font-medium text-muted-foreground">Roles</p>
        <p className="text-sm text-muted-foreground">
          {value.map((id) => options.find((r) => r.id === id)?.displayName ?? id).join(", ") ||
            "—"}
        </p>
        <p className="text-xs text-muted-foreground">
          Roles for this record type are assigned automatically in the registry.
        </p>
      </div>
    );
  }

  return (
    <fieldset
      id={id}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        "space-y-2 rounded-dlc-lg border border-border bg-background p-3",
        className,
      )}
    >
      <legend className="text-dlc-label-md font-medium text-foreground">
        Roles
      </legend>
      {options.map((role) => {
        const checked = selected.has(role.id);
        return (
          <label
            key={role.id}
            className="flex min-h-10 cursor-pointer items-center gap-3 text-sm"
          >
            <input
              type="checkbox"
              className="size-4 shrink-0 rounded border-input"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(role.id)}
            />
            <span>{role.displayName}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
