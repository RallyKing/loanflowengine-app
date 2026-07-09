"use client";

import {
  collaboratorRoleBadgeClass,
  collaboratorRoleBadgeLabel,
  roleBadgeBaseClass,
} from "@/lib/ui/roleBadgeTokens";

export function EventCollaboratorRoleBadge({
  role,
  className,
}: {
  role: string;
  className?: string;
}) {
  return (
    <span
      className={roleBadgeBaseClass(
        collaboratorRoleBadgeClass(role),
        className,
      )}
    >
      {collaboratorRoleBadgeLabel(role)}
    </span>
  );
}
