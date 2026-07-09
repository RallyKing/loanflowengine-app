"use client";

import type { ReactNode } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { OP_BORDER_SOFT, OP_TEXT_SECONDARY } from "@/lib/ui/operationalTokens";

type CollaboratorSharePresentationProps = {
  title?: string;
  ownerLine?: string;
  canManage?: boolean;
  error?: string | null;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  "data-testid"?: string;
};

/** Unified sharing panel chrome — ACL/mutations stay in route modules. */
export function CollaboratorSharePresentation({
  title = "Collaborators",
  ownerLine,
  canManage = false,
  error,
  children,
  footer,
  className,
  "data-testid": testId = "collaborator-share-panel",
}: CollaboratorSharePresentationProps) {
  return (
    <section
      className={cn("space-y-3", className)}
      data-testid={testId}
      aria-labelledby={`${testId}-title`}
    >
      <header className="flex items-start gap-2">
        <Users
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h3
            id={`${testId}-title`}
            className="text-sm font-semibold text-foreground"
          >
            {title}
          </h3>
          {ownerLine ? (
            <p className={cn("mt-0.5", OP_TEXT_SECONDARY)}>{ownerLine}</p>
          ) : null}
          {!canManage ? (
            <p className={cn("mt-0.5", OP_TEXT_SECONDARY)}>
              View-only — you cannot change sharing.
            </p>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className={cn(
          "space-y-3 rounded-lg border bg-muted/10 p-3",
          OP_BORDER_SOFT,
        )}
      >
        {children}
      </div>

      {footer ? <div className="border-t border-border/50 pt-2">{footer}</div> : null}
    </section>
  );
}

export function CollaboratorListRow({
  primary,
  secondary,
  actions,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="flex min-w-0 items-start justify-between gap-2 border-b border-border/40 py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {primary}
        </div>
        {secondary ? (
          <div className={cn("mt-0.5 truncate", OP_TEXT_SECONDARY)}>
            {secondary}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1">{actions}</div>
      ) : null}
    </li>
  );
}

export function CollaboratorPendingChip({
  label,
  actions,
}: {
  label: string;
  actions?: ReactNode;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground">
      <span className="truncate">{label}</span>
      {actions}
    </span>
  );
}
