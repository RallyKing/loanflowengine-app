"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Premium SaaS content column — centered max width with Bootstrap-style gutters.
 * Use for pipeline file chrome + constrained tabs (Overview, Deal Info, Settings, …).
 */
export const PREMIUM_WORKSPACE_CONTAINER_CLASS =
  "mx-auto w-full min-w-0 max-w-7xl px-4 sm:px-6 lg:px-8";

/** Document Vault — full available width inside the workspace scrollport. */
export const PREMIUM_WORKSPACE_FULL_BLEED_CLASS =
  "w-full min-w-0 max-w-none";

/** @deprecated Use PREMIUM_WORKSPACE_CONTAINER_CLASS — alias for legacy imports. */
export const WORKSPACE_CONTENT_MAX_CLASS = "max-w-7xl";

export type WorkspaceContentWidth = "standard" | "fullBleed";

export function workspaceContentContainerClass(
  className?: string,
  width: WorkspaceContentWidth = "standard",
) {
  return cn(
    "min-w-0 overflow-x-clip",
    width === "fullBleed"
      ? PREMIUM_WORKSPACE_FULL_BLEED_CLASS
      : PREMIUM_WORKSPACE_CONTAINER_CLASS,
    className,
  );
}

type WorkspaceContentContainerProps = {
  children: ReactNode;
  className?: string;
  /** `fullBleed` for Document Vault; `standard` for centered premium tabs. */
  width?: WorkspaceContentWidth;
};

export function WorkspaceContentContainer({
  children,
  className,
  width = "standard",
}: WorkspaceContentContainerProps) {
  return (
    <div className={workspaceContentContainerClass(className, width)}>{children}</div>
  );
}
