"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getClientPortalSessionToken } from "@/lib/clientPortalSession";
import { TrustListSkeleton } from "@/components/trust/TrustSurfaces";

export default function PortalIndexPage() {
  const router = useRouter();
  useEffect(() => {
    if (getClientPortalSessionToken()) {
      router.replace("/portal/files");
    } else {
      router.replace("/portal/login");
    }
  }, [router]);
  return (
    <div className="mx-auto max-w-md py-10">
      <TrustListSkeleton rows={2} label="Opening portal" />
    </div>
  );
}
