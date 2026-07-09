"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  setClientPortalSessionToken,
  setRememberedOrgScope,
} from "@/lib/clientPortalSession";
import {
  TrustErrorBlock,
  TrustListSkeleton,
} from "@/components/trust/TrustSurfaces";
import { formatPortalTrustError } from "@/lib/portalTrustErrors";

function MagicInner() {
  const router = useRouter();
  const params = useSearchParams();
  const exchange = useMutation(api.clientPortal.exchangeMagicLink);
  const [err, setErr] = useState<{
    title: string;
    detail?: string;
  } | null>(null);

  useEffect(() => {
    const t = params.get("t");
    if (!t) {
      setErr(formatPortalTrustError("Missing sign-in token."));
      return;
    }
    void (async () => {
      try {
        const res = await exchange({ token: t });
        setClientPortalSessionToken(res.sessionToken);
        setRememberedOrgScope(res.orgScope);
        router.replace("/portal/files");
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        setErr(formatPortalTrustError(raw));
      }
    })();
  }, [params, exchange, router]);

  if (err) {
    return (
      <div className="space-y-4 text-center">
        <TrustErrorBlock
          title={err.title}
          description={err.detail}
          className="text-left"
        />
        <a
          href="/portal/login"
          className="text-sm font-medium text-primary underline"
        >
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="py-6">
      <TrustListSkeleton rows={3} label="Completing sign-in" />
    </div>
  );
}

export default function PortalMagicPage() {
  return (
    <Suspense
      fallback={
        <div className="py-6">
          <TrustListSkeleton rows={2} label="Preparing sign-in" />
        </div>
      }
    >
      <MagicInner />
    </Suspense>
  );
}
