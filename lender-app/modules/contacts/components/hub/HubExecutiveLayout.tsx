"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { hubDetailStyles } from "@/components/contacts/hub/hubDetailStyles";

export type HubExecutiveLayoutProps = {
  identity: ReactNode;
  operations: ReactNode;
  footer?: ReactNode;
  banner?: ReactNode;
  className?: string;
};

export function HubExecutiveLayout({
  identity,
  operations,
  footer,
  banner,
  className,
}: HubExecutiveLayoutProps) {
  return (
    <div className={cn(hubDetailStyles.shell, className)} data-testid="hub-executive-layout">
      {banner}
      <div className={hubDetailStyles.grid}>
        <section className={hubDetailStyles.identityZone}>{identity}</section>
        <section className={hubDetailStyles.operationsZone}>{operations}</section>
      </div>
      {footer ? (
        <div className="mt-auto border-t border-border/80 pt-6">{footer}</div>
      ) : null}
    </div>
  );
}
