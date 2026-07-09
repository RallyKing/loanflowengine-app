"use client";

import { createContext, ReactNode, useContext, useMemo } from "react";
import type { ViewerSession } from "./sessionAuth";
import type { SuperuserImpersonationState } from "@/lib/superuserImpersonation";

export type ClientViewer = {
  userKey: string;
  email: string;
  fullName: string;
  organizationId: string;
  organizationName: string;
  workspaceRole: "workspace:admin" | "workspace:member";
  isGlobalAdmin: boolean;
  canSuperuserImpersonate: boolean;
  homeOrganizationId: string;
  homeOrganizationName: string;
  impersonation: SuperuserImpersonationState | null;
};

const SessionCtx = createContext<ClientViewer | null>(null);

export function SessionProvider({
  viewer,
  children,
}: {
  viewer: ViewerSession | null;
  children: ReactNode;
}) {
  const userKey = viewer?.userKey;
  const email = viewer?.email;
  const fullName = viewer?.fullName;
  const organizationId = viewer?.organizationId;
  const organizationName = viewer?.organizationName;
  const workspaceRole = viewer?.workspaceRole;
  const isGlobalAdmin = viewer?.isGlobalAdmin === true;
  const canSuperuserImpersonate = viewer?.canSuperuserImpersonate === true;
  const homeOrganizationId =
    viewer?.homeOrganizationId ?? viewer?.organizationId ?? "";
  const homeOrganizationName =
    viewer?.homeOrganizationName ?? viewer?.organizationName ?? "";
  const impersonation = viewer?.impersonation ?? null;

  const value: ClientViewer | null = useMemo(() => {
    if (!userKey) return null;
    return {
      userKey,
      email: email ?? "",
      fullName: fullName ?? "",
      organizationId: organizationId ?? "",
      organizationName: organizationName ?? "",
      workspaceRole: workspaceRole ?? "workspace:member",
      isGlobalAdmin,
      canSuperuserImpersonate,
      homeOrganizationId,
      homeOrganizationName,
      impersonation,
    };
  }, [
    userKey,
    email,
    fullName,
    organizationId,
    organizationName,
    workspaceRole,
    isGlobalAdmin,
    canSuperuserImpersonate,
    homeOrganizationId,
    homeOrganizationName,
    impersonation,
  ]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useViewer(): ClientViewer | null {
  return useContext(SessionCtx);
}
