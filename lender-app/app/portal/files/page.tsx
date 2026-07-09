"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  clearClientPortalSessionToken,
  getClientPortalSessionToken,
} from "@/lib/clientPortalSession";
import { useRouter } from "next/navigation";
import { TrustListSkeleton } from "@/components/trust/TrustSurfaces";

export default function PortalFilesPage() {
  const router = useRouter();
  const token = getClientPortalSessionToken();

  useEffect(() => {
    if (!getClientPortalSessionToken()) {
      router.replace("/portal/login");
    }
  }, [router]);

  const data = useQuery(
    api.clientPortal.listMyFiles,
    token ? { sessionToken: token } : "skip",
  );

  if (!token) {
    return null;
  }

  if (data?.status === "unauthorized") {
    clearClientPortalSessionToken();
    router.replace("/portal/login");
    return null;
  }

  if (!data || data.status !== "ok") {
    return <TrustListSkeleton rows={5} label="Loading your files" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Your files</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as{" "}
          <span className="font-medium text-foreground">{data.emailKey}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Each item below is a file your lender shared with this email. Opening a
          file may be logged for compliance.
        </p>
      </div>
      <ul className="space-y-3">
        {data.files.map((f) => (
          <li key={f._id}>
            <Link
              href={`/portal/file/${f._id}`}
              className="block rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <div className="font-medium text-foreground">{f.fileName}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {"workspaceName" in f && f.workspaceName ? (
                  <span className="font-medium text-foreground/80">
                    {f.workspaceName}
                  </span>
                ) : null}
                <span>Stage: {f.status}</span>
                {f.propertyAddress ? (
                  <span className="line-clamp-1">{f.propertyAddress}</span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {data.files.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No files are shared with this email yet.
        </p>
      ) : null}
    </div>
  );
}
