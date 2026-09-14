import type { Metadata } from "next";
import { DcAwardRadarClient } from "./DcAwardRadarClient";

export const metadata: Metadata = {
  title: "DC award radar · Operations",
  description:
    "Read-only DLC public data-center award signals (Phase 2). GHL sync is out of scope.",
};

export default function DcAwardRadarPage() {
  return <DcAwardRadarClient />;
}
