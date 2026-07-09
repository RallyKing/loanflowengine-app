"use client";

/**
 * Client helpers that mirror legacy third-party auth hook shapes so UI can stay
 * consistent while using the cookie-backed `SessionProvider` / `useViewer`.
 */
import { ReactNode, useCallback, useEffect, useMemo } from "react";
import { useViewer, type ClientViewer } from "./sessionContext";
import { useAuthStateOptional } from "@/lib/auth/authStateContext";
import { isCorruptInternalAuthUserKey } from "@/lib/auth/sessionIntegrity";

type AuthShape = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  orgId: string | null;
  orgRole: string | null;
  orgSlug: string | null;
  sessionId: string | null;
  /** Convex internal auth: `authUsers.isGlobalAdmin` from session validate. */
  isGlobalAdmin: boolean;
  signOut: (opts?: { redirectUrl?: string }) => Promise<void>;
  has: (...args: unknown[]) => boolean;
  getToken: () => Promise<string | null>;
};

type UserShape = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: {
    id: string;
    fullName: string;
    firstName: string;
    lastName: string;
    imageUrl: string;
    primaryEmailAddress: { emailAddress: string } | null;
    emailAddresses: Array<{ emailAddress: string }>;
    publicMetadata: Record<string, unknown>;
  } | null;
};

type OrgShape = {
  isLoaded: boolean;
  organization: {
    id: string;
    name: string;
    slug: string | null;
    imageUrl: string;
    membersCount: number;
    publicMetadata: Record<string, unknown>;
  } | null;
  membership: {
    role: string;
    permissions: string[];
    publicMetadata: Record<string, unknown>;
  } | null;
};

type OrgListShape = {
  isLoaded: boolean;
  userMemberships: {
    data: Array<{
      id: string;
      role: string;
      organization: { id: string; name: string; slug: string | null };
    }>;
    isLoading: boolean;
  };
  setActive: (args: { organization: string | null }) => Promise<void>;
  createOrganization: (args: { name: string }) => Promise<{ id: string }>;
};

function viewerToUser(v: ClientViewer) {
  const [first, ...rest] = v.fullName.split(" ");
  return {
    id: v.userKey,
    fullName: v.fullName,
    firstName: first ?? "",
    lastName: rest.join(" "),
    imageUrl: "",
    primaryEmailAddress: { emailAddress: v.email },
    emailAddresses: [{ emailAddress: v.email }],
    publicMetadata: {},
  };
}

function viewerToOrg(v: ClientViewer) {
  return {
    id: v.organizationId,
    name: v.organizationName,
    slug: null,
    imageUrl: "",
    membersCount: 1,
    publicMetadata: {},
  };
}

function viewerToMembership(v: ClientViewer) {
  return {
    role: v.workspaceRole,
    permissions: [],
    publicMetadata: {},
  };
}

export function useAuth(): AuthShape {
  const v = useViewer();
  const auth = useAuthStateOptional();
  const signOut = useCallback(async (opts?: { redirectUrl?: string }) => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("lender.activeOrganizationId");
        window.dispatchEvent(new CustomEvent("lender-active-org-changed"));
      } catch {
        /* private mode */
      }
    }
    if (typeof window !== "undefined") {
      window.location.href = opts?.redirectUrl ?? "/login";
    }
  }, []);
  const has = useCallback(() => Boolean(v), [v]);
  const getToken = useCallback(async () => null, []);

  const isLoaded =
    auth == null ? true : !auth.viewer || auth.clientHydrated;
  const sessionOk =
    auth == null ||
    auth.state === "loading" ||
    (auth.state !== "expired" &&
      auth.state !== "revoked" &&
      auth.state !== "unauthenticated");
  const isSignedIn = Boolean(v) && sessionOk;

  useEffect(() => {
    if (auth != null && !auth.clientHydrated) return;
    if (!v?.userKey) return;
    if (!isCorruptInternalAuthUserKey(v.userKey)) return;
    void signOut({ redirectUrl: "/login?reason=session_recovery" });
  }, [auth, v?.userKey, signOut]);

  return {
    isLoaded,
    isSignedIn,
    userId: v?.userKey ?? null,
    orgId: v?.organizationId ?? null,
    orgRole: v?.workspaceRole ?? null,
    orgSlug: null,
    sessionId: v ? "session" : null,
    isGlobalAdmin: v?.isGlobalAdmin === true,
    signOut,
    has,
    getToken,
  };
}

export function useUser(): UserShape {
  const v = useViewer();
  const { isLoaded, isSignedIn } = useAuth();
  return {
    isLoaded,
    isSignedIn,
    user: v ? viewerToUser(v) : null,
  };
}

export function useOrganization(): OrgShape {
  const v = useViewer();
  const { isLoaded } = useAuth();
  return {
    isLoaded,
    organization: v ? viewerToOrg(v) : null,
    membership: v ? viewerToMembership(v) : null,
  };
}

export function useOrganizationList(): OrgListShape {
  const v = useViewer();
  const { isLoaded } = useAuth();
  const data = v
    ? [
        {
          id: v.organizationId,
          role: v.workspaceRole,
          organization: {
            id: v.organizationId,
            name: v.organizationName,
            slug: null,
          },
        },
      ]
    : [];
  return useMemo(
    () => ({
      isLoaded,
      userMemberships: { data, isLoading: false },
      setActive: async () => {},
      createOrganization: async ({ name }) => ({ id: name }),
    }),
    // `data` is derived from `v` above; stable when viewer ids unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- data identity toggles each render
    [isLoaded, v?.organizationId, v?.organizationName, v?.workspaceRole],
  );
}

export function SessionChromeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SignedIn({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  return isSignedIn ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  return isSignedIn ? null : <>{children}</>;
}

export function Show({
  when,
  children,
}: {
  when: "signed-in" | "signed-out";
  children: ReactNode;
}) {
  const { isSignedIn } = useAuth();
  const show = when === "signed-in" ? isSignedIn : !isSignedIn;
  return show ? <>{children}</> : null;
}

export function UserButton({
  afterSignOutUrl,
}: {
  afterSignOutUrl?: string;
} = {}) {
  const v = useViewer();
  const onSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    try {
      window.localStorage.removeItem("lender.activeOrganizationId");
      window.dispatchEvent(new CustomEvent("lender-active-org-changed"));
    } catch {
      /* ignore */
    }
    window.location.href = afterSignOutUrl ?? "/login";
  };
  if (!v) return null;
  return (
    <button
      type="button"
      onClick={onSignOut}
      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/60"
      title={`${v.fullName} — Sign out`}
    >
      Sign out
    </button>
  );
}

function RedirectToSignIn() {
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
  return null;
}

function RedirectToSignUp() {
  if (typeof window !== "undefined") {
    window.location.href = "/sign-up";
  }
  return null;
}

export const SignIn = RedirectToSignIn;
export const SignUp = RedirectToSignUp;
export function OrganizationProfile(_props: Record<string, unknown> = {}) {
  return null;
}
export function OrganizationSwitcher(_props: Record<string, unknown> = {}) {
  return null;
}
export function CreateOrganization(_props: Record<string, unknown> = {}) {
  return null;
}
export function useSessionShell() {
  return {
    loaded: true,
    setActive: async (_args?: { organization?: string | null }) => {},
    signOut: async (_opts?: { redirectUrl?: string }) => {},
    openUserProfile: () => {},
    openSignIn: () => {
      if (typeof window !== "undefined") window.location.href = "/login";
    },
    openSignUp: () => {
      if (typeof window !== "undefined") window.location.href = "/sign-up";
    },
  };
}
export function SignInButton({ children }: { children?: ReactNode } = {}) {
  return (
    <a href="/login" className="contents">
      {children}
    </a>
  );
}
export function SignUpButton({ children }: { children?: ReactNode } = {}) {
  return (
    <a href="/sign-up" className="contents">
      {children}
    </a>
  );
}
export const SignOutButton = ({ children }: { children?: ReactNode } = {}) => {
  const onClick = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    try {
      window.localStorage.removeItem("lender.activeOrganizationId");
      window.dispatchEvent(new CustomEvent("lender-active-org-changed"));
    } catch {
      /* ignore */
    }
    window.location.href = "/login";
  };
  return (
    <button type="button" onClick={onClick} className="contents">
      {children}
    </button>
  );
};
