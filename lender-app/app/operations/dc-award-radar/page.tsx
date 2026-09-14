import type { Metadata } from "next";
import { DcAwardRadarClient } from "./DcAwardRadarClient";

export const metadata: Metadata = {
  title: "DC award radar · Operations",
  description:
    "Nationwide DLC public data-center award signals with Hermes/ops contact enrichment. GHL sync is out of scope.",
};

export default function DcAwardRadarPage() {
  return <DcAwardRadarClient />;
}
