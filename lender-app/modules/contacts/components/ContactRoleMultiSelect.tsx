"use client";

import { cn } from "@/lib/utils";
import type { ContactRole } from "@/lib/contact/contactRoles";
import {
  contactRoleDisplayName,
  sanitizeContactRoleIds,
} from "@/lib/contact/contactRoles";

type ContactRoleMultiSelectProps = {
  id?: string;
  contactRoles: readonly ContactRole[];
  value: string[];
  onChange: (roleIds: string[]) => void;
  disabled?: boolean;
  "aria-label": string;
  className?: string;
};

/**
 * Phase 25.7b — master contact CRM roles (multi-select checkboxes).
 */
export function ContactRoleMultiSelect({
  id,
  contactRoles,
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel,
  className,
}: ContactRoleMultiSelectProps) {
  const roleIds = sanitizeContactRoleIds(value);
  const selected = new Set(roleIds);

  const toggle = (roleId: string) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(roleId)) {
      if (next.size <= 1) return;
      next.delete(roleId);
    } else {
      next.add(roleId);
    }
    onChange([...next]);
  };

  return (
    <fieldset
      id={id}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        "mt-1.5 space-y-2 rounded-md border border-input bg-background p-3",
        className,
      )}
    >
      <legend className="sr-only">{ariaLabel}</legend>
      {contactRoles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No roles configured.</p>
      ) : (
        contactRoles.filter(Boolean).map((role) => {
          if (!role?.id) return null;
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
              <span>
                {contactRoleDisplayName(contactRoles, role.id) ?? role.id}
              </span>
            </label>
          );
        })
      )}
    </fieldset>
  );
}
