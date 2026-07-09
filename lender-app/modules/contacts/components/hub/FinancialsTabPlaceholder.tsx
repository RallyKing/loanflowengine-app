"use client";

import { Landmark } from "lucide-react";
import { HubTabPlaceholder } from "@/components/contacts/hub/HubTabPlaceholder";

export function FinancialsTabPlaceholder() {
  return (
    <HubTabPlaceholder
      icon={Landmark}
      title="Financials command center"
      description="Schedule of Real Estate, PFS, business debt schedules, and credit profile will live here — synced bidirectionally with pipeline files."
    />
  );
}
