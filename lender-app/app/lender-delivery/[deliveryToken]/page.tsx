import type { ReactNode } from "react";
import { LenderDeliveryPortalClient } from "./LenderDeliveryPortalClient";

export const dynamic = "force-dynamic";

export default async function LenderDeliveryPage({
  params,
}: {
  params: Promise<{ deliveryToken: string }>;
}) {
  const { deliveryToken } = await params;
  if (!deliveryToken?.trim()) {
    return <DeliveryMessage tone="error">Invalid delivery link.</DeliveryMessage>;
  }
  return <LenderDeliveryPortalClient deliveryToken={deliveryToken.trim()} />;
}

function DeliveryMessage({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error";
}) {
  const toneClass =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-neutral-200 bg-neutral-50 text-neutral-800";
  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-6">
      <div
        className={`max-w-lg rounded-2xl border p-6 text-center text-sm ${toneClass}`}
      >
        {children}
      </div>
    </div>
  );
}
